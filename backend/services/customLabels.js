import { randomUUID } from 'node:crypto';
import fetch from 'node-fetch';
import db from '../db/database.js';
import { searchDiscogs, getLabel } from './discogsService.js';

// Labels that are not (or not only) on Discogs (2026-10-22): a person pastes a label's Bandcamp page,
// sees what we read from it plus any similar labels we already know, and confirms before anything is saved.
// A saved label's releases live in discogs_catalogue under kind 'label' and entity_id = -custom_labels.id
// (negative, so they can never collide with a Discogs id), item_type 'bandcamp', with their page in `link`.

db.exec(`CREATE TABLE IF NOT EXISTS custom_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  image TEXT,
  location TEXT,
  bio TEXT,
  discogs_id INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
)`);
// `link` is ours; `combed_at` belongs to the duplicate comber (same statement as catalogueComber.js) and is repeated so this works whichever module loads first.
for (const col of ['link TEXT', 'combed_at TEXT']) { try { db.exec(`ALTER TABLE discogs_catalogue ADD COLUMN ${col}`); } catch { /* already there */ } }

const UA = { 'User-Agent': 'LNV/0.1 (+https://github.com/gabrieljcdev/LNV)' };
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const previews = new Map(); // previewId -> { userId, at, data }

const decodeHtml = s => (s || '').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const metaTag = (html, prop) => decodeHtml(html.match(new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`, 'i'))?.[1] || '');
// "Deadline Records", "DEADLINE Recordings" and "Deadline" are one name for matching.
export const nameKey = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(records?|recordings?|recs?|music|label|the)\b/g, ' ').replace(/\s+/g, ' ').trim();

export class LabelError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

// https://name.bandcamp.com/... -> { host, origin } or a LabelError. Only Bandcamp accounts for now.
export function parseBandcampUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new LabelError('That does not look like a link.'); }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new LabelError('Paste a link to the label\'s Bandcamp page.');
  if (!host.endsWith('.bandcamp.com') || host === 'www.bandcamp.com') throw new LabelError('Paste the label\'s own Bandcamp page, like https://name.bandcamp.com');
  return { host, origin: `https://${host}` };
}

async function readBandcamp({ host, origin }) {
  let html = '';
  for (const path of ['/music', '/']) {
    const res = await fetch(origin + path, { headers: UA, signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (res?.ok) { html = await res.text(); if (html.includes('data-client-items')) break; }
  }
  if (!html) throw new LabelError('Could not read that Bandcamp page.', 502);
  const name = (metaTag(html, 'og:site_name') || metaTag(html, 'og:title')).trim();
  if (!name) throw new LabelError('That page does not look like a Bandcamp account.');
  let items = [];
  try { items = JSON.parse(decodeHtml(html.match(/data-client-items="([^"]*)"/)?.[1] || '[]')); } catch { /* grid not in the page */ }
  const abs = u => (u.startsWith('http') ? u : origin + u);
  // The first screenful is real <li> markup; data-client-items carries the rest. Read both, once per id.
  const byId = new Map();
  for (const m of html.matchAll(/<li data-item-id="(?:album|track)-(\d+)"[\s\S]*?<\/li>/g)) {
    const li = m[0];
    const link = li.match(/<a href="([^"]+)"/)?.[1];
    const title = decodeHtml((li.match(/<p class="title">\s*([^<]+?)\s*(?:<|$)/)?.[1] || '')).trim();
    if (!link || !title) continue;
    byId.set(Number(m[1]), {
      id: Number(m[1]), title, link: abs(link),
      artist: decodeHtml(li.match(/class="artist-override">\s*([^<]+?)\s*</)?.[1] || '').trim() || null,
      // Items below the fold are lazy-loaded: the real image is in data-original, src is a 1px placeholder.
      thumb: [li.match(/data-original="(https:[^"]+)"/)?.[1], li.match(/<img[^>]*\ssrc="(https:[^"]+)"/)?.[1]].find(Boolean) || null,
    });
  }
  for (const i of items) {
    if (!i?.id || !i.page_url || !i.title || byId.has(Number(i.id))) continue;
    byId.set(Number(i.id), {
      id: Number(i.id), title: String(i.title), artist: i.artist ? String(i.artist) : null,
      thumb: i.art_id ? `https://f4.bcbits.com/img/a${i.art_id}_2.jpg` : null, link: abs(i.page_url),
    });
  }
  const releases = [...byId.values()].slice(0, 2000);
  return {
    sourceKey: `bandcamp:${host}`, host, name, url: origin,
    image: metaTag(html, 'og:image') || null,
    bio: metaTag(html, 'og:description').slice(0, 600) || null,
    location: decodeHtml(html.match(/class="location[^"]*">\s*([^<]+?)\s*</)?.[1] || '') || null,
    releases,
  };
}

// Labels we already know that this might be. Never guesses silently: the person decides.
async function similarLabels(page) {
  const key = nameKey(page.name);
  const out = [];
  for (const r of db.prepare('SELECT id, name, url, image FROM custom_labels').all()) {
    if (nameKey(r.name) === key) out.push({ source: 'lnv', id: r.id, name: r.name, thumb: r.image, url: r.url, nameMatch: 'same' });
  }
  try {
    const found = (await searchDiscogs(page.name, 'label')).results || [];
    for (const r of found.slice(0, 5)) {
      const k = nameKey(r.title);
      const nameMatch = k === key ? 'same' : (k && key && (k.includes(key) || key.includes(k))) ? 'similar' : null;
      if (!nameMatch) continue;
      let sameBandcamp = false; // Discogs lists this Bandcamp page on the label's own profile: as good as certain
      try { sameBandcamp = ((await getLabel(r.id)).urls || []).some(u => String(u).toLowerCase().includes(page.host)); } catch { /* profile not reachable */ }
      out.push({ source: 'discogs', id: r.id, name: r.title, thumb: r.thumb || null, url: r.uri ? `https://www.discogs.com${r.uri}` : null, nameMatch, sameBandcamp });
    }
  } catch { /* Discogs unavailable: preview still works, without the matches */ }
  return out.sort((a, b) => (b.sameBandcamp - a.sameBandcamp) || (a.nameMatch === 'same' ? -1 : 1));
}

function sweepPreviews() {
  const now = Date.now();
  for (const [k, v] of previews) if (now - v.at > PREVIEW_TTL_MS) previews.delete(k);
  while (previews.size > 200) previews.delete(previews.keys().next().value);
}

const labelRow = host => db.prepare('SELECT * FROM custom_labels WHERE source_key = ?').get(`bandcamp:${host}`);

// Step 1 — read the page, save nothing. -> { previewId, label, sample, matches } | { alreadyAdded }
export async function previewLabel(user, rawUrl) {
  const loc = parseBandcampUrl(rawUrl);
  const existing = labelRow(loc.host);
  if (existing) return { alreadyAdded: publicLabel(existing) };
  const page = await readBandcamp(loc);
  const matches = await similarLabels(page);
  sweepPreviews();
  const previewId = randomUUID();
  previews.set(previewId, { userId: user.id, at: Date.now(), data: { page, matches } });
  return {
    previewId,
    question: 'Is this the label you meant?',
    label: { name: page.name, url: page.url, image: page.image, location: page.location, bio: page.bio, releaseCount: page.releases.length },
    sample: page.releases.slice(0, 6).map(({ title, artist, thumb, link }) => ({ title, artist, thumb, link })),
    matches,
  };
}

// Step 2 — the person's answer. action 'new' saves it as its own label; 'link' saves it as the Bandcamp side of a
// Discogs label from `matches` (never an arbitrary id). Anything else saves nothing.
export function confirmLabel(user, { previewId, action, discogsId, name }) {
  const p = previews.get(previewId);
  if (!p || p.userId !== user.id || Date.now() - p.at > PREVIEW_TTL_MS) throw new LabelError('That preview has expired. Paste the link again.', 410);
  const { page, matches } = p.data;
  let linked = null;
  if (action === 'link') {
    linked = matches.find(m => m.source === 'discogs' && m.id === Number(discogsId));
    if (!linked) throw new LabelError('Pick one of the suggested labels.');
  } else if (action !== 'new') throw new LabelError('Say whether to add it as a new label or link it.');
  const finalName = String(name || '').trim().slice(0, 80) || page.name;

  const made = db.transaction(() => {
    if (labelRow(page.host)) throw new LabelError('That label was just added.', 409);
    const id = db.prepare(`INSERT INTO custom_labels (source, source_key, name, url, image, location, bio, discogs_id, created_by)
      VALUES ('bandcamp', ?, ?, ?, ?, ?, ?, ?, ?)`).run(page.sourceKey, finalName, page.url, page.image, page.location, page.bio, linked?.id || null, user.id).lastInsertRowid;
    const entity = -Number(id);
    // combed_at set so the duplicate comber (which checks Discogs) leaves these rows alone.
    const put = db.prepare(`INSERT OR IGNORE INTO discogs_catalogue (kind, entity_id, item_type, item_id, title, year, thumb, artist, label, link, combed_at)
      VALUES ('label', ?, 'bandcamp', ?, ?, NULL, ?, ?, ?, ?, datetime('now'))`);
    for (const r of page.releases) put.run(entity, r.id, r.title, r.thumb, r.artist, finalName, r.link);
    db.prepare("INSERT OR REPLACE INTO discogs_catalogue_crawl (kind, entity_id, total, pages, next_page, done, crawled_at) VALUES ('label', ?, ?, 1, 1, 1, datetime('now'))").run(entity, page.releases.length);
    return Number(id);
  })();
  previews.delete(previewId);
  return publicLabel(db.prepare('SELECT * FROM custom_labels WHERE id = ?').get(made));
}

// What the front end gets. `entityId` is what the existing label catalogue route takes
// (GET /api/discogs/label/:entityId/releases), so the drawer can reuse its list.
export function publicLabel(r) {
  return r && { id: r.id, entityId: -r.id, source: r.source, name: r.name, url: r.url, image: r.image, location: r.location, bio: r.bio, discogsId: r.discogs_id, createdAt: r.created_at };
}
// With how many releases it holds and whether `user` may remove it (its adder, or an admin).
const withMeta = (r, user) => r && {
  ...publicLabel(r),
  releaseCount: db.prepare("SELECT COUNT(*) c FROM discogs_catalogue WHERE kind = 'label' AND entity_id = ?").get(-r.id).c,
  mine: !!user && (r.created_by === user.id || !!user.is_admin),
};
export const listCustomLabels = user => db.prepare('SELECT * FROM custom_labels ORDER BY name COLLATE NOCASE').all().map(r => withMeta(r, user));
export const getCustomLabel = (id, user) => withMeta(db.prepare('SELECT * FROM custom_labels WHERE id = ?').get(id), user);
// By Discogs id (a label we linked) or by Bandcamp page.
export function lookupCustomLabel({ discogsId, bandcamp }) {
  if (discogsId) return publicLabel(db.prepare('SELECT * FROM custom_labels WHERE discogs_id = ? ORDER BY id LIMIT 1').get(Number(discogsId)));
  if (bandcamp) { try { return publicLabel(labelRow(parseBandcampUrl(bandcamp).host)); } catch { return null; } }
  return null;
}

// Undo a mistaken add: its creator or an admin.
export function deleteCustomLabel(user, id, isAdmin) {
  const r = db.prepare('SELECT * FROM custom_labels WHERE id = ?').get(id);
  if (!r) throw new LabelError('Label not found.', 404);
  if (!isAdmin && r.created_by !== user.id) throw new LabelError('Only the person who added it, or an admin, can remove it.', 403);
  db.transaction(() => {
    db.prepare("DELETE FROM discogs_catalogue WHERE kind = 'label' AND entity_id = ?").run(-id);
    db.prepare("DELETE FROM discogs_catalogue_crawl WHERE kind = 'label' AND entity_id = ?").run(-id);
    db.prepare('DELETE FROM custom_labels WHERE id = ?').run(id);
  })();
  return { removed: id };
}

export const createdToday = userId => db.prepare("SELECT COUNT(*) c FROM custom_labels WHERE created_by = ? AND created_at > datetime('now','-1 day')").get(userId).c;
