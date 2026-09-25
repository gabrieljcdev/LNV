import express from 'express';
import { searchDiscogs, getRelease, getMaster, getArtist, getLabel, getArtistReleases, getLabelReleases, resolveDiscogsUrl } from '../services/discogsService.js';
import { searchTrackVideo } from '../services/youtubeService.js';

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
router.get('/artist/:id/releases', async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const releases = await getArtistReleases(Number(req.params.id), page);
    res.json(releases);
  } catch (err) {
    next(err);
  }
});

router.get('/label/:id/releases', async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const releases = await getLabelReleases(Number(req.params.id), page);
    res.json(releases);
  } catch (err) {
    next(err);
  }
});

// GET /api/discogs/youtube/search?artist=&title=&label=
// One track -> best YouTube video. Used by ComposeModal for tracklist rows
// Discogs' videos[] didn't cover. Quota-capped and cached — see
// searchTrackVideo in youtubeService. `capped: true` means today's search
// budget is spent; the client stops asking until tomorrow.
router.get('/youtube/search', async (req, res, next) => {
  try {
    const { artist = '', title, label = '' } = req.query;
    if (!title) return res.status(400).json({ error: 'title required' });
    res.json(await searchTrackVideo(artist, title, { label }));
  } catch (err) {
    next(err);
  }
});
export default router;
