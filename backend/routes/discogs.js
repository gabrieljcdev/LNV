import express from 'express';
import { searchDiscogs, getRelease, getMaster, getArtist, getLabel, resolveDiscogsUrl, getCovers, getReleaseInfo, getCataloguePage } from '../services/discogsService.js';
import { searchTrackVideo, quotaUsed } from '../services/youtubeService.js';
import { spotifyConfigured, spotifySearchTrack, spotifyAlbumLinks } from '../services/spotifyService.js';
import db from '../db/database.js';
try { db.exec('ALTER TABLE release_track_links ADD COLUMN spotify_url TEXT'); } catch { /* already there */ }
try { db.exec('ALTER TABLE release_track_links ADD COLUMN spotify_title TEXT'); } catch { /* already there */ }
db.exec(`CREATE TABLE IF NOT EXISTS release_spotify (
  release_id INTEGER PRIMARY KEY,
  album_id TEXT,
  matched INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT DEFAULT (datetime('now'))
)`);

// One Spotify album lookup fills a whole release with provisional links
// (2026-10-07). A release with every track matched is done; anything less —
// no album, too few tracks, a track or two Spotify words differently — is
// tried again after 14 days. Free (Spotify), and it never touches a YouTube link already saved.
// The key a track's saved link goes under: its position, or "A1~2" for the
// second A1 of a box set. Same rule as linkKeys in frontend/src/lib/tracklist.js.
const linkKeysOf = list => {
  const seen = {};
  return list.map(t => {
    const p = t?.position || '';
    if (!p) return '';
    seen[p] = (seen[p] || 0) + 1;
    return seen[p] === 1 ? p : `${p}~${seen[p]}`;
  });
};

async function ensureReleaseSpotify(releaseId) {
  if (!spotifyConfigured() || !Number.isInteger(releaseId)) return null;
  const done = db.prepare(`SELECT matched, total, checked_at > datetime('now', '-14 days') AS fresh FROM release_spotify WHERE release_id = ?`).get(releaseId);
  if (done && (done.matched >= done.total || done.fresh)) return done;

  const rel = await getRelease(releaseId, { background: true });
  const list = rel.tracklist || [];
  const kept = list.filter(t => t.title && (t.position || !list.some(x => x.position)));   // no heading rows
  const ks = linkKeysOf(kept);
  const tracks = kept.map((t, i) => ({ ...t, key: ks[i] }));
  const names = (rel.artists || []).map(a => a.name);
  const various = /^various/i.test(names[0] || '');
  const record = (albumId, matched) => db.prepare(`INSERT OR REPLACE INTO release_spotify (release_id, album_id, matched, total, checked_at)
    VALUES (?, ?, ?, ?, datetime('now'))`).run(releaseId, albumId || null, matched, tracks.length);
  if (!tracks.length) { record(null, 0); return { matched: 0, total: 0 }; }

  // 1. The album, when most of it matches: a handful of title matches on the
  //    wrong edition would play the wrong recordings. (Not for "Various".)
  const links = {};   // link key -> { url, title, source }
  const album = names.length && !various ? await spotifyAlbumLinks({ artist: names.join(', '), album: rel.title, tracks }).catch(() => null) : null;
  if (album && Object.keys(album.links).length * 2 >= tracks.length) {
    for (const [pos, l] of Object.entries(album.links)) links[pos] = { ...l, source: 'spotify-album' };
  }
  // 2. Whatever the album didn't give — a single whose tracks live on other
  //    albums, a compilation, a title worded differently — one free search each
  //    (8 at most, 4 at a time), by the track's own artist when it has one.
  const rest = tracks.filter(t => t.key && !links[t.key]).slice(0, 8);
  const artistOf = t => ((t.artists || []).map(a => a.name).join(', ')) || (various ? '' : names.join(', '));
  for (let i = 0; i < rest.length; i += 4) {
    await Promise.all(rest.slice(i, i + 4).map(async t => {
      const who = artistOf(t);
      if (!who) return;
      const s = await spotifySearchTrack(who, t.title).catch(() => null);
      if (s) links[t.key] = { url: s.url, title: `${s.artists.join(', ')} – ${s.name}`, source: 'spotify-track' };
    }));
  }

  const save = db.prepare(`INSERT INTO release_track_links (release_id, position, title, source, fetched_at, spotify_url, spotify_title)
                           VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
                           ON CONFLICT(release_id, position) DO UPDATE SET
                             spotify_url = excluded.spotify_url, spotify_title = excluded.spotify_title`);
  const matched = Object.keys(links).length;
  db.transaction(() => {
    for (const t of tracks) { const l = t.key && links[t.key]; if (l) save.run(releaseId, t.key, t.title, l.source, l.url, l.title); }
    record(album?.albumId, matched);
  })();
  return { matched, total: tracks.length };
}
import { combSoon } from '../services/catalogueComber.js';
import { adoptProfileLinks } from '../services/profileLinks.js';

