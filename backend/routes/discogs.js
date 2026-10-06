import express from 'express';
import { searchDiscogs, getRelease, getMaster, getArtist, getLabel, resolveDiscogsUrl, getCovers, getReleaseInfo, getCataloguePage } from '../services/discogsService.js';
import { searchTrackVideo, quotaUsed } from '../services/youtubeService.js';
import { spotifyConfigured, spotifySearchTrack } from '../services/spotifyService.js';
import db from '../db/database.js';
import { combSoon } from '../services/catalogueComber.js';

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
    res.json(artist);
  } catch (err) {
    next(err);
  }
});

// GET /api/discogs/label/:id — label logo for spotlight cards (Feed.jsx).
router.get('/label/:id', async (req, res, next) => {
  try {
    const label = await getLabel(Number(req.params.id));
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
    const { artist = '', title, label = '', release_id, position, listen } = req.query;
    if (!title) return res.status(400).json({ error: 'title required' });
    // SPOTIFY-FALLBACK (2026-10-06, gabriel) — revisit when the YouTube quota
    // increase lands (handover TODO): with YouTube's day 80% spent, only the
    // free checks run (cache, crawled uploads) and a miss plays the track as
    // a Spotify player instead (full track for people signed in to Spotify,
    // a 30-second preview otherwise). A fallback is never saved as the
    // track's link, so YouTube gets its turn again tomorrow.
    // Spotify first (2026-10-06, YouTube savings): someone just listening
    // (`listen=1` — spotlights, drawer previews) gets the free checks, then
    // Spotify, and only then a paid YouTube search. Compose leaves it off: a
    // post wants a real YouTube link where there is one.
    const ytCap = Number(process.env.YOUTUBE_DAILY_UNIT_CAP) || 5000;
    const ytBusy = quotaUsed() >= ytCap * 0.8;
    const spotifyFirst = listen === '1' && spotifyConfigured();
    const trySpotify = async () => {
      const sp = await spotifySearchTrack(artist, title).catch(() => null);
      return sp && { youtube_url: null, youtube_title: null, spotify_url: sp.url, spotify_title: `${sp.artists.join(', ')} – ${sp.name}`, fallback: true };
    };
    let result = await searchTrackVideo(artist, title, { label, localOnly: ytBusy || spotifyFirst });
    if (!result.youtube_url && spotifyFirst) result = (await trySpotify()) || (ytBusy ? result : await searchTrackVideo(artist, title, { label }));
    else if (!result.youtube_url && (ytBusy || result.capped) && spotifyConfigured()) result = (await trySpotify()) || result;
    if (ytBusy && !result.youtube_url && !result.spotify_url) result = { ...result, capped: true };
    if (release_id && position && !result.capped && !result.fallback && !result.localOnly) {
      db.prepare(`INSERT INTO release_track_links (release_id, position, title, youtube_url, youtube_title, source, fetched_at)
                  VALUES (?, ?, ?, ?, ?, 'youtube-search', datetime('now'))
                  ON CONFLICT(release_id, position) DO UPDATE SET
                    title = excluded.title, youtube_url = excluded.youtube_url,
                    youtube_title = excluded.youtube_title, source = excluded.source, fetched_at = excluded.fetched_at`)
        .run(Number(release_id), String(position), title, result.youtube_url || null, result.youtube_title || null);
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
router.get('/release/:id/track-links', (req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT position, youtube_url, youtube_title FROM release_track_links
      WHERE release_id = ?
        AND (youtube_url IS NOT NULL OR fetched_at > datetime('now', '-30 days'))
    `).all(Number(req.params.id));
    const links = {};
    for (const r of rows) links[r.position] = { url: r.youtube_url, title: r.youtube_title };
    res.json({ links });
  } catch (err) {
    next(err);
  }
});
export default router;
