// Where an artist or label lives online, from their Discogs profile
// (2026-10-07). Discogs lists a profile's own links — a YouTube channel, a
// Bandcamp, a SoundCloud — and we used to throw them away. In a sample of 28
// artists and labels, 64% listed at least one of those three (YouTube 29%,
// Bandcamp 46%, SoundCloud 43%).
//
// All of them are kept in profile_links. A YouTube channel is also looked up
// (1 unit) and added to the channel crawler, which reads every upload at 1
// unit per 50 videos — so a track by that artist or label is found by a free
// database lookup instead of a 100-unit search (searchTrackVideo already
// checks every crawled upload first). Bandcamp / SoundCloud links are stored
// for the playback steps that come next.
//
// Profiles come from two places: whenever a spotlight asks for one (the
// routes call adoptProfileLinks), and a slow background sweep over every
// artist / label already on a post (startProfileKeeper).

import db from '../db/database.js';
import { logEvent } from './logService.js';
import { getArtist, getLabel } from './discogsService.js';
import { adoptChannelUrl, parseChannelUrl, crawlBudgetLeft } from './youtubeService.js';

db.exec(`CREATE TABLE IF NOT EXISTS profile_links (
  kind TEXT NOT NULL,            -- 'artist' | 'label'
  entity_id INTEGER NOT NULL,    -- the Discogs id
  platform TEXT NOT NULL,        -- 'youtube' | 'bandcamp' | 'soundcloud' | 'spotify'
  url TEXT NOT NULL,
  found_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (kind, entity_id, url)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS profile_checked (
  kind TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  checked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (kind, entity_id)
)`);

const PER_SWEEP = 25;          // Discogs profiles read per sweep
const DISCOGS_GAP_MS = 3000;   // well under Discogs' 60/min alongside the other jobs
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function platformOf(raw) {
  let u;
  try { u = new URL(/^https?:/i.test(raw) ? raw : `http://${raw}`); } catch { return null; }
  const host = u.hostname.replace(/^www\./i, '').toLowerCase();
  if (host === 'youtube.com' || host === 'm.youtube.com') return parseChannelUrl(raw) ? 'youtube' : null; // channels only, not videos
  if (host.endsWith('.bandcamp.com')) return 'bandcamp';
  if (host === 'soundcloud.com' && u.pathname.split('/').filter(Boolean).length >= 1) return 'soundcloud';
  if (host === 'open.spotify.com' && /\/artist\//.test(u.pathname)) return 'spotify';
  return null;
}

// Keep a profile's links and start its YouTube channels on their way.
// Not awaited by callers: the channel lookups run in the background.
export function adoptProfileLinks(kind, id, urls = []) {
  if (!Number.isInteger(id) || !Array.isArray(urls)) return 0;
  const ins = db.prepare('INSERT OR IGNORE INTO profile_links (kind, entity_id, platform, url) VALUES (?, ?, ?, ?)');
  const yt = [];
  db.transaction(() => {
    for (const url of urls) {
      const platform = platformOf(url);
      if (!platform) continue;
      ins.run(kind, id, platform, url);
      if (platform === 'youtube') yt.push(url);
    }
    db.prepare('INSERT OR REPLACE INTO profile_checked (kind, entity_id) VALUES (?, ?)').run(kind, id);
  })();
  (async () => {
    for (const url of yt) {
      await adoptChannelUrl(url).catch(err => logEvent('error', 'crawl', `Profile channel ${url}: ${err.message}`));
    }
  })();
  return yt.length;
}

// Artists and labels on posts whose profile we haven't read yet.
const unchecked = () => db.prepare(`
  SELECT DISTINCT 'artist' kind, discogs_artist_id id FROM post_artists a
   WHERE discogs_artist_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM profile_checked c WHERE c.kind = 'artist' AND c.entity_id = a.discogs_artist_id)
  UNION
  SELECT DISTINCT 'label', discogs_label_id FROM post_labels l
   WHERE discogs_label_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM profile_checked c WHERE c.kind = 'label' AND c.entity_id = l.discogs_label_id)
  LIMIT ?`).all(PER_SWEEP);

export async function sweepProfiles() {
  let read = 0, withChannel = 0;
  for (const { kind, id } of unchecked()) {
    try {
      const profile = await (kind === 'artist' ? getArtist : getLabel)(id, { background: true });
      if (adoptProfileLinks(kind, id, profile.urls)) withChannel++;
      read++;
    } catch (err) {
      // A profile Discogs doesn't have is done with; anything else (rate
      // limit, network) ends this sweep and is tried again next hour.
      if (/: 404$/.test(err.message)) db.prepare('INSERT OR REPLACE INTO profile_checked (kind, entity_id) VALUES (?, ?)').run(kind, id);
      else break;
    }
    await sleep(DISCOGS_GAP_MS);
  }
  // Channels that were found but not yet looked up (the day's crawl budget
  // had run out at the time).
  let pending = 0;
  const waiting = db.prepare(`SELECT DISTINCT url FROM profile_links
    WHERE platform = 'youtube' AND url NOT IN (SELECT url FROM yt_channel_urls)`).all();
  for (const { url } of waiting) {
    if (!crawlBudgetLeft()) break;
    await adoptChannelUrl(url).catch(() => null);
    pending++;
  }
  if (read || pending) logEvent('info', 'crawl', `Profile links: read ${read} profile${read === 1 ? '' : 's'} (${withChannel} with a YouTube channel)${pending ? `, looked up ${pending} waiting channel${pending === 1 ? '' : 's'}` : ''}`);
  return { read, withChannel, pending };
}

export function profileLinkStats() {
  const q = s => db.prepare(s).get();
  return {
    profilesRead: q('SELECT COUNT(*) c FROM profile_checked').c,
    withLinks: q('SELECT COUNT(DISTINCT kind || entity_id) c FROM profile_links').c,
    youtube: q("SELECT COUNT(*) c FROM profile_links WHERE platform = 'youtube'").c,
    bandcamp: q("SELECT COUNT(*) c FROM profile_links WHERE platform = 'bandcamp'").c,
    soundcloud: q("SELECT COUNT(*) c FROM profile_links WHERE platform = 'soundcloud'").c,
    channelsAdopted: q('SELECT COUNT(*) c FROM yt_channel_urls WHERE channel_id IS NOT NULL').c,
  };
}

let running = false;
export function startProfileKeeper() {
  const sweep = async () => {
    if (running) return;
    running = true;
    try { await sweepProfiles(); }
    catch (err) { logEvent('error', 'crawl', `Profile links: ${err.message}`); }
    finally { running = false; }
  };
  setTimeout(sweep, 45000);
  setInterval(sweep, 60 * 60 * 1000);
}