const router = express.Router();

// GET /api/discogs/resolve-url?url=<any discogs.com link> -> { releaseId, via }
// Shop listings and master pages resolve to their release — see
// resolveDiscogsUrl. 422 with a readable message when it can't.
router.get('/resolve-url', async (req, res) => {
  try {
    res.json(await resolveDiscogsUrl(req.query.url));
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

// GET /api/discogs/covers?keys=release:123,master:456 -> { covers: {key: url|null}, pending }
// Full-size sleeves for spotlight strips: cached ones now, missing ones
// queued and fetched slowly in the background (see getCovers). Poll until
// pending is 0.
router.get('/covers', (req, res) => {
  const keys = String(req.query.keys || '').split(',').filter(Boolean).slice(0, 60);
  res.json(getCovers(keys));
});

// GET /api/discogs/release-info?ids=123,456 -> { info: {id: {format, label, catno}}, pending }
// The spotlight list's type tag + label for catalogue entries that come
// without them (masters; ids are their main release). Same slow background
// queue as /covers — poll until pending is 0.
router.get('/release-info', (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 300);
  res.json(getReleaseInfo(ids));
});

router.get('/search', async (req, res, next) => {
  try {
    const { q, type = 'release', page = 1 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const results = await searchDiscogs(q, type, Number(page));
    res.json(results);
  } catch (err) {
    next(err);
  }
});

// GET /api/discogs/release/:id
router.get('/release/:id', async (req, res, next) => {
  try {
    const release = await getRelease(Number(req.params.id));
    res.json(release);
  } catch (err) {
    next(err);
  }
});

// GET /api/discogs/master/:id
router.get('/master/:id', async (req, res, next) => {
  try {
    const master = await getMaster(Number(req.params.id));
    res.json(master);
  } catch (err) {
    next(err);
  }
});

// GET /api/discogs/artist/:id — artist photo for spotlight cards (Feed.jsx).
// Most artists have no photo on Discogs; imageUrl comes back null in that
// case and the frontend falls back to its own mark rather than erroring.
router.get('/artist/:id', async (req, res, next) => {
  try {
    const artist = await getArtist(Number(req.params.id));
    adoptProfileLinks('artist', Number(req.params.id), artist.urls);
    res.json(artist);
  } catch (err) {
    next(err);
  }
});

// GET /api/discogs/label/:id — label logo for spotlight cards (Feed.jsx).
router.get('/label/:id', async (req, res, next) => {
  try {
    const label = await getLabel(Number(req.params.id));
    adoptProfileLinks('label', Number(req.params.id), label.urls);
    res.json(label);
  } catch (err) {
    next(err);
  }
});

// GET /api/discogs/artist/:id/releases?page=1 — artist discography, added
// 2026-08-25 for the spotlight "unknown artist" backfill (Feed.jsx): fills
// a brand-new artist's "Recent adds" list with their real Discogs releases
// when they have no prior LNV posts. Summary only — no tracklist/videos;
// the frontend fetches a specific release's full detail via
// GET /discogs/release/:id, lazily, only once the user clicks one.
// GET /api/discogs/{artist|label}/:id/releases?offset=0&limit=100&q=
// The WHOLE catalogue, crawled in the background (getCataloguePage) and
// served from the DB in pages, newest year first; q filters title / artist
// / catno. `crawl` says how much has been collected so far.
for (const kind of ['artist', 'label']) {
  router.get(`/${kind}/:id/releases`, async (req, res, next) => {
    try {
      const { offset, limit, q } = req.query;
      combSoon(kind, Number(req.params.id)); // someone's looking: comb this one first
      res.json(await getCataloguePage(kind, Number(req.params.id), { offset, limit, q }));
    } catch (err) {
      next(err);
    }
  });
}

// GET /api/discogs/youtube/search?artist=&title=&label=
// One track -> best YouTube video. Used by ComposeModal for tracklist rows
// Discogs' videos[] didn't cover. Quota-capped and cached — see
// searchTrackVideo in youtubeService. `capped: true` means today's search
// budget is spent; the client stops asking until tomorrow.
// Optional release_id + position: the result (found OR not found) is saved to
// release_track_links, so that track never needs searching again — see
// GET /release/:id/track-links. Capped results are not saved (nothing was
// actually searched).
router.get('/youtube/search', async (req, res, next) => {
  try {
    const { artist = '', title, label = '', catno = '', release_id, position, listen } = req.query;
    if (!title) return res.status(400).json({ error: 'title required' });
    // SPOTIFY-FALLBACK (2026-10-06, gabriel) — revisit when the YouTube quota
    // increase lands (handover TODO): with YouTube's day 80% spent, only the
    // free checks run (cache, crawled uploads) and a miss plays the track as
    // a Spotify player instead (full track for people signed in to Spotify,
    // a 30-second preview otherwise). A fallback is saved only as a
    // provisional placeholder (below), never as the track's real link.
    // Saved first (2026-10-07): a link already found for this very release +
    // track is never searched for again, whoever posts it — a known miss
    // (30 days) and, for listening, a saved Spotify placeholder count too.
    if (release_id && position) {
      const saved = db.prepare(`SELECT youtube_url, youtube_title, spotify_url, spotify_title,
                                       fetched_at > datetime('now', '-30 days') AS fresh
                                FROM release_track_links WHERE release_id = ? AND position = ?`).get(Number(release_id), String(position));
      if (saved?.youtube_url) return res.json({ youtube_url: saved.youtube_url, youtube_title: saved.youtube_title, cached: true, saved: true });
      if (saved?.spotify_url && listen === '1') return res.json({ youtube_url: null, youtube_title: null, spotify_url: saved.spotify_url, spotify_title: saved.spotify_title, fallback: true, saved: true });
      if (saved && !saved.spotify_url && saved.fresh && listen !== '1') return res.json({ youtube_url: null, youtube_title: null, cached: true, saved: true });
    }
    // Spotify first (2026-10-06, YouTube savings): someone just listening
    // (`listen=1` — spotlights, drawer previews) gets the free checks, then
    // Spotify, and only then a paid YouTube search. Compose leaves it off: a
    // post wants a real YouTube link where there is one.
    const ytCap = Number(process.env.YOUTUBE_DAILY_UNIT_CAP) || 5000;
    // Release-level breaker (2026-10-07): an album that isn't on YouTube made
    // 27 searches in a row find nothing (Pan Assembly). Once a release has 3
    // searched misses and more than 3 per find, stop PAYING for the rest of
    // its tracks — free checks (and Spotify) still run. Saved misses age out
    // after 30 days, so the breaker resets itself.
    let held = false;
    if (release_id) {
      const t = db.prepare(`SELECT SUM(youtube_url IS NOT NULL) hits,
                                   SUM(youtube_url IS NULL AND spotify_url IS NULL AND fetched_at > datetime('now', '-30 days')) misses
                            FROM release_track_links WHERE release_id = ?`).get(Number(release_id));
      held = (t.misses || 0) >= 3 && (t.misses || 0) > (t.hits || 0) * 3;
    }
    const ytBusy = quotaUsed() >= ytCap * 0.8;
    const spotifyFirst = listen === '1' && spotifyConfigured();
    const trySpotify = async () => {
      const sp = await spotifySearchTrack(artist, title).catch(() => null);
      return sp && { youtube_url: null, youtube_title: null, spotify_url: sp.url, spotify_title: `${sp.artists.join(', ')} – ${sp.name}`, fallback: true };
    };
    let result = await searchTrackVideo(artist, title, { label, catno, localOnly: ytBusy || held || spotifyFirst });
    if (!result.youtube_url && spotifyFirst) result = (await trySpotify()) || (ytBusy || held ? result : await searchTrackVideo(artist, title, { label, catno }));
    // Not listening (compose): YouTube found nothing -> a Spotify placeholder, so
    // a post never goes up with a track that can't be played (2026-10-07).
    else if (!result.youtube_url && spotifyConfigured()) result = (await trySpotify()) || result;
    if (ytBusy && !result.youtube_url && !result.spotify_url) result = { ...result, capped: true };
    else if (held && !result.youtube_url && !result.spotify_url) result = { ...result, held: true };
    if (release_id && position && !result.capped && !result.fallback && !result.localOnly) {
      db.prepare(`INSERT INTO release_track_links (release_id, position, title, youtube_url, youtube_title, source, fetched_at)
                  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                  ON CONFLICT(release_id, position) DO UPDATE SET
                    title = excluded.title, youtube_url = excluded.youtube_url,
                    youtube_title = excluded.youtube_title, source = excluded.source, fetched_at = excluded.fetched_at`)
        // where it came from: a crawled channel (free) or a real search (paid)
        .run(Number(release_id), String(position), title, result.youtube_url || null, result.youtube_title || null, result.local ? 'youtube-channel' : 'youtube-search');
    }
    // A Spotify placeholder is saved too (2026-10-07) — kept apart from the
    // YouTube columns, so the real link replaces it the moment one is found.
    if (release_id && position && result.fallback && result.spotify_url) {
      db.prepare(`INSERT INTO release_track_links (release_id, position, title, source, fetched_at, spotify_url, spotify_title)
                  VALUES (?, ?, ?, 'spotify-placeholder', datetime('now'), ?, ?)
                  ON CONFLICT(release_id, position) DO UPDATE SET
                    spotify_url = excluded.spotify_url, spotify_title = excluded.spotify_title`)
        .run(Number(release_id), String(position), title, result.spotify_url, result.spotify_title || null);
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/discogs/release/:id/track-links -> { links: { [position]: { url, title } } }
// Every YouTube link already found for this release's tracks. url null =
// searched and nothing found; those are dropped after 30 days so they get
// another try (was 14 — misses were costing searches, 2026-10-06).
router.get('/release/:id/track-links', async (req, res, next) => {
  try {
    // Opening a release fills it from its Spotify album first (free).
    await ensureReleaseSpotify(Number(req.params.id)).catch(() => null);
    const rows = db.prepare(`
      SELECT position, youtube_url, youtube_title, spotify_url, spotify_title FROM release_track_links
      WHERE release_id = ?
        AND (youtube_url IS NOT NULL OR spotify_url IS NOT NULL OR fetched_at > datetime('now', '-30 days'))
    `).all(Number(req.params.id));
    const links = {};
    // A Spotify placeholder fills in until a YouTube link is found (provisional).
    for (const r of rows) links[r.position] = r.youtube_url || !r.spotify_url
      ? { url: r.youtube_url, title: r.youtube_title }
      : { url: r.spotify_url, title: r.spotify_title, provisional: true };
    res.json({ links });
  } catch (err) {
    next(err);
  }
});
export default router;
