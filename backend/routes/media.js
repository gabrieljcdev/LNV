import express from 'express';
import fetch from 'node-fetch';
import { searchDiscogs, searchDiscogsBarcode, getRelease, getArtistReleases, getLabelReleases, resolveDiscogsUrl, catalogueCandidates } from '../services/discogsService.js';
import { getChannelUploads, extractVideoId } from '../services/youtubeService.js';

const router = express.Router();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// ─── Known live-set channels ──────────────────────────────────────────────────
const KNOWN_CHANNELS = [
  'HÖR', 'Boiler Room', 'fabric', 'Resident Advisor', 'Dekmantel',
  'Tresor', 'Berghain', 'De School', 'FOLD', 'Printworks', 'Shelter',
  'Intercell', 'BCCO', 'Awakenings', 'ADE', 'Unsound', 'Elevate',
  'Hessle Audio', 'Rinse FM', 'NTS', 'XLR8R', 'DJ Mag', 'Mixmag',
  'RBMA', 'Red Bull Music', 'Panorama Bar', 'Watergate', 'Robert Johnson',
  'Concrete', 'Rex Club', 'Fabric', 'XOYO', 'Village Underground',
];

// Wikipedia slug → genre string
const TOPIC_GENRE_MAP = {
  'Electronic_music': 'Electronic',
  'Techno': 'Techno',
  'House_music': 'House',
  'Deep_house': 'Deep House',
  'Tech_house': 'Tech House',
  'Minimal_techno': 'Minimal',
  'Acid_techno': 'Acid Techno',
  'Industrial_techno': 'Industrial',
  'Ambient_music': 'Ambient',
  'Drum_and_bass': 'Drum & Bass',
  'Jungle_music': 'Jungle',
  'Dubstep': 'Dubstep',
  'UK_garage': 'UK Garage',
  'Grime_(music)': 'Grime',
  'Hip_hop_music': 'Hip-Hop',
  'Soul_music': 'Soul',
  'Rhythm_and_blues': 'R&B',
  'Funk': 'Funk',
  'Disco': 'Disco',
  'Pop_music': 'Pop',
  'Rock_music': 'Rock',
  'Indie_rock': 'Indie',
  'Alternative_rock': 'Alternative',
  'Jazz': 'Jazz',
  'Classical_music': 'Classical',
  'Experimental_music': 'Experimental',
  'Noise_music': 'Noise',
  'Industrial_music': 'Industrial',
  'EBM': 'EBM',
  'Electro_(music)': 'Electro',
  'Chicago_house': 'Chicago House',
  'Detroit_techno': 'Detroit Techno',
  'Trance_music': 'Trance',
  'Progressive_house': 'Progressive House',
  'Nu-disco': 'Nu-Disco',
  'Italo_disco': 'Italo Disco',
  'Afrobeats': 'Afrobeats',
  'Reggae': 'Reggae',
  'Dub_music': 'Dub',
  'IDM': 'IDM',
  'Breakbeat': 'Breakbeat',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Split an artist string into individual artist objects.
 * Splits on B2B, b2b, feat., ft., vs., vs, &  — but NOT on bare 'x'/'X'
 * (which appears in venue names like "Intercell x BCCO").
 * The caller is responsible for stripping venue/channel suffixes BEFORE calling this.
 */
function splitArtists(str) {
  if (!str) return [];
  // Only split on explicit collaboration keywords, not on 'x'
  const parts = str
    .split(/\s+(?:B2B|b2b|feat\.|feat|ft\.|ft|vs\.|vs|&(?!\s*\w+\s+Records))\s+/i)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.map(name => ({ name }));
}

/**
 * Parse a YouTube live-set title into { artists[], channel, cleanTitle }.
 *
 * Handles formats:
 *   "Artist B2B Artist | Channel - Date"          → HÖR style
 *   "Artist B2B Artist - Channel - Date"           → fabric style
 *   "Artist at Venue - Date"                       → single artist at venue
 *   "Artist at Venue x Co-org | Event - Date"      → Intercell style
 *   "Artist - Track Title"                         → standard track (returns null)
 */
function parseYouTubeTitle(rawTitle, channelTitle) {
  const t = rawTitle.trim();

  // ── Pattern 1: Pipe separator  "... | Channel - extras"
  // e.g. "future.666 B2B ÜBERKIKZ | HÖR - June 20 / 2024"
  // e.g. "KM/H B2B S/SAVEUR | Shelter Amsterdam - ADE 2024"
  // e.g. "future.666 at Intercell x BCCO | ADE 2024"
  const pipeMatch = t.match(/^(.+?)\s*\|\s*(.+?)(?:\s*[-–]\s*.+)?$/);
  if (pipeMatch) {
    const left = pipeMatch[1].trim();   // "future.666 B2B ÜBERKIKZ" or "future.666 at Intercell x BCCO"
    const right = pipeMatch[2].trim();  // "HÖR" or "ADE 2024"

    // Check if left contains " at " — "Artist at Venue x Co-org | Event"
    const atMatch = left.match(/^(.+?)\s+at\s+(.+)$/i);
    if (atMatch) {
      const artistPart = atMatch[1].trim();  // "future.666"
      // channel is the YouTube channel title (most reliable), fallback to right side
      const channel = channelTitle || right;
      return {
        artists: splitArtists(artistPart),
        channel,
        cleanTitle: t,
      };
    }

    // Standard B2B pipe format
    // channel is right side if it matches a known channel, else use channelTitle
    const channel = channelTitle || right;
    return {
      artists: splitArtists(left),
      channel,
      cleanTitle: t,
    };
  }

  // ── Pattern 2: Dash separator  "Artist B2B Artist - Channel - extras"
  // e.g. "Marcel Dettmann b2b Blawan - fabric 92"
  // Only fires when there's a B2B/b2b keyword on the left of the first dash
  const dashB2bMatch = t.match(/^(.+?\s+(?:B2B|b2b)\s+.+?)\s+-\s+(.+)$/);
  if (dashB2bMatch) {
    const left = dashB2bMatch[1].trim();
    const right = dashB2bMatch[2].trim();
    const channel = channelTitle || right;
    return {
      artists: splitArtists(left),
      channel,
      cleanTitle: t,
    };
  }

  // ── Pattern 3: "Artist at Venue - Date" (no pipe)
  // e.g. "Surgeon at Fabric - March 2024"
  const atDashMatch = t.match(/^(.+?)\s+at\s+.+?\s+-\s+.+$/i);
  if (atDashMatch) {
    const artistPart = atDashMatch[1].trim();
    return {
      artists: splitArtists(artistPart),
      channel: channelTitle || null,
      cleanTitle: t,
    };
  }

  // ── Pattern 4: Single artist "Artist - Title" — standard track, not a live set
  return null;
}

/**
 * Score-based post type detection.
 * Returns 'livemix' | 'album' | 'single'
 */
function detectPostType({ platform, duration, title = '', tags = [], description = '', tracks = [], catNo }) {
  // Hard signals
  if (['ra', 'boilerroom', 'mixcloud'].includes(platform)) return 'livemix';
  if (tracks.length >= 6) return 'album';
  if (catNo && tracks.length <= 2) return 'single'; // catNo alone = single only if very few tracks

  let score = 0;
  const t = (title + ' ' + tags.join(' ') + ' ' + description).toLowerCase();

  if (duration > 1800) score += 2;  // >30min
  if (duration > 3600) score += 1;  // >60min bonus
  if (/\b(live|mix|dj.?set|podcast|session|b2b|boiler.?room|fabric|berghain|hor|h.r)\b/.test(t)) score += 2;
  if (/\bat\b/.test(title.toLowerCase())) score += 1;
  if (KNOWN_CHANNELS.some(c => title.includes(c) || description.includes(c))) score += 3;
  if (duration < 900 && !/(mix|set|live)/i.test(t)) score -= 3;  // <15min, no mix keyword

  if (score >= 2) return 'livemix';
  if (tracks.length >= 6) return 'album';
  return 'single';
}

/**
 * Extract genre strings from YouTube topicDetails.topicCategories Wikipedia URLs.
 */
function genresFromTopicCategories(topicCategories = []) {
  const genres = [];
  for (const url of topicCategories) {
    const slug = url.split('/').pop();
    if (TOPIC_GENRE_MAP[slug]) genres.push(TOPIC_GENRE_MAP[slug]);
  }
  return [...new Set(genres)];
}

/**
 * Fallback keyword genre scan over title + tags + description.
 */
function genresFromKeywords(text = '') {
  const lower = text.toLowerCase();
  const found = [];
  const checks = [
    ['techno', 'Techno'], ['house', 'House'], ['deep house', 'Deep House'],
    ['tech house', 'Tech House'], ['minimal', 'Minimal'], ['acid', 'Acid'],
    ['ambient', 'Ambient'], ['drum and bass', 'Drum & Bass'], ['dnb', 'Drum & Bass'],
    ['jungle', 'Jungle'], ['dubstep', 'Dubstep'], ['garage', 'UK Garage'],
    ['grime', 'Grime'], ['hip hop', 'Hip-Hop'], ['hip-hop', 'Hip-Hop'],
    ['soul', 'Soul'], ['r&b', 'R&B'], ['funk', 'Funk'], ['disco', 'Disco'],
    ['pop', 'Pop'], ['rock', 'Rock'], ['indie', 'Indie'], ['jazz', 'Jazz'],
    ['classical', 'Classical'], ['experimental', 'Experimental'],
    ['electro', 'Electro'], ['trance', 'Trance'], ['idm', 'IDM'],
    ['electronic', 'Electronic'],
  ];
  for (const [kw, genre] of checks) {
    if (lower.includes(kw)) found.push(genre);
  }
  return [...new Set(found)];
}

/**
 * Discogs search, straight through the cached service layer.
 */
async function discogsSearch(q) {
  try {
    const data = await searchDiscogs(q);
    return data?.results?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Discogs release fetch, straight through the cached service layer.
 */
async function discogsRelease(id) {
  try {
    return await getRelease(Number(id));
  } catch {
    return null;
  }
}

/**
 * Strip the noise platforms add to titles before they go into a Discogs
 * search: "(feat. X, Y)", "(Official Video)", "[Audio]", "(Visualizer)" etc.
 * Discogs titles never carry these, and the extra words sink the match.
 * Remix/edit parentheticals are kept — those are real track titles.
 */
function cleanForSearch(str = '') {
  return str
    .replace(/[([]\s*(?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]/gi, '')
    .replace(/[([]\s*(?:official\s+)?(?:music\s+)?(?:video|audio|visuali[sz]er|lyric(?:s)?(?:\s+video)?|hd|hq|4k|premiere)\s*[)\]]/gi, '')
    .replace(/\s+(?:feat\.?|ft\.?)\s+.*$/i, '')
    .replace(/\s+-\s+Topic$/i, '') // YouTube auto-channel names saved as artists
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * YouTube "Topic" channels ("Artist - Topic") are auto-generated from
 * distributor feeds. Their video title is just the track title, and the
 * description follows a fixed template:
 *
 *   Provided to YouTube by <distributor>
 *
 *   <Track> · <Artist> · <Artist>
 *
 *   <Release title>
 *
 *   ℗ <year> <Label>
 *
 *   Released on: 2025-03-14
 *
 * which is better release data than anything we'd parse off a title.
 * Returns { artists[], release, label, year } or null if it isn't that shape.
 */
function parseTopicDescription(description = '') {
  if (!/^Provided to YouTube by/i.test(description.trim())) return null;
  const blocks = description.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const credit = blocks.find(b => b.includes(' · '));
  const creditIdx = blocks.indexOf(credit);
  const artists = credit ? credit.split(' · ').slice(1).map(s => s.trim()).filter(Boolean) : [];
  const release = creditIdx >= 0 ? (blocks[creditIdx + 1] || '') : '';
  const pLine = blocks.find(b => /^℗/.test(b)) || '';
  const pMatch = pLine.match(/^℗\s*(\d{4})?\s*(.*)$/);
  const released = description.match(/Released on:\s*(\d{4})/i)?.[1] || '';
  return {
    artists,
    release: /^℗|^Released on/i.test(release) ? '' : release,
    label: pMatch?.[2]?.trim() || '',
    year: released || pMatch?.[1] || '',
  };
}

// "Dj.Mc" / "DJ MC" -> "djmc"; tokens for partial credits
// ("Rachel Kitchlew" vs Discogs' "Rachel Horton-Kitchlew").
// Accents folded: SoundCloud says "Chateau Flight", Discogs "Château Flight".
const fold = s => cleanForSearch(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const squash = s => fold(s).replace(/\s*\(\d+\)$/, '').replace(/[^\p{L}\p{N}]+/gu, '');
// Words that say nothing about WHICH artist: "DJ" alone once matched "Dj.Mc"
// to an unrelated DJ on a compilation.
const GENERIC = new Set(['dj', 'mc', 'the', 'and', 'feat', 'ft', 'vs', 'featuring', 'presents', 'pres', 'with', 'von', 'van', 'der', 'de', 'la', 'le']);
const tokens = s => fold(s).split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2 && !GENERIC.has(w));

// minShare: fraction of a's distinctive words that must appear in b.
// Artists use 0.5 (partial credits); titles use 1 ("Walk Ya Down" is not
// "Walk Down").
function namesAgree(a, b, minShare = 0.5) {
  const sa = squash(a), sb = squash(b);
  if (!sa || !sb) return false;
  if (sa === sb || (Math.min(sa.length, sb.length) >= 4 && (sa.includes(sb) || sb.includes(sa)))) return true;
  const ta = tokens(a), tb = new Set(tokens(b));
  return ta.length > 0 && ta.filter(w => tb.has(w)).length / ta.length >= minShare;
}

/**
 * Does a fetched Discogs release plausibly correspond to the pasted
 * artist + title? Title: the release title or any track title. Artist: any
 * release-level artist, or — on "Various" compilations — any track artist.
 * An empty query artist only needs the title to agree.
 */
function isPlausibleMatch(rel, artist, title) {
  // A title that's only the artist's own name ("Mausio EP" by Mausio) says
  // nothing on its own — every remix credit of theirs would match it — so it
  // has to BE the release title (exactly — namesAgree's substring rule
  // would let "Mausio" match "Let's Pretend (Mausio Remix)").
  const titleWords = tokens(title), artistWords = new Set(tokens(artist));
  const onlyArtist = !!artist && titleWords.length > 0 && titleWords.every(w => artistWords.has(w));
  const titleOk = !title
    || (onlyArtist
      ? squash(title.replace(/\s+(?:EP|LP|E\.P\.?|Single)$/i, '')) === squash((rel.release_title || '').replace(/\s+(?:EP|LP|E\.P\.?|Single)$/i, ''))
      : namesAgree(title, rel.release_title, 1) || (rel.tracks || []).some(t => namesAgree(title, t.title, 1)));
  if (!titleOk) return false;
  if (!artist) return true;
  const credits = [
    ...(rel.artists || []).map(a => a.name),
    ...(rel.tracks || []).flatMap(t => (t.artists || []).map(a => a.name)),
    ...(rel.remixers || []),
  ];
  return credits.some(n => namesAgree(artist, n));
}

/**
 * A fetched Discogs release (+ its search-result row) in the shape every
 * reverse lookup returns.
 */
function toLookupRelease(release, result = {}) {
  const relLabel = release.labels?.[0] || null;
  return {
    discogs_id: release.discogsId,
    release_title: release.title,
    // [{ id, name }] — ids are the whole point, see tryDiscogsLookup
    artists: (release.artists || []).filter(a => a?.name),
    artist: (release.artists || []).map(a => a.name).filter(Boolean).join(', '),
    label: relLabel?.name || '',
    label_id: relLabel?.id || null,
    catNo: relLabel?.catno || '',
    year: release.year ? String(release.year) : null,
    genres: [...(release.genres || []), ...(release.styles || [])],
    cover_image: release.coverImage || null,
    thumb_image: release.thumbImage || null,
    tracks: (release.tracklist || []).map(t => ({ title: t.title, duration: t.duration, position: t.position, artists: t.artists || [] })),
    // Names only — used to accept a match, never saved as the post's artists.
    remixers: [...(release.remixers || []), ...(release.tracklist || []).flatMap(t => t.remixers || [])].map(a => a.name),
    videos: release.videos || [],
    format: result.format || [],
    country: result.country || '',
  };
}

// The crawled catalogues' releases whose title agrees with `title` both ways
// and whose artist agrees (or, with no artist, whose label does); the full
// release (cached) must then pass isPlausibleMatch like any search hit.
async function localCatalogueMatch(artist, title, labels = []) {
  try {
    const want = cleanForSearch(title).toLowerCase();
    const rows = catalogueCandidates(want)
      .filter(r => namesAgree(title, r.title, 1) && namesAgree(r.title, title, 0.67))
      .filter(r => !artist || !r.artist || namesAgree(artist, r.artist) || /^various/i.test(r.artist))
      // exact titles first
      .sort((a, b) => Number(squash(b.title) === squash(title)) - Number(squash(a.title) === squash(title)));
    const seen = new Set();
    for (const r of rows) {
      if (seen.has(r.releaseId) || seen.size >= 3) continue;
      seen.add(r.releaseId);
      const raw = await discogsRelease(r.releaseId);
      const rel = raw && toLookupRelease(raw);
      if (!rel) continue;
      const ok = artist ? isPlausibleMatch(rel, artist, title) : labels.some(l => namesAgree(l, rel.label)) && isPlausibleMatch(rel, '', title);
      if (ok) return { ...rel, all_releases: null };
    }
  } catch { /* fall through to search */ }
  return null;
}

/**
 * Attempt a Discogs reverse-lookup for a non-live result.
 * Returns partial release data (plus up to 4 alternates) or null.
 *
 * Artist and label DISCOGS IDS are carried through here, not just names:
 * post_artists.discogs_artist_id / post_labels.discogs_label_id are what the
 * spotlight discography feature resolves against, and before 2026-08-26
 * nothing on the reverse-lookup path ever produced them.
 *
 * With no artist, `labels` is required and one of them must agree with the
 * release's label — a bare title ("Vibration") matches far too much.
 */
export async function tryDiscogsLookup(artist, title, { labels = [] } = {}) {
  if (!title || (!artist && !labels.length)) return null;
  // DB first (2026-10-02): releases the catalogue crawler already collected
  // answer without a search call. Same plausibility rules as a search hit.
  const local = await localCatalogueMatch(artist, title, labels);
  if (local) return local;
  try {
    // Search results (up to 20), not just the first
    // "Flight.Dam" -> "Flight Dam": Discogs search treats the glued pair as one word.
    const q = `${cleanForSearch(artist)} ${cleanForSearch(title)}`.replace(/(\p{L})\.(\p{L}{2})/gu, '$1 $2').trim();
    const searchData = await searchDiscogs(q, 'release');
    const results = searchData?.results || [];
    if (!results.length) return null;

    // Deduplicate by album title — keep the best pressing of each unique release title
    // Priority: Album > EP > Single, and original > reissue
    const seen = new Map(); // normalized title -> result
    for (const result of results) {
      const normTitle = result.title?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      if (!seen.has(normTitle)) {
        seen.set(normTitle, result);
      } else {
        // Prefer albums over singles, original over reissue
        const existing = seen.get(normTitle);
        const isAlbum = result.format?.some(f => /album/i.test(f));
        const existingIsAlbum = existing.format?.some(f => /album/i.test(f));
        const isReissue = result.format?.some(f => /reissue|repress/i.test(f));
        if (isAlbum && !existingIsAlbum) seen.set(normTitle, result);
        else if (!isReissue && existing.format?.some(f => /reissue|repress/i.test(f))) seen.set(normTitle, result);
      }
    }

    // Take up to 5 unique releases and fetch their full data.
    // IN PARALLEL — this used to be an await inside a for-loop, i.e. five
    // sequential Discogs round-trips stacked onto every single paste of a
    // YouTube/SoundCloud/Bandcamp link. Ordering is preserved (Promise.all
    // resolves positionally), so the "primary = first = Discogs' own best
    // match" contract below is unchanged; only the wall-clock cost is.
    const uniqueResults = [...seen.values()].slice(0, 5);
    const fetched = await Promise.all(uniqueResults.map(r => discogsRelease(r.id)));

    const releases = uniqueResults
      .map((r, i) => fetched[i] && toLookupRelease(fetched[i], r))
      .filter(Boolean);

    // Discogs full-text search always returns SOMETHING. Before 2026-09-25
    // its top hit was taken on trust, so "Dj.Mc - Walk Ya Down" (Bandcamp)
    // became a 33-track DJ Revolution mixtape. Keep only releases whose
    // artist AND title agree with what was pasted.
    // Title-only: the title often still holds the artist ("Chateau
    // Flight.Dam House ep"), so check it against artist + release title.
    const plausible = releases.filter(r => (artist
      ? isPlausibleMatch(r, artist, title)
      : namesAgree(title, `${r.artist} ${r.release_title}`, 1) && labels.some(l => namesAgree(l, r.label))));
    if (!plausible.length) return null;

    // Primary result = first one (best match from Discogs ranking)
    const primary = plausible[0];
    return {
      ...primary,
      all_releases: plausible.length > 1 ? plausible : null, // only include if multiple
    };
  } catch {
    return null;
  }
}


// ─── Platform resolvers ───────────────────────────────────────────────────────

async function resolveYouTube(url) {
  const videoId = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
  if (!videoId) throw new Error('Invalid YouTube URL');
  // Always use a clean URL — strip playlist/radio params
  url = `https://www.youtube.com/watch?v=${videoId}`;

  // ── Step 1: oEmbed (free, no quota) ──────────────────────────────────────
  // Gets us title + channel name reliably without touching the Data API quota
  // hqdefault exists for every video; maxresdefault only for HD uploads —
  // older ones 404 into YouTube's grey placeholder, so it's never assumed.
  let rawTitle = '', channelTitle = '', thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  try {
    const oe = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (oe.ok) {
      const d = await oe.json();
      rawTitle = d.title || '';
      channelTitle = d.author_name || '';
      if (d.thumbnail_url) thumb = d.thumbnail_url;
    }
  } catch { /* ignore */ }
  // If oEmbed failed (dead/private video), we still have the video ID
  // Return a minimal result so the embed + manual editing still works
  if (!rawTitle) {
    return {
      platform: 'youtube',
      detected_type: 'single',
      stream_url: `https://www.youtube.com/watch?v=${videoId}`,
      embed_url: `https://www.youtube.com/embed/${videoId}`,
      cover_image: thumb,
      year: null, tracks: [], artists: [], artist: '', channel: null,
      title: '', label: '', catNo: '', genres: ['Electronic'],
      discogs_id: null, videos: [], source: 'platform',
      warning: 'Video unavailable — title could not be fetched. Please fill in manually.',
    };
  }

  // ── Step 2: Data API (optional — enriches duration + topic genres) ────────
  let duration = 0;
  let topicCategories = [];
  let tags = [];
  let description = '';
  let publishedYear = '';

  if (YOUTUBE_API_KEY) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,topicDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
      const apiRes = await fetch(apiUrl);
      const apiData = await apiRes.json();
      if (apiRes.ok && !apiData.error && apiData.items?.[0]) {
        const item = apiData.items[0];
        const snippet = item.snippet;
        description = snippet.description || '';
        tags = snippet.tags || [];
        publishedYear = snippet.publishedAt?.substring(0, 4) || '';
        topicCategories = item.topicDetails?.topicCategories || [];
        const th = snippet.thumbnails || {};
        thumb = th.maxres?.url || th.standard?.url || th.high?.url || thumb;
        const durStr = item.contentDetails?.duration || '';
        const durMatch = durStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (durMatch) {
          duration = (parseInt(durMatch[1] || 0) * 3600) + (parseInt(durMatch[2] || 0) * 60) + parseInt(durMatch[3] || 0);
        }
      }
      // If quota exceeded, just continue with oEmbed data
    } catch { /* Data API unavailable — continue with oEmbed data */ }
  }

  // ── Step 3: Parse title + detect type ────────────────────────────────────
  let genres = genresFromTopicCategories(topicCategories);
  if (!genres.length) genres = genresFromKeywords(rawTitle + ' ' + tags.join(' ') + ' ' + description);
  if (!genres.length) genres = ['Electronic'];

  // "Artist - Topic" auto-channels: the title is the bare track title and the
  // channel name IS the artist, minus the suffix. Without this the artist was
  // saved as "Rachel Kitchlew - Topic" and Discogs never matched (post 40).
  const isTopic = / - Topic$/.test(channelTitle);
  const topicMeta = isTopic ? parseTopicDescription(description) : null;
  const parsed = isTopic ? null : parseYouTubeTitle(rawTitle, channelTitle);
  let artist, artists, channel, title;
  let search = null; // what findDiscogsRelease gets

  if (isTopic) {
    const channelArtist = channelTitle.replace(/ - Topic$/, '').trim();
    title = rawTitle;
    artists = topicMeta?.artists?.length
      ? topicMeta.artists.map(name => ({ name }))
      : [{ name: channelArtist }];
    artist = artists.map(a => a.name).join(', ');
    channel = null;
    search = { artist: channelArtist, title: rawTitle, album: topicMeta?.release, labels: [topicMeta?.label] };
  } else if (parsed) {
    artists = parsed.artists;
    artist = artists.map(a => a.name).join(' B2B ');
    channel = parsed.channel;
    title = rawTitle;
    search = { artist, title };
  } else {
    // Same cleanup as SoundCloud: premiere prefixes, "[CAT001]", "(Official
    // Video)", label tags. No "Artist - Title" split -> the channel is shown
    // as the artist, and searched as the uploader.
    const rt = parseReleaseTitle(rawTitle);
    artist = rt.artist || channelTitle;
    title = rt.title || rawTitle;
    artists = splitArtists(artist);
    channel = null;
    search = { artist: rt.artist, title, labels: [channelTitle, ...rt.hints], catNo: rt.catNo, uploader: channelTitle };
  }

  // Topic uploads are always released music, never a set — the description
  // template would otherwise trip the livemix keyword scan.
  let postType = isTopic ? 'single' : detectPostType({ platform: 'youtube', duration, title: rawTitle, tags, description });

  // ── Step 4: Discogs reverse lookup for non-live ───────────────────────────
  let discogsData = null;
  if (postType !== 'livemix' && search?.title) {
    discogsData = await findDiscogsRelease(search);
    // Re-evaluate type now we know the real track count from Discogs
    if (discogsData?.tracks?.length) {
      postType = detectPostType({ platform: 'youtube', duration, title: rawTitle, tags, description, tracks: discogsData.tracks, catNo: discogsData.catNo });
    }
  }
  // A set always knows its channel: the uploader, when the title didn't name
  // one ("Surgeon - Live at …"). Channel spotlights group sets by it.
  if (postType === 'livemix' && !channel) channel = channelTitle.replace(/ - Topic$/, '') || null;
  if (postType === 'livemix' && genres.length <= 1 && artists.length > 0) {
    const dResult = await discogsSearch(artists[0].name);
    if (dResult?.genre?.length) genres = [...new Set([...genres, ...dResult.genre])];
  }

  return {
    platform: 'youtube',
    detected_type: postType,
    _search: search,
    stream_url: `https://www.youtube.com/watch?v=${videoId}`,
    embed_url: `https://www.youtube.com/embed/${videoId}`,
    // Release art when Discogs matched; the video thumbnail is a screenshot
    // or a letterboxed upload, not the sleeve.
    cover_image: discogsData?.cover_image || thumb,
    year: discogsData?.year || topicMeta?.year || publishedYear,
    tracks: discogsData?.tracks || [],
    artists,
    artist,
    channel: channel || null,
    title,
    label: discogsData?.label || topicMeta?.label || '',
    catNo: discogsData?.catNo || '',
    genres: discogsData?.genres || genres,
    discogs_id: discogsData?.discogs_id || null,
    videos: discogsData?.videos || [],
    all_releases: discogsData?.all_releases || null,
    source: discogsData ? 'discogs' : 'platform',
  };
}
// ─── Shared: title parsing + the Discogs search every platform uses ──────────
//
// Built for SoundCloud on 2026-10-02 (0/17 Discogs hits -> 8/19), then given
// to every platform: each resolver reads the richest source its platform has
// (page data, public API) and hands findDiscogsRelease whatever it learned —
// artist, title, the album it's on, label, catalogue number, barcode.

const UA = { 'User-Agent': 'LNV/0.1 (+https://github.com/gabrieljcdev/LNV)' };
// Node's built-in fetch, not node-fetch: Beatport's Cloudflare answers
// node-fetch with a 403 challenge page and the built-in client with the real
// page, same honest User-Agent either way (checked 2026-10-02).
const pageFetch = globalThis.fetch;

async function fetchHtml(url) {
  try {
    const res = await pageFetch(url, { headers: UA });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  try {
    const res = await pageFetch(url, { headers: UA });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const decodeHtml = s => (s || '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'");

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// <meta property="og:title" content="…"> / <meta name="music:release_date" …>
const metaTag = (html, prop) => decodeHtml(html?.match(new RegExp(`<meta (?:property|name)="${escapeRe(prop)}"\\s+content="([^"]*)"`))?.[1]);
const metaTags = (html, prop) => [...(html || '').matchAll(new RegExp(`<meta (?:property|name)="${escapeRe(prop)}"\\s+content="([^"]*)"`, 'g'))].map(m => decodeHtml(m[1]));

// Every <script type="application/ld+json"> object on a page, @graph flattened.
function jsonLd(html) {
  const out = [];
  for (const m of (html || '').matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
    try {
      const j = JSON.parse(m[1]);
      out.push(...(j['@graph'] || (Array.isArray(j) ? j : [j])));
    } catch { /* not JSON */ }
  }
  return out;
}

// "PRX026", "BONK003", "STEAK 003", "SYEP-032". Upper-case letters only, so
// "Code 718" (an artist) isn't one; years ("ADE 2024") are excluded below.
const CATNO_RE = /^([A-Z]{2,6}[A-Z0-9]{0,2})[\s-]?(\d{2,4}[A-Z]?)$/;
const isCatNo = s => {
  const m = (s || '').trim().match(CATNO_RE);
  return !!m && !/^(19|20)\d\d$/.test(m[2]);
};
// Bracketed or separated bits that are never part of artist or title.
const TITLE_NOISE = /^(?:free\s*(?:dl|download)|out\s+now|clips?|snippets?|preview|teaser|forthcoming|exclusive|premiere|full\s+(?:ep|album)|buy\s*=\s*free(?:\s*dl)?|#\d+.*)$/i;
// Kept in titles: these name a real version of a track.
const VERSION_RE = /\b(?:remix|edit|mix|version|dub|rework|vip|remaster(?:ed)?|bootleg|instrumental|re-?(?:wash|edit|work|fix|touch|lick|mix)|refix|flip|rub)\b/i;
const FEAT_RE = /^(?:feat\.?|ft\.?|featuring)\s/i;
const LABELISH_RE = /\b(?:records|recordings|music|audio|label|rec\.?)$/i;

// Split on " - ", " – ", " // ", " | " but never inside brackets, so
// "Equinox (Henrik Schwarz Remix - Dixon Edit)" stays one piece.
function splitTopLevel(s) {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    const sep = depth === 0 && s.slice(i).match(/^\s+(?:-|–|—|\/\/|\|)\s+/);
    if (sep) { out.push(cur); cur = ''; i += sep[0].length - 1; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

/**
 * Free-form upload titles (SoundCloud, YouTube, Bandcamp):
 * "552# PREMIERE: Kai Stein - Into The Ritual [Krachtvoer] by Tucca Premiere"
 *   -> { artist: 'Kai Stein', title: 'Into The Ritual', catNo: '', hints: ['Krachtvoer'] }
 * hints = bracketed words that weren't a catalogue number, a version or a
 * feature credit — almost always the label, used to confirm a title-only /
 * catno match.
 */
function parseReleaseTitle(raw, uploader = '') {
  let t = (raw || '').trim();
  if (uploader) t = t.replace(new RegExp(`\\s+by\\s+${escapeRe(uploader)}$`, 'i'), '');
  // Everything up to "premiere" near the start is channel branding:
  // "SYN Premiere: ", "[PREMIERE] | ", "*Premiere* ", "552# PREMIERE: ".
  t = t.replace(/^.{0,30}?\bpremiere\b\s*[*\]]?\s*(?:[:|\-–]\s*)?/i, '');

  let catNo = '';
  const hints = [];
  t = t.replace(/\s*[[(]([^\])]*)[\])]/g, (whole, inner) => {
    const v = inner.trim();
    if (isCatNo(v)) { catNo = catNo || v; return ''; }
    if ((VERSION_RE.test(v) || FEAT_RE.test(v)) && !TITLE_NOISE.test(v)) return whole;
    if (v && !TITLE_NOISE.test(v) && !/^(?:official|music|lyric|audio|video|visuali[sz]er|hd|hq|4k)\b/i.test(v)) hints.push(v.replace(/\s+EP$/i, ''));
    return '';
  });

  const parts = splitTopLevel(t).filter(p => {
    if (isCatNo(p)) { catNo = catNo || p; return false; }
    if (TITLE_NOISE.test(p)) return false;
    if (LABELISH_RE.test(p)) { hints.push(p); return false; }
    return true;
  });
  const unquote = s => s.replace(/^["“'](.*)["”']$/, '$1').trim();

  let artist = '', title = '';
  if (parts.length >= 2) {
    artist = parts[0];
    title = parts.slice(1).join(' - ');
  } else if (parts.length === 1) {
    // ANNĒ "St. Strings"
    const q = parts[0].match(/^(.+?)\s+["“](.+?)["”]$/);
    if (q) { artist = q[1]; title = q[2]; } else title = parts[0];
  }
  return { artist: unquote(artist), title: unquote(title), catNo, hints };
}

/**
 * Streaming-service track titles carry the version after a dash:
 * "Feel It All Around - Total M Remix" -> "Feel It All Around (Total M Remix)"
 * (Discogs' form); "Song - 2011 Remaster" -> "Song" (the original release).
 */
function normaliseVersionTitle(t = '') {
  const m = t.trim().match(/^(.+?)\s+-\s+(.+)$/);
  if (!m) return t.trim();
  const [, base, suffix] = m;
  if (/\bremaster(?:ed)?\b|\bmono\b|\bstereo\b|\bdeluxe\b|\banniversary\b/i.test(suffix)) return base.trim();
  if (VERSION_RE.test(suffix) || /\blive\b|^(?:feat\.?|ft\.?|with)\s/i.test(suffix)) return `${base.trim()} (${suffix.trim()})`;
  return t.trim();
}

// "Life Of Leisure - EP" / "Walk Ya Down - Single" -> the release name.
const stripReleaseSuffix = s => (s || '').replace(/\s+-\s+(?:EP|Single|LP|Album)$/i, '').trim();

/**
 * Label names out of copyright lines:
 * "℗ 2009 Kemado Records, Inc. D/B/A Mexican Summer" -> ['Mexican Summer', 'Kemado Records']
 */
function labelsFromCopyright(...lines) {
  const out = [];
  for (const raw of lines.flat()) {
    if (!raw) continue;
    const s = String(raw).replace(/^\s*(?:℗|©|\(p\)|\(c\))?\s*(?:\d{4}\s*)?/i, '').trim();
    const parts = s.split(/\s+(?:d\/b\/a|under (?:exclusive )?licen[cs]e to|distributed by|marketed by|a division of)\s+/i);
    for (const part of parts.reverse()) {
      const name = part.replace(/,?\s*(?:inc|ltd|llc|limited|gmbh|b\.?v|s\.?a)\.?$/i, '').replace(/[,.]\s*$/, '').trim();
      if (name.length > 1) out.push(name);
    }
  }
  return [...new Set(out)];
}

const secondsToClock = s => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

/**
 * Discogs lookup by catalogue number. Discogs' free-text search matches
 * catnos well, but they aren't unique across labels, so a hit must also
 * agree on the artist or one of the label hints.
 */
async function tryCatNoLookup(catNo, artist, labels = []) {
  try {
    const data = await searchDiscogs(catNo, 'release');
    const want = squash(catNo);
    const results = (data?.results || []).filter(r => squash(r.catno) === want).slice(0, 5);
    const fetched = await Promise.all(results.map(r => discogsRelease(r.id)));
    for (let i = 0; i < results.length; i++) {
      const rel = fetched[i] && toLookupRelease(fetched[i], results[i]);
      if (!rel) continue;
      const credits = [...rel.artists.map(a => a.name), ...rel.tracks.flatMap(t => t.artists.map(a => a.name)), ...rel.remixers];
      // "BONK003" is MC Sharkey on Bonkers AND R 417 on BONKERS Society, so
      // the label only stands in when there's no artist to check.
      const ok = artist
        ? credits.some(n => namesAgree(artist, n))
        : labels.some(l => namesAgree(l, rel.label));
      if (ok) return { ...rel, all_releases: null };
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * Discogs lookup by UPC/EAN (Deezer, Beatport). Near-unique, so any
 * agreement on artist or title will do — it's there to catch a mistyped or
 * reused barcode, not to second-guess a real hit.
 */
async function tryBarcodeLookup(barcode, artist, title) {
  try {
    const data = await searchDiscogsBarcode(barcode);
    const results = (data?.results || []).slice(0, 3);
    const fetched = await Promise.all(results.map(r => discogsRelease(r.id)));
    for (let i = 0; i < results.length; i++) {
      const rel = fetched[i] && toLookupRelease(fetched[i], results[i]);
      if (!rel) continue;
      const credits = [...rel.artists.map(a => a.name), ...rel.tracks.flatMap(t => t.artists.map(a => a.name)), ...rel.remixers];
      if ((artist && credits.some(n => namesAgree(artist, n))) || (title && namesAgree(title, rel.release_title))) {
        return { ...rel, all_releases: null };
      }
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * The Discogs search every platform shares: most specific key first, stop
 * at the first plausible match, at most 6 searches. Any field may be empty.
 *   artist    who made it (NOT the uploading account)
 *   title     the pasted track's or release's title
 *   album     the release a pasted track is on, when known
 *   labels    label names / hints — confirm title-only and catno matches
 *   catNo     catalogue number
 *   barcode   UPC/EAN
 *   uploader  account name, tried as the artist when there's no artist
 */
async function findDiscogsRelease({ artist = '', title = '', album = '', labels = [], catNo = '', barcode = '', uploader = '' } = {}) {
  labels = [...new Set(labels.filter(Boolean))];
  const attempts = [];
  const add = (key, run) => { if (!attempts.some(a => a.key === key)) attempts.push({ key, run }); };
  const lookup = (a, t) => t && add(`${a}|${t}`.toLowerCase(), () => tryDiscogsLookup(a, t));

  if (barcode) add('barcode', () => tryBarcodeLookup(barcode, artist, album || title));
  // The album a track is on finds the right release more reliably than the
  // track title (an album track's title isn't a release title).
  if (artist) { lookup(artist, album); lookup(artist, title); }
  if (catNo) add('catno', () => tryCatNoLookup(catNo, artist, labels));
  // No artist anywhere: the uploader might be the artist's own account.
  if (!artist && uploader) { lookup(uploader, album); lookup(uploader, title); }
  // Title alone, but only accepted when a label agrees.
  if (!artist && labels.length) {
    for (const t of [album, title]) if (t) add(`title-only|${t}`.toLowerCase(), () => tryDiscogsLookup('', t, { labels }));
  }

  for (const a of attempts.slice(0, 6)) {
    const hit = await a.run();
    if (hit) return hit;
  }
  return null;
}

// The fields every non-live resolver fills the same way once it has (or
// hasn't) landed on a Discogs release.
const discogsFields = (d, fallback = {}) => ({
  cover_image: d?.cover_image || fallback.cover || null,
  year: d?.year || fallback.year || null,
  tracks: d?.tracks?.length ? d.tracks : (fallback.tracks || []),
  label: d?.label || fallback.label || '',
  catNo: d?.catNo || fallback.catNo || '',
  genres: d?.genres?.length ? d.genres : (fallback.genres?.length ? fallback.genres : ['Electronic']),
  discogs_id: d?.discogs_id || null,
  videos: d?.videos || [],
  all_releases: d?.all_releases || null,
  source: d ? 'discogs' : 'platform',
});

// Type once the real tracklist is known.
const typeFromTracks = (platform, title, d, fallbackType) => (d?.tracks?.length
  ? detectPostType({ platform, title, tracks: d.tracks, catNo: d.catNo })
  : fallbackType);

// ─── When Discogs has no exact release ────────────────────────────────────────
//
// gabriel, 2026-10-02: a miss should still fill the post as deeply as
// possible, double/triple-checked. resolveWithFallback() runs after any
// resolver whose findDiscogsRelease() came back empty:
//   1. cross-check — iTunes, Deezer and MusicBrainz in parallel; a candidate
//      only counts when its title AND its artist (or, with no artist, its
//      label / the uploader) agree with what was pasted;
//   2. second Discogs pass with what they found: a MusicBrainz -> Discogs
//      link, barcodes, a catalogue number, the real artist, the album;
//   3. Discogs "neighbourhood" — still no release, but the artist and label
//      exist on Discogs: attach their real ids (what spotlights and
//      discographies resolve against) and take genre/style tags from their
//      other records.
// Partial data only fills fields the platform left empty, and the response
// says where it came from (fill_sources).

const FALLBACK_TIMEOUT_MS = 6000;

// Small in-process memo: the same link is often pasted twice in a row
// (fetch, edit, fetch again). Discogs calls have their own SQLite cache.
const memo = new Map();
async function memoised(key, fn, ttlMs = 6 * 3600e3) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn().catch(() => null);
  memo.set(key, { t: Date.now(), v });
  if (memo.size > 500) memo.delete(memo.keys().next().value);
  return v;
}

const getJson = url => pageFetch(url, { headers: { ...UA, Accept: 'application/json' }, signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS) })
  .then(r => (r.ok ? r.json() : null))
  .catch(() => null);

// MusicBrainz allows one request a second per client — queue them.
let mbQueue = Promise.resolve();
function mbJson(path) {
  const run = mbQueue.then(() => getJson(`https://musicbrainz.org/ws/2/${path}${path.includes('?') ? '&' : '?'}fmt=json`));
  mbQueue = run.then(() => new Promise(r => setTimeout(r, 1100)));
  return run;
}
const luceneSafe = s => (s || '').replace(/["\\]/g, ' ').trim();

/**
 * Does a candidate from another catalogue describe the pasted thing? Title
 * must agree both ways (so "Vibration" doesn't take "Moon Vibration"); then
 * the artist — or, with no artist known, a label or the uploader.
 */
function candidateAgrees(c, s) {
  const want = s.kind === 'album' ? (s.album || s.title) : s.title;
  const got = s.kind === 'album' ? c.album : c.title;
  if (!want || !got || !namesAgree(want, got, 1) || !namesAgree(got, want, 0.67)) return false;
  if (s.artist) return namesAgree(s.artist, c.artist) || namesAgree(c.artist, s.artist);
  return (s.labels || []).some(l => namesAgree(l, c.label)) || (!!s.uploader && namesAgree(s.uploader, c.artist));
}

async function itunesCandidate(s) {
  const entity = s.kind === 'album' ? 'album' : 'song';
  const term = `${s.artist || s.uploader || ''} ${s.kind === 'album' ? (s.album || s.title) : s.title}`.trim();
  const d = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=10`);
  const hit = (d?.results || [])
    .map(r => ({ r, c: { artist: r.artistName, title: normaliseVersionTitle(r.trackName || ''), album: stripReleaseSuffix(r.collectionName), label: '' } }))
    .find(({ c }) => candidateAgrees(c, s));
  if (!hit) return null;
  const { r } = hit;
  const look = await getJson(`https://itunes.apple.com/lookup?id=${r.collectionId}&entity=song`);
  const coll = (look?.results || []).find(x => x.wrapperType === 'collection') || r;
  const songs = (look?.results || []).filter(x => x.wrapperType === 'track');
  return {
    source: 'itunes',
    artist: r.artistName,
    title: hit.c.title,
    album: hit.c.album,
    label: labelsFromCopyright(coll.copyright)[0] || '',
    year: (coll.releaseDate || r.releaseDate || '').slice(0, 4),
    cover: (coll.artworkUrl100 || r.artworkUrl100)?.replace('100x100', '600x600') || null,
    genres: [coll.primaryGenreName || r.primaryGenreName].filter(Boolean),
    tracks: songs.map(t => ({ position: String(t.trackNumber || ''), title: normaliseVersionTitle(t.trackName), duration: secondsToClock(Math.round((t.trackTimeMillis || 0) / 1000)), artists: [] })),
  };
}

async function deezerCandidate(s) {
  const albumMode = s.kind === 'album';
  const q = `${s.artist || s.uploader || ''} ${albumMode ? (s.album || s.title) : s.title}`.trim();
  const d = await getJson(`https://api.deezer.com/search${albumMode ? '/album' : ''}?q=${encodeURIComponent(q)}&limit=10`);
  const hit = (d?.data || []).find(x => candidateAgrees({
    artist: x.artist?.name, title: normaliseVersionTitle(x.title || ''), album: albumMode ? x.title : x.album?.title, label: '',
  }, s));
  if (!hit) return null;
  const album = await getJson(`https://api.deezer.com/album/${albumMode ? hit.id : hit.album.id}`);
  return {
    source: 'deezer',
    artist: hit.artist?.name || '',
    title: albumMode ? '' : normaliseVersionTitle(hit.title),
    album: album?.title || '',
    label: album?.label || '',
    barcode: album?.upc || '',
    year: (album?.release_date || '').slice(0, 4),
    cover: album?.cover_xl || null,
    genres: (album?.genres?.data || []).map(g => g.name),
    tracks: (album?.tracks?.data || []).map((t, i) => ({ position: String(i + 1), title: normaliseVersionTitle(t.title || ''), duration: secondsToClock(t.duration), artists: [] })),
  };
}

async function musicbrainzCandidate(s) {
  const credit = ac => (ac || []).map(c => `${c.name}${c.joinphrase || ''}`).join('').trim();
  let releaseId = null, mbArtist = '', mbTitle = '';
  const artistQ = s.artist ? ` AND artist:"${luceneSafe(s.artist)}"` : '';
  if (s.kind === 'album') {
    const d = await mbJson(`release/?query=${encodeURIComponent(`release:"${luceneSafe(s.album || s.title)}"${artistQ}`)}&limit=10`);
    const hit = (d?.releases || []).find(r => candidateAgrees({
      artist: credit(r['artist-credit']), album: r.title, label: r['label-info']?.[0]?.label?.name || '',
    }, s));
    if (!hit) return null;
    releaseId = hit.id; mbArtist = credit(hit['artist-credit']);
  } else {
    const d = await mbJson(`recording/?query=${encodeURIComponent(`recording:"${luceneSafe(s.title)}"${artistQ}`)}&limit=10`);
    const hit = (d?.recordings || []).find(r => candidateAgrees({ artist: credit(r['artist-credit']), title: r.title, label: '' }, s));
    if (!hit) return null;
    mbArtist = credit(hit['artist-credit']); mbTitle = hit.title;
    // The release it's on: the named album if we know it, else the earliest
    // official one.
    const rels = [...(hit.releases || [])].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const pick = (s.album && rels.find(r => namesAgree(s.album, r.title)))
      || rels.find(r => r.status === 'Official') || rels[0];
    releaseId = pick?.id || null;
  }
  if (!releaseId) return { source: 'musicbrainz', artist: mbArtist, title: mbTitle };
  const rel = await mbJson(`release/${releaseId}?inc=labels+url-rels+recordings+artist-credits+genres+release-groups`);
  if (!rel) return { source: 'musicbrainz', artist: mbArtist, title: mbTitle };
  const li = (rel['label-info'] || []).find(l => l.label?.name) || {};
  return {
    source: 'musicbrainz',
    artist: mbArtist || credit(rel['artist-credit']),
    title: mbTitle,
    album: rel.title || '',
    label: li.label?.name || '',
    catNo: li['catalog-number'] && !/^\[none\]$/i.test(li['catalog-number']) ? li['catalog-number'] : '',
    barcode: rel.barcode || '',
    year: (rel.date || '').slice(0, 4),
    cover: rel['cover-art-archive']?.front ? `https://coverartarchive.org/release/${releaseId}/front-500` : null,
    genres: [...(rel.genres || []), ...(rel['release-group']?.genres || [])].map(g => g.name),
    tracks: (rel.media || []).flatMap(m => m.tracks || []).map((t, i) => ({
      position: t.number || String(i + 1), title: t.title, duration: secondsToClock(Math.round((t.length || 0) / 1000)),
      artists: (t['artist-credit'] || []).map(c => ({ name: c.name })),
    })),
    discogsIds: (rel.relations || []).filter(r => r.type === 'discogs')
      .map(r => r.url?.resource?.match(/discogs\.com\/release\/(\d+)/)?.[1]).filter(Boolean),
  };
}

/** Steps 1: every agreeing candidate, merged field by field. */
async function crossCheck(s) {
  const key = `xc|${s.kind}|${s.artist}|${s.uploader}|${s.title}|${s.album}`.toLowerCase();
  return memoised(key, async () => {
    const found = (await Promise.all([musicbrainzCandidate(s), deezerCandidate(s), itunesCandidate(s)]))
      .filter(Boolean);
    if (!found.length) return null;
    // Field priority: MusicBrainz is curated (catno, barcode, canonical
    // credit), Deezer has the best covers and label strings, iTunes fills gaps.
    const first = f => found.map(c => c[f]).find(v => (Array.isArray(v) ? v.length : v)) || (f === 'tracks' || f === 'genres' ? [] : '');
    return {
      sources: found.map(c => c.source),
      artist: first('artist'),
      album: first('album'),
      label: first('label'),
      labels: [...new Set(found.map(c => c.label).filter(Boolean))],
      catNo: first('catNo'),
      barcodes: [...new Set(found.map(c => c.barcode).filter(Boolean))],
      year: found.map(c => c.year).filter(Boolean).sort()[0] || '',   // earliest
      cover: found.find(c => c.source === 'deezer')?.cover || first('cover'),
      genres: [...new Set(found.flatMap(c => c.genres || []))],
      tracks: first('tracks'),
      discogsIds: found.flatMap(c => c.discogsIds || []),
    };
  });
}

/** Step 2: a second Discogs pass with what the cross-check learned. */
async function discogsFromCrossCheck(x, s) {
  const artist = s.artist || x.artist;
  const labels = [...(s.labels || []), ...x.labels];
  for (const id of x.discogsIds.slice(0, 2)) {
    const raw = await discogsRelease(id);
    const rel = raw && toLookupRelease(raw);
    // MusicBrainz' link is curated; the artist check catches a stale one.
    if (rel && isPlausibleMatch(rel, artist, '')) return { ...rel, all_releases: null };
  }
  for (const b of x.barcodes.slice(0, 2)) {
    const hit = await tryBarcodeLookup(b, artist, x.album || s.title);
    if (hit) return hit;
  }
  if (x.catNo) {
    const hit = await tryCatNoLookup(x.catNo, artist, labels);
    if (hit) return hit;
  }
  // The real artist (an uploader-only paste) and/or the album a track is on.
  if ((!s.artist && x.artist) || (x.album && !namesAgree(x.album, s.album || ''))) {
    return findDiscogsRelease({ ...s, artist, album: s.album || x.album, labels, catNo: '', barcode: '', uploader: '' });
  }
  return null;
}

// Discogs names carry a disambiguation suffix: "Praxis (2)".
const bareName = n => (n || '').replace(/\s*\(\d+\)$/, '');

/**
 * Step 3: no release, but the artist / label are on Discogs. Same-name
 * entities ("Praxis", "Praxis (2)", …) are told apart by the other side:
 * an artist whose releases include the label, a label whose releases
 * include the artist. Ambiguity with nothing to tell them apart -> no id
 * (a wrong id would wire the post to someone else's discography).
 */
async function discogsNeighbours({ artist, labels = [] }) {
  labels = [...new Set(labels.filter(Boolean))];
  const exact = async (name, type) => {
    const d = await searchDiscogs(name, type).catch(() => null);
    return (d?.results || []).filter(r => squash(bareName(r.title)) === squash(name)).slice(0, 3);
  };
  const out = { artist: null, label: null, genres: [] };

  if (artist) {
    const cands = await exact(artist, 'artist');
    if (cands.length === 1 && !labels.length) out.artist = { id: cands[0].id, name: bareName(cands[0].title) };
    else if (cands.length) {
      for (const c of cands) {
        const rel = await getArtistReleases(c.id).catch(() => null);
        if ((rel?.releases || []).some(r => labels.some(l => namesAgree(l, r.label || '')))) {
          out.artist = { id: c.id, name: bareName(c.title) };
          break;
        }
      }
      if (!out.artist && cands.length === 1) out.artist = { id: cands[0].id, name: bareName(cands[0].title) };
    }
  }

  for (const label of labels.slice(0, 2)) {
    const cands = await exact(label, 'label');
    if (cands.length === 1) { out.label = { id: cands[0].id, name: bareName(cands[0].title) }; break; }
    for (const c of cands) {
      const rel = await getLabelReleases(c.id).catch(() => null);
      if (artist && (rel?.releases || []).some(r => namesAgree(artist, r.artist || ''))) {
        out.label = { id: c.id, name: bareName(c.title) };
        break;
      }
    }
    if (out.label) break;
  }

  // Genre/style tags off their other records (Discogs search rows carry
  // genre[] and style[]). Most common first; styles after genres, the same
  // order a Discogs release gives them.
  const genreCount = new Map(), styleCount = new Map();
  const tally = rows => rows.forEach(r => {
    (r.genre || []).forEach(g => genreCount.set(g, (genreCount.get(g) || 0) + 1));
    (r.style || []).forEach(g => styleCount.set(g, (styleCount.get(g) || 0) + 1));
  });
  if (out.artist) {
    const d = await searchDiscogs(out.artist.name, 'release').catch(() => null);
    // Exact name only: a loose match let "Jack Teagarden" tag Jack Fresia as Jazz.
    tally((d?.results || []).filter(r => squash(bareName((r.title || '').split(' - ')[0])) === squash(out.artist.name)));
  }
  if (out.label) {
    const d = await searchDiscogs(out.label.name, 'release').catch(() => null);
    tally((d?.results || []).filter(r => (r.label || []).some(l => namesAgree(out.label.name, l))).slice(0, 20));
  }
  const top = m => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  out.genres = [...top(genreCount).slice(0, 2), ...top(styleCount).slice(0, 4)];
  return out;
}

const isDefaultGenres = g => !g?.length || (g.length === 1 && g[0] === 'Electronic');

/**
 * Runs after a resolver whose own Discogs search missed. Either upgrades the
 * result to a full Discogs match (second pass) or fills its blanks.
 * Mutates and returns `result`.
 */
async function resolveWithFallback(result) {
  const s = result._search;
  if (!s || result.discogs_id || result.detected_type === 'livemix' || !s.title) return result;
  s.labels = [...new Set((s.labels || []).filter(Boolean))];
  const sources = [];

  const x = await crossCheck(s);
  if (x) {
    const d = await discogsFromCrossCheck(x, s);
    if (d) {
      Object.assign(result, discogsFields(d, {}), {
        detected_type: s.kind === 'album' ? result.detected_type : typeFromTracks(result.platform, result.title, d, result.detected_type),
        fill_sources: [...x.sources, 'discogs'],
      });
      if (s.kind === 'album' && d.release_title) result.title = d.release_title;
      return result;
    }
    sources.push(...x.sources);
    // Fill only what the platform left empty.
    if (!s.artist && x.artist) {
      result.artist = x.artist;
      result.artists = splitArtists(x.artist);
    }
    // A ℗ line naming the artist is a self-release, not a label.
    const xLabel = x.labels.find(l => !namesAgree(l, result.artist || x.artist || ''));
    result.label ||= xLabel || '';
    result.catNo ||= x.catNo;
    result.year ||= x.year;
    result.cover_image ||= x.cover;
    if (!result.tracks?.length && x.tracks.length) result.tracks = x.tracks;
    if (x.genres.length) result.genres = [...new Set([...(isDefaultGenres(result.genres) ? [] : result.genres), ...x.genres])];
  }

  const near = await discogsNeighbours({
    artist: result.artist && result.artist !== s.uploader ? result.artist : (s.artist || x?.artist || ''),
    labels: [result.label, ...(x?.labels || []), ...s.labels]
      .filter(l => l && !namesAgree(l, result.artist || s.artist || x?.artist || '')),
  });
  if (near.artist) {
    sources.push('discogs-artist');
    // Attach the id to the matching credit (the shape posts.js saves).
    result.artists = (result.artists?.length ? result.artists : splitArtists(near.artist.name))
      .map(a => (namesAgree(a.name, near.artist.name) && namesAgree(near.artist.name, a.name) ? { ...a, id: near.artist.id } : a));
  }
  if (near.label) {
    sources.push('discogs-label');
    result.label ||= near.label.name;
    if (namesAgree(result.label, near.label.name)) result.label_id = near.label.id;
  }
  if (near.genres.length) result.genres = [...new Set([...(isDefaultGenres(result.genres) ? [] : result.genres), ...near.genres])];
  if (result.genres?.length > 8) result.genres = result.genres.slice(0, 8);

  if (sources.length) result.fill_sources = [...new Set(sources)];
  return result;
}

// ─── SoundCloud ───────────────────────────────────────────────────────────────
//
// oEmbed's author_name is the UPLOADER — usually a label or premiere channel,
// not the artist — and its title is "[PREMIERE] | Nozlin - Vibration
// [PRTL009] by POLISH TECHNO.LOGY". The track page itself carries the real
// data in window.__sc_hydration: publisher_metadata { artist, album_title,
// release_title, publisher }, label_name, release_date, duration, genre, and
// a set's tracklist. Title parsing is the fallback.

/** The page's hydration blob -> the 'sound' or 'playlist' object, or null. */
async function fetchSoundCloudPage(url) {
  const html = await fetchHtml(url);
  const m = html?.match(/window\.__sc_hydration = (\[.*?\]);<\/script>/s);
  if (!m) return null;
  try {
    const item = JSON.parse(m[1]).find(x => x.hydratable === 'sound' || x.hydratable === 'playlist');
    return item ? { kind: item.hydratable, ...item.data } : null;
  } catch {
    return null;
  }
}

async function resolveSoundCloud(url) {
  let search = null; // for resolveWithFallback when Discogs misses
  url = url.split('#')[0];
  const isPlaylist = url.includes('/sets/');
  // A track opened from a set carries ?in=label/sets/...; the track is what
  // was pasted, so drop it (the embed and page lookups want the bare URL).
  const pageUrl = url.split('?')[0];

  const [oembed, page] = await Promise.all([
    fetchJson(`https://soundcloud.com/oembed?url=${encodeURIComponent(pageUrl)}&format=json`),
    fetchSoundCloudPage(pageUrl),
  ]);

  const uploader = page?.user?.username || oembed?.author_name || '';
  const rawTitle = page?.title || oembed?.title || '';
  const pm = page?.publisher_metadata || {};
  const parsed = parseReleaseTitle(rawTitle, uploader);

  // Last resort when both lookups failed: the URL slug.
  if (!parsed.title) {
    const slug = pageUrl.replace(/^https?:\/\/(?:m\.)?soundcloud\.com\//, '').split('/').pop() || '';
    parsed.title = slug.replace(/-/g, ' ');
  }
  // Catalogue number glued into the slug: "nsr26-mausio-ep", "...-real010-clips".
  if (!parsed.catNo) {
    const slugCat = pageUrl.split('/').pop().split('-').find(w => /^[a-z]{2,6}\d{2,4}$/.test(w));
    if (slugCat) parsed.catNo = slugCat.toUpperCase();
  }

  // The title's "Artist - Title" split beats publisher_metadata.artist, which
  // label/premiere accounts often fill with their own name ("Techno Germany",
  // "Tucca Premiere / Kai Stein").
  const pmArtist = pm.artist && !namesAgree(pm.artist, uploader) ? pm.artist.trim() : '';

  // A set's tracks, each cleaned like an upload title ("DS Premiere: AEMN -
  // Occult [BCCX029]" -> AEMN / Occult) and with its own SoundCloud link, so
  // a tracklist row plays that track (2026-10-02). Long sets only hydrate the
  // first few tracks in full; a partial list would mislead, so all or nothing.
  const setTracks = isPlaylist && page?.tracks?.length && page.tracks.every(t => t.title)
    ? page.tracks.map((t, i) => {
        const pt = parseReleaseTitle(t.title, uploader);
        return {
          position: String(i + 1),
          title: pt.title || t.title,
          artist: pt.artist,
          duration: t.duration ? secondsToClock(Math.round(t.duration / 1000)) : '',
          stream_url: t.permalink_url || '',
          artists: pt.artist ? [{ name: pt.artist }] : [],
        };
      })
    : [];
  // A set titled only "BCCX029 | AEMN" names no artist; its tracks do. The
  // artist most of them agree on wins over falling back to the uploader.
  let trackArtist = '';
  if (setTracks.length) {
    const counts = new Map();
    for (const t of setTracks) if (t.artist) counts.set(t.artist, (counts.get(t.artist) || 0) + 1);
    const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    if (top && n >= setTracks.length / 2) trackArtist = top;
  }
  const artist = (parsed.artist || pmArtist || trackArtist || '').trim();
  // What's left of the set title is just the artist's name: the catalogue
  // number is the better title ("BCCX029" by AEMN, not "AEMN" by AEMN).
  if (isPlaylist && trackArtist && !parsed.artist && squash(parsed.title) === squash(trackArtist)) {
    parsed.title = parsed.catNo || parsed.title;
  }
  // "MechaLAB Hellmarch" with artist MechaLAB -> "Hellmarch".
  if (artist && !parsed.artist && parsed.title.toLowerCase().startsWith(`${artist.toLowerCase()} `)) {
    parsed.title = parsed.title.slice(artist.length).trim();
  }
  const label = page?.label_name || pm.publisher || '';
  const durationSec = Math.round((page?.duration || page?.full_duration || 0) / 1000);

  // The set's own tracklist, minus the parse helper field; a track by the
  // set's artist doesn't need its own credit.
  const pageTracks = setTracks.map(({ artist: a, ...t }) => (a && namesAgree(a, artist) ? { ...t, artists: [] } : t));

  let postType = isPlaylist
    ? ((page?.track_count || pageTracks.length) >= 3 ? 'album' : 'single')
    // Title + length only: descriptions are label blurbs ("...played live by
    // Dixon") and tripped the live-set keyword scan on plain tracks.
    : detectPostType({ platform: 'soundcloud', duration: durationSec, title: rawTitle });

  let discogsData = null;
  if (postType !== 'livemix') {
    discogsData = await findDiscogsRelease(search = { kind: isPlaylist ? 'album' : 'track',
      artist,
      title: parsed.title,
      album: pmArtist ? (pm.album_title || pm.release_title) : '',
      labels: [label, pm.publisher, ...parsed.hints, uploader],
      catNo: parsed.catNo,
      uploader,
    });
    if (discogsData?.tracks?.length && !isPlaylist) {
      postType = detectPostType({ platform: 'soundcloud', duration: durationSec, title: rawTitle, tracks: discogsData.tracks, catNo: discogsData.catNo });
    }
  }

  const artists = splitArtists(artist || uploader);
  const scGenres = genresFromKeywords(`${page?.genre || ''} ${rawTitle}`);

  return {
    platform: 'soundcloud',
    _search: search,
    detected_type: postType,
    stream_url: pageUrl,
    embed_url: oembed?.html?.match(/src="([^"]+)"/)?.[1]
      || `https://w.soundcloud.com/player/?url=${encodeURIComponent(pageUrl)}&color=%23e85d04&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=true`,
    artists,
    artist: artists.map(a => a.name).join(', '),
    channel: null,
    // A single track keeps its own title (the id block in /resolve uses it to
    // find the pasted track on the release); a set is the release.
    title: isPlaylist ? (discogsData?.release_title || parsed.title) : parsed.title,
    ...discogsFields(discogsData, {
      // A set has no artwork of its own: its first track's, then (never
      // SoundCloud's grey placeholder) oEmbed's, then the uploader's avatar.
      cover: [page?.artwork_url, page?.tracks?.find(t => t.artwork_url)?.artwork_url]
        .find(Boolean)?.replace('-large.', '-t500x500.')
        || (/placeholder/i.test(oembed?.thumbnail_url || '') ? null : oembed?.thumbnail_url)
        || page?.user?.avatar_url?.replace('-large.', '-t500x500.'),
      year: page?.release_date?.slice(0, 4),
      tracks: pageTracks,
      label,
      catNo: parsed.catNo,
      genres: scGenres,
    }),
  };
}

// ─── Bandcamp ─────────────────────────────────────────────────────────────────
// Bandcamp retired its oEmbed endpoint (404 for every URL, checked
// 2026-09-25), which is why every Bandcamp paste failed. The album/track page
// itself carries everything: og:title "Title, by Artist", og:type
// album|song, og:site_name (the account — often the label), og:image, the
// item id (bc-page-properties), the tracklist (.track-title / .time),
// "released <date>" and the tag list.

async function resolveBandcamp(url) {
  let search = null; // for resolveWithFallback when Discogs misses
  url = url.split(/[?#]/)[0];
  // An honest app User-Agent gets the normal page. A browser UA string on a
  // non-browser client is what trips Bandcamp's bot check (3KB challenge
  // page instead of the album) — don't "fix" this by faking Chrome.
  const page = await fetch(url, { headers: UA });
  if (!page.ok) throw new Error(`Bandcamp page ${page.status}`);
  const html = await page.text();

  const meta = prop => metaTag(html, `og:${prop}`);
  const ogTitle = meta('title');                       // "Walk Ya Down, by Dj.Mc"
  const byMatch = ogTitle.match(/^(.*), by (.*)$/);
  const rawTitle = (byMatch?.[1] || ogTitle).trim();
  let artist = (byMatch?.[2] || '').trim();
  const account = meta('site_name');
  const isAlbum = meta('type') === 'album';

  // Label accounts title releases "CAT001 - Artist - Title" or
  // "Title [CAT001]"; the "by" credit is then often the label itself.
  const parsed = parseReleaseTitle(rawTitle);
  const title = parsed.title || rawTitle;
  if (parsed.artist && (!artist || namesAgree(artist, account) || /^various/i.test(artist))) artist = parsed.artist;
  const artists = splitArtists(artist);

  // _5 is a 700px rendition; _10 is the full-size original.
  const cover = meta('image').replace(/_\d+\.(jpg|png)$/, '_10.$1') || null;

  const props = decodeHtml(html.match(/name="bc-page-properties" content="([^"]*)"/)?.[1]);
  let itemId = null, itemType = isAlbum ? 'a' : 't';
  try { const p = JSON.parse(props); itemId = p.item_id; itemType = p.item_type || itemType; } catch { /* no props */ }
  const embedUrl = itemId
    ? `https://bandcamp.com/EmbeddedPlayer/${itemType === 'a' ? 'album' : 'track'}=${itemId}/size=large/bgcol=ffffff/linkcol=0687f5/minimal=true/transparent=true/`
    : null;

  // Each track's own page + player (2026-10-02): the page's data-tralbum
  // JSON lists every track with its id and /track/ link, so a tracklist row
  // can swap the player to that track. Tracks Bandcamp won't stream
  // (unreleased pre-order tracks: no file) get neither.
  let tralbum = null;
  try { tralbum = JSON.parse(decodeHtml(html.match(/data-tralbum="([^"]*)"/)?.[1] || '')); } catch { /* older page shape */ }
  const origin = new URL(url).origin;
  const bcPlayer = (kind, id) => `https://bandcamp.com/EmbeddedPlayer/${kind}=${id}/size=large/bgcol=ffffff/linkcol=0687f5/minimal=true/transparent=true/`;
  let bcTracks;
  if (tralbum?.trackinfo?.length) {
    bcTracks = tralbum.trackinfo.map((t, i) => {
      const playable = !!t.file && !!t.track_id;
      return {
        position: String(t.track_num || i + 1),
        title: t.title || '',
        duration: t.duration ? secondsToClock(Math.round(t.duration)) : '',
        stream_url: playable ? (t.title_link ? origin + t.title_link : url) : '',
        embed_url: playable ? bcPlayer('track', t.track_id) : '',
      };
    });
  } else {
    const titles = [...html.matchAll(/class="track-title">([^<]*)</g)].map(m => decodeHtml(m[1]).trim());
    const times = [...html.matchAll(/<span class="time secondaryText">\s*([^<]*?)\s*<\/span>/g)].map(m => m[1]);
    bcTracks = titles.map((t, i) => ({ title: t, duration: times[i] || '', position: String(i + 1) }));
  }
  const year = html.match(/released [A-Za-z]+ \d{1,2}, (\d{4})/)?.[1] || null;
  const tags = [...html.matchAll(/class="tag"[^>]*>\s*([^<]+?)\s*</g)].map(m => decodeHtml(m[1]));
  // A track page names its album: "from <a ...><span class="fromAlbum">Album</span>"
  const fromAlbum = decodeHtml(html.match(/class="fromAlbum">([^<]+)</)?.[1] || '').trim();

  const postType = isAlbum
    ? (bcTracks.length <= 2 ? 'single' : 'album')
    : detectPostType({ platform: 'bandcamp', title });

  let discogsData = null;
  if (postType !== 'livemix' && title) {
    discogsData = await findDiscogsRelease(search = { kind: isAlbum ? 'album' : 'track',
      artist,
      title,
      album: isAlbum ? '' : fromAlbum,
      labels: [account, ...parsed.hints],
      catNo: parsed.catNo,
      uploader: account,
    });
  }

  // A Discogs tracklist wins (positions, credits), but keeps Bandcamp's
  // per-track players: matched by title, word for word both ways.
  if (discogsData?.tracks?.length && bcTracks.some(t => t.embed_url)) {
    // Exact title first ("Different Nicky" must not take "Different Nicky
    // (Alternative Version)"'s player), then loose; each Bandcamp track once.
    const used = new Set();
    const pick = t => {
      const free = bcTracks.filter(b => b.embed_url && !used.has(b));
      const bc = free.find(b => squash(b.title) === squash(t.title))
        || free.find(b => namesAgree(t.title, b.title, 1) && namesAgree(b.title, t.title, 1));
      if (bc) used.add(bc);
      return bc;
    };
    const exactFirst = [...discogsData.tracks].sort((a, b) =>
      Number(!bcTracks.some(x => squash(x.title) === squash(a.title))) - Number(!bcTracks.some(x => squash(x.title) === squash(b.title))));
    const picked = new Map(exactFirst.map(t => [t, pick(t)]));
    discogsData = {
      ...discogsData,
      tracks: discogsData.tracks.map(t => {
        const bc = picked.get(t);
        return bc ? { ...t, stream_url: bc.stream_url, embed_url: bc.embed_url } : t;
      }),
    };
  }

  const tagGenres = genresFromKeywords(tags.join(' '));
  return {
    platform: 'bandcamp',
    _search: search,
    detected_type: typeFromTracks('bandcamp', title, discogsData, postType),
    stream_url: url,
    embed_url: embedUrl,
    artists,
    artist,
    channel: null,
    title,
    ...discogsFields(discogsData, {
      cover, year, tracks: bcTracks, catNo: parsed.catNo,
      // The account is the label when it isn't the artist.
      label: account && !namesAgree(account, artist) ? account : '',
      genres: tagGenres.length ? tagGenres : genresFromKeywords(title),
    }),
  };
}

// ─── Spotify ──────────────────────────────────────────────────────────────────
// The Web API needs OAuth; the public page doesn't. A track page has og:title
// (track), og:description "Artist · Album · Song · 2010", music:musician_
// description (each artist) and music:album (album URL). An album page's
// base64 "initialState" script holds the album entity: name, type
// (Album/EP/Single), date, artists, tracklist and the ℗/© lines — the label.

function spotifyAlbumFrom(html) {
  const b64 = html?.match(/<script id="initialState" type="text\/plain">([^<]+)<\/script>/)?.[1];
  if (!b64) return null;
  try {
    const state = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    const album = Object.values(state.entities?.items || {}).find(v => v?.__typename === 'Album');
    if (!album) return null;
    return {
      name: album.name || '',
      type: album.type || '',
      year: album.date?.year ? String(album.date.year) : '',
      artists: (album.artists?.items || []).map(a => a.profile?.name).filter(Boolean),
      labels: labelsFromCopyright((album.copyright?.items || []).map(c => c.text)),
      tracks: (album.tracksV2?.items || []).map((t, i) => ({
        position: String(i + 1),
        title: normaliseVersionTitle(t.track?.name || ''),
        duration: secondsToClock(Math.round((t.track?.duration?.totalMilliseconds || 0) / 1000)),
        artists: (t.track?.artists?.items || []).map(a => ({ name: a.profile?.name })).filter(a => a.name),
      })),
    };
  } catch {
    return null;
  }
}

async function resolveSpotify(url) {
  let search = null; // for resolveWithFallback when Discogs misses
  const match = url.match(/spotify\.com\/(?:intl-[\w-]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/);
  if (!match) throw new Error('Invalid Spotify URL');
  const [, type, id] = match;
  const pageUrl = `https://open.spotify.com/${type}/${id}`;
  const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;

  const html = await fetchHtml(pageUrl);
  const cover = metaTag(html, 'og:image') || null;
  let title = '', artist = '', albumName = '', year = metaTag(html, 'music:release_date').slice(0, 4);
  let album = null;

  if (type === 'album') {
    album = spotifyAlbumFrom(html);
    title = album?.name || metaTag(html, 'og:title').replace(/ - (?:Album|EP|Single|Compilation) by .*$/, '').replace(/ \| Spotify$/, '');
    artist = album?.artists.join(', ') || metaTag(html, 'og:description').split(' · ')[0] || '';
  } else if (type === 'track') {
    title = normaliseVersionTitle(metaTag(html, 'og:title'));
    const desc = metaTag(html, 'og:description').split(' · ');  // [artist, album, 'Song', year]
    artist = metaTags(html, 'music:musician_description').join(', ') || desc[0] || '';
    albumName = desc.length >= 4 ? desc[1] : '';
    // The album page has the label (℗ line) and the full tracklist.
    const albumUrl = metaTag(html, 'music:album');
    if (albumUrl) album = spotifyAlbumFrom(await fetchHtml(albumUrl));
    albumName = album?.name || albumName;
  } else {
    // Playlists aren't releases — title only, no Discogs.
    const oe = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(pageUrl)}`);
    title = oe?.title || metaTag(html, 'og:title').replace(/ \| Spotify$/, '');
  }

  const artists = splitArtists(artist);
  const fallbackType = type === 'album'
    ? ((album?.tracks.length || 0) <= 2 || album?.type === 'SINGLE' ? 'single' : 'album')
    : type === 'playlist' ? 'album' : detectPostType({ platform: 'spotify', title });

  let discogsData = null;
  if (type !== 'playlist' && fallbackType !== 'livemix' && title) {
    discogsData = await findDiscogsRelease(search = { kind: type === 'album' ? 'album' : 'track',
      artist,
      title,
      album: type === 'track' ? albumName : '',
      labels: album?.labels || [],
    });
  }

  return {
    platform: 'spotify',
    _search: search,
    detected_type: typeFromTracks('spotify', title, discogsData, fallbackType),
    stream_url: pageUrl,
    embed_url: embedUrl,
    artists,
    artist,
    channel: null,
    title,
    ...discogsFields(discogsData, {
      cover,
      year: year || album?.year,
      tracks: type === 'album' ? album?.tracks : [],
      label: album?.labels?.[0],
    }),
  };
}

// ─── Mixcloud ─────────────────────────────────────────────────────────────────

async function resolveMixcloud(url) {
  const oe = await fetch(`https://www.mixcloud.com/oembed/?url=${encodeURIComponent(url)}&format=json`);
  if (!oe.ok) throw new Error('Mixcloud oEmbed failed');
  const data = await oe.json();

  const title = data.title || '';
  const artist = data.author_name || '';
  const artists = splitArtists(artist);

  // Mixcloud is always a livemix
  const postType = 'livemix';

  // Try to get tracklist via Mixcloud API
  let tracks = [];
  try {
    const slug = url.replace('https://www.mixcloud.com', '').replace(/\/$/, '');
    const apiR = await fetch(`https://api.mixcloud.com${slug}/`);
    if (apiR.ok) {
      const d = await apiR.json();
      if (d.sections) {
        tracks = d.sections
          .filter(s => s.chapter)
          .map(s => ({
            title: `${s.chapter.artist?.name || ''} - ${s.chapter.song?.name || ''}`.trim().replace(/^-\s*/, ''),
            position: s.position || '',
            duration: s.chapter.run_time || '',
          }));
      }
    }
  } catch { /* ignore */ }

  return {
    platform: 'mixcloud',
    detected_type: postType,
    stream_url: url,
    embed_url: data.html?.match(/src="([^"]+)"/)?.[1] || null,
    cover_image: data.image || null,
    year: null,
    tracks,
    artists,
    artist,
    channel: null,
    title,
    label: '',
    catNo: '',
    genres: ['Electronic'],
    discogs_id: null,
    source: 'platform',
  };
}

// ─── Deezer ───────────────────────────────────────────────────────────────────
// Public API, no key. A track gives its album id; the album gives label, UPC
// barcode, record_type (album/ep/single), genres and the tracklist.

async function resolveDeezer(url) {
  let search = null; // for resolveWithFallback when Discogs misses
  const match = url.match(/deezer\.com\/(?:[\w-]+\/)?(track|album|playlist)\/(\d+)/);
  if (!match) throw new Error('Invalid Deezer URL');
  const [, type, id] = match;

  const data = await fetchJson(`https://api.deezer.com/${type}/${id}`);
  if (!data || data.error) throw new Error('Deezer API failed');
  const album = type === 'album' ? data
    : type === 'track' && data.album?.id ? await fetchJson(`https://api.deezer.com/album/${data.album.id}`)
    : null;

  const title = type === 'track' ? normaliseVersionTitle(data.title || '') : (data.title || '');
  // Every main artist, not just the first ("A & B" tracks list both).
  const mains = (data.contributors || []).filter(c => /main/i.test(c.role || '')).map(c => c.name);
  const artist = mains.length ? mains.join(', ') : (data.artist?.name || '');
  const artists = splitArtists(artist);
  const albumTracks = (album?.tracks?.data || []).map((t, i) => ({
    position: String(i + 1), title: normaliseVersionTitle(t.title || ''), duration: secondsToClock(t.duration), artists: [],
  }));

  const fallbackType = type === 'album'
    ? (album?.record_type === 'single' || albumTracks.length <= 2 ? 'single' : 'album')
    : type === 'playlist' ? 'album' : detectPostType({ platform: 'deezer', title, duration: data.duration || 0 });

  let discogsData = null;
  if (type !== 'playlist' && fallbackType !== 'livemix' && title) {
    discogsData = await findDiscogsRelease(search = { kind: type === 'album' ? 'album' : 'track',
      artist,
      title,
      album: type === 'track' ? album?.title : '',
      labels: [album?.label],
      barcode: album?.upc,
    });
  }

  return {
    platform: 'deezer',
    _search: search,
    detected_type: typeFromTracks('deezer', title, discogsData, fallbackType),
    stream_url: url,
    embed_url: `https://widget.deezer.com/widget/dark/${type}/${id}`,
    artists,
    artist,
    channel: null,
    title,
    ...discogsFields(discogsData, {
      cover: data.cover_xl || album?.cover_xl || data.album?.cover_xl,
      year: (album?.release_date || data.release_date || '').slice(0, 4),
      tracks: type === 'album' ? albumTracks : [],
      label: album?.label,
      genres: (album?.genres?.data || []).map(g => g.name),
    }),
  };
}

// ─── Apple Music ──────────────────────────────────────────────────────────────
// iTunes lookup, no key: the album ("collection") gives name, artist,
// release date, genre and the ℗ line (the label); entity=song adds the
// tracks, so a ?i= link finds its own track's title. Lookups are per
// storefront — /gb/album/... is looked up in the GB store.

async function resolveAppleMusic(url) {
  let search = null; // for resolveWithFallback when Discogs misses
  const albumId = url.match(/apple\.com\/(?:\w+\/)?album\/(?:[^/]+\/)?(\d+)/)?.[1];
  const songId = url.match(/[?&]i=(\d+)/)?.[1] || url.match(/apple\.com\/(?:\w+\/)?song\/(?:[^/]+\/)?(\d+)/)?.[1];
  if (!albumId && !songId) throw new Error('Invalid Apple Music URL');
  const country = url.match(/apple\.com\/([a-z]{2})\//)?.[1] || 'us';

  let collectionId = albumId;
  if (!collectionId) {
    const s = await fetchJson(`https://itunes.apple.com/lookup?id=${songId}&country=${country}`);
    collectionId = s?.results?.[0]?.collectionId;
  }
  const d = collectionId ? await fetchJson(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song&country=${country}`) : null;
  const results = d?.results || [];
  const coll = results.find(r => r.wrapperType === 'collection') || {};
  const songs = results.filter(r => r.wrapperType === 'track');
  const song = songId ? songs.find(r => String(r.trackId) === songId) : null;

  const album = stripReleaseSuffix(coll.collectionName);
  const title = song ? normaliseVersionTitle(song.trackName) : album;
  const artist = song?.artistName || coll.artistName || '';
  const artists = splitArtists(artist);
  const appleTracks = songs.map(t => ({
    position: String(t.trackNumber || ''), title: normaliseVersionTitle(t.trackName), duration: secondsToClock(Math.round((t.trackTimeMillis || 0) / 1000)), artists: [],
  }));
  const fallbackType = song ? 'single' : (/ - Single$/i.test(coll.collectionName || '') || appleTracks.length <= 2 ? 'single' : 'album');

  const discogsData = title ? await findDiscogsRelease(search = { kind: song ? 'track' : 'album',
    artist,
    title,
    album: song ? album : '',
    labels: labelsFromCopyright(coll.copyright),
  }) : null;

  return {
    platform: 'applemusic',
    _search: search,
    detected_type: typeFromTracks('applemusic', title, discogsData, fallbackType),
    stream_url: url,
    embed_url: `https://embed.music.apple.com/${url.split('apple.com/')[1]}`,
    artists,
    artist,
    channel: null,
    title,
    ...discogsFields(discogsData, {
      cover: coll.artworkUrl100?.replace('100x100', '600x600'),
      year: coll.releaseDate?.slice(0, 4),
      tracks: song ? [] : appleTracks,
      label: labelsFromCopyright(coll.copyright)[0],
      genres: genresFromKeywords(coll.primaryGenreName || ''),
    }),
  };
}

// ─── Tidal ────────────────────────────────────────────────────────────────────
// Tidal's /v1/oembed now wants an auth token (every Tidal paste failed); the
// public page's JSON-LD has the name, artists, album (for a track),
// release date and cover. Embeds: embed.tidal.com/{tracks|albums}/<id>.

async function resolveTidal(url) {
  let search = null; // for resolveWithFallback when Discogs misses
  const match = url.match(/tidal\.com\/(?:browse\/)?(track|album)\/(\d+)/);
  if (!match) throw new Error('Invalid Tidal URL');
  const [, type, id] = match;
  const pageUrl = `https://tidal.com/${type}/${id}`;

  const html = await fetchHtml(pageUrl);
  const ld = jsonLd(html).find(x => /^Music(?:Recording|Album)$/.test(x['@type'])) || {};
  const ogTitle = metaTag(html, 'og:title');           // "Artist - Title"
  if (!ld.name && (!ogTitle || /^Not Found/i.test(ogTitle))) throw new Error('Tidal page not found');

  const artist = (ld.byArtist || []).map(a => a.name).filter(Boolean).join(', ') || ogTitle.split(' - ')[0] || '';
  const title = normaliseVersionTitle(ld.name || ogTitle.split(' - ').slice(1).join(' - '));
  const albumName = type === 'track' ? (ld.inAlbum?.name || '') : '';
  const artists = splitArtists(artist);
  const fallbackType = type === 'album' ? 'album' : detectPostType({ platform: 'tidal', title });

  const discogsData = fallbackType !== 'livemix' && title
    ? await findDiscogsRelease(search = { kind: type === 'album' ? 'album' : 'track', artist, title, album: albumName })
    : null;

  return {
    platform: 'tidal',
    _search: search,
    detected_type: typeFromTracks('tidal', title, discogsData, fallbackType),
    stream_url: pageUrl,
    embed_url: `https://embed.tidal.com/${type}s/${id}`,
    artists,
    artist,
    channel: null,
    title,
    ...discogsFields(discogsData, {
      cover: ld.image || metaTag(html, 'og:image'),
      year: (ld.datePublished || metaTag(html, 'music:release_date')).slice(0, 4),
    }),
  };
}

// ─── Beatport ─────────────────────────────────────────────────────────────────
// No public API and no oEmbed any more, but every page ships __NEXT_DATA__:
// a track has name, mix_name, artists, remixers, release { name,
// catalog_number }, label, genre; a release has name, artists, label,
// catalog_number, upc and (second query) its tracks.

function beatportData(html) {
  const raw = html?.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)?.[1];
  if (!raw) return [];
  try {
    return (JSON.parse(raw).props?.pageProps?.dehydratedState?.queries || []).map(q => ({ key: q.queryKey, data: q.state?.data }));
  } catch {
    return [];
  }
}

// "Mesmerizing" + "Original Mix" -> "Mesmerizing"; + "Dixon Remix" -> "Mesmerizing (Dixon Remix)"
const beatportTitle = (name, mix) => (mix && !/^(?:original|extended|club|main)(?: mix| version)?$/i.test(mix.trim()) ? `${name} (${mix.trim()})` : (name || ''));

async function resolveBeatport(url) {
  let search = null; // for resolveWithFallback when Discogs misses
  const match = url.match(/beatport\.com\/(track|release)\/[^/]*\/(\d+)/);
  if (!match) throw new Error('Invalid Beatport URL');
  const [, type, id] = match;

  const queries = beatportData(await fetchHtml(url.split(/[?#]/)[0]));
  const names = list => (list || []).map(a => a.name).filter(Boolean);
  let title, artist, albumName = '', label = '', catNo = '', barcode = '', year = '', cover = null, genre = '', tracks = [];

  if (type === 'track') {
    const t = queries.find(q => q.data?.track_id || q.data?.track_name)?.data || {};
    title = beatportTitle(t.track_name || t.name, t.mix_name);
    artist = names(t.artists).join(', ');
    albumName = t.release?.name || '';
    label = t.label?.name || t.release?.label?.name || '';
    catNo = t.release?.catalog_number || t.catalog_number || '';
    year = (t.release?.release_date || t.publish_date || '').slice(0, 4);
    cover = t.release?.image_url?.replace('{w}x{h}', '1400x1400') || null;
    genre = t.genre?.name || '';
  } else {
    const r = queries.find(q => JSON.stringify(q.key).startsWith('["release-'))?.data || {};
    title = r.name || '';
    artist = names(r.artists).join(', ');
    label = r.label?.name || '';
    catNo = r.catalog_number || '';
    barcode = r.upc || '';
    year = (r.new_release_date || r.publish_date || '').slice(0, 4);
    cover = r.image?.uri || null;
    const list = queries.find(q => Array.isArray(q.key) && q.key[0] === 'tracks')?.data?.results || [];
    tracks = list.map((t, i) => ({
      position: String(i + 1), title: beatportTitle(t.name, t.mix_name), duration: t.length || '', artists: names(t.artists).map(name => ({ name })),
    }));
    genre = list[0]?.genre?.name || '';
  }
  if (!title) throw new Error('Beatport page had no release data');

  const artists = splitArtists(artist);
  const fallbackType = type === 'release' ? (tracks.length <= 2 ? 'single' : 'album') : 'single';
  const discogsData = await findDiscogsRelease(search = { kind: type === 'release' ? 'album' : 'track',
    artist, title, album: albumName, labels: [label], catNo, barcode,
  });

  return {
    platform: 'beatport',
    _search: search,
    detected_type: typeFromTracks('beatport', title, discogsData, fallbackType),
    stream_url: url,
    embed_url: null,
    artists,
    artist,
    channel: null,
    title,
    ...discogsFields(discogsData, { cover, year, tracks, label, catNo, genres: genresFromKeywords(genre) }),
  };
}

async function resolveRA(url) {
  // RA: parse artist/event from URL slug
  // e.g. https://ra.co/dj/objekt  or  https://ra.co/events/12345
  const artistMatch = url.match(/ra\.co\/dj\/([^/?]+)/);
  const eventMatch = url.match(/ra\.co\/events\/(\d+)/);

  let title = '', artist = '';
  if (artistMatch) {
    artist = artistMatch[1].replace(/-/g, ' ');
    title = `${artist} (Resident Advisor)`;
  } else if (eventMatch) {
    title = `RA Event #${eventMatch[1]}`;
  }

  const artists = artist ? splitArtists(artist) : [];

  return {
    platform: 'ra',
    detected_type: 'livemix',
    stream_url: url,
    embed_url: null,
    cover_image: null,
    year: null,
    tracks: [],
    artists,
    artist,
    channel: 'Resident Advisor',
    title,
    label: '',
    catNo: '',
    genres: ['Electronic'],
    discogs_id: null,
    source: 'platform',
  };
}

async function resolveBoilerRoom(url) {
  // Boiler Room: parse from URL
  const slugMatch = url.match(/boilerroom\.tv\/recording\/([^/?]+)/);
  let title = '', artist = '';
  if (slugMatch) {
    title = slugMatch[1].replace(/-/g, ' ');
    // Title format often: "artist-name-city-year"
    const parts = title.split(' ');
    artist = parts.slice(0, 2).join(' ');
    title = title;
  }

  let cover = null;
  try {
    const oe = await fetch(`https://boilerroom.tv/api/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (oe.ok) {
      const d = await oe.json();
      title = d.title || title;
      artist = d.author_name || artist;
      cover = d.thumbnail_url || null;
    }
  } catch { /* ignore */ }

  const artists = splitArtists(artist);

  return {
    platform: 'boilerroom',
    detected_type: 'livemix',
    stream_url: url,
    embed_url: null,
    cover_image: cover,
    year: null,
    tracks: [],
    artists,
    artist,
    channel: 'Boiler Room',
    title,
    label: '',
    catNo: '',
    genres: ['Electronic'],
    discogs_id: null,
    source: 'platform',
  };
}

async function resolveDiscogs(url) {
  // Release, master, shop-listing and marketplace links all land on a real
  // release (masters -> their main release, which unlike the master itself
  // carries label + catno). See resolveDiscogsUrl.
  const { releaseId: id } = await resolveDiscogsUrl(url);
  const data = await getRelease(Number(id));
  if (!data || data.error) throw new Error(data?.error || `Discogs fetch failed for ${id}`);

  const artist = data.artists?.map(a => a.name).join(', ') || '';
  const artists = (data.artists || []).filter(a => a?.name);
  const rawReleaseTitle = data.title || '';
  const title = rawReleaseTitle.includes(' - ') ? rawReleaseTitle.split(' - ').slice(1).join(' - ') : rawReleaseTitle;

  return {
    platform: 'discogs',
    detected_type: detectPostType({
      platform: 'discogs',
      title,
      tracks: data.tracklist || [],
      catNo: data.labels?.[0]?.catno,
    }),
    stream_url: url,
    embed_url: null,
    cover_image: data.coverImage || null,
    year: data.year ? String(data.year) : null,
    tracks: (data.tracklist || []).map(t => ({ title: t.title, duration: t.duration, position: t.position, artists: t.artists || [] })),
    artists,
    artist,
    channel: null,
    title,
    label: data.labels?.[0]?.name || '',
    catNo: data.labels?.[0]?.catno || '',
    genres: [...(data.genres || []), ...(data.styles || [])],
    discogs_id: data.discogsId || null,
    source: 'discogs',
  };
}

// ─── URL platform detection ───────────────────────────────────────────────────

function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/soundcloud\.com/.test(url)) return 'soundcloud';
  if (/bandcamp\.com/.test(url)) return 'bandcamp';
  if (/open\.spotify\.com/.test(url)) return 'spotify';
  if (/mixcloud\.com/.test(url)) return 'mixcloud';
  if (/deezer\.com/.test(url)) return 'deezer';
  if (/music\.apple\.com/.test(url)) return 'applemusic';
  if (/tidal\.com/.test(url)) return 'tidal';
  if (/beatport\.com/.test(url)) return 'beatport';
  if (/ra\.co/.test(url)) return 'ra';
  if (/boilerroom\.tv/.test(url)) return 'boilerroom';
  if (/discogs\.com/.test(url)) return 'discogs';
  return null;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get('/resolve', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url query param required' });

  const platform = detectPlatform(url);
  if (!platform) return res.status(400).json({ error: 'Unsupported platform', url });

  try {
    let result;
    switch (platform) {
      case 'youtube':     result = await resolveYouTube(url);     break;
      case 'soundcloud':  result = await resolveSoundCloud(url);  break;
      case 'bandcamp':    result = await resolveBandcamp(url);    break;
      case 'spotify':     result = await resolveSpotify(url);     break;
      case 'mixcloud':    result = await resolveMixcloud(url);    break;
      case 'deezer':      result = await resolveDeezer(url);      break;
      case 'applemusic':  result = await resolveAppleMusic(url);  break;
      case 'tidal':       result = await resolveTidal(url);       break;
      case 'beatport':    result = await resolveBeatport(url);    break;
      case 'ra':          result = await resolveRA(url);          break;
      case 'boilerroom':  result = await resolveBoilerRoom(url);  break;
      case 'discogs':     result = await resolveDiscogs(url);     break;
      default:            return res.status(400).json({ error: 'Unknown platform' });
    }

    // No Discogs release: cross-check other catalogues, try Discogs again
    // with what they found, else fill the blanks and attach artist/label ids.
    await resolveWithFallback(result);
    delete result._search;

    // ── Attach real Discogs artist/label ids ────────────────────────────────
    // One place for all twelve platforms. Whenever a resolver landed on a
    // Discogs release (directly, or via tryDiscogsLookup's reverse match),
    // that release is the source of truth for WHO made it — so take its
    // artists (which carry `id`) and its label id, rather than the loose
    // names parsed out of a video title or an oEmbed `author_name`.
    //
    // Those ids are what end up in post_artists.discogs_artist_id /
    // post_labels.discogs_label_id (backend/routes/posts.js reads `a.id` and
    // `l.id`), which is what the spotlight discography feature resolves
    // against. Before this, every row in both tables was NULL.
    //
    // getRelease() is served from the 30-day SQLite cache in discogsService,
    // and tryDiscogsLookup has almost always just fetched this exact release
    // moments earlier, so in practice this is a local DB read, not an API
    // call. Livemix posts never get a discogs_id, so DJ names parsed off the
    // set title are left exactly as they were.
    if (result?.discogs_id) {
      const rel = await getRelease(Number(result.discogs_id)).catch(() => null);

      // Which track on the release is the thing that was pasted? Matched by
      // cleaned title, so "Mammone (feat. X)" finds "Mammone".
      const normT = s => cleanForSearch(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const want = normT(result.title);
      const matchedTrack = want && platform !== 'discogs'
        // Exact first; then word-for-word both ways, so "Total M Classic
        // Re-Wash" finds "Total M's Classic Re-Wash" but "Equinox" never
        // claims "Equinox (Remix)".
        ? (rel?.tracklist || []).find(t => normT(t.title) === want)
          || (rel?.tracklist || []).find(t => namesAgree(result.title, t.title, 1) && namesAgree(t.title, result.title, 1))
          || null
        : null;

      // Discogs' release-level credit wins, "Various" included — gabriel's
      // call (2026-09-25): a compilation is posted as the compilation.
      if (rel?.artists?.length) {
        result.artists = rel.artists.filter(a => a?.name);
        // Keep the visible artist string in step with the ids being saved —
        // a divergence between the two is exactly the bug this fixes.
        result.artist = result.artists.map(a => a.name).join(', ');
      }
      const relLabel = rel?.labels?.find(l => l.name === result.label) || rel?.labels?.[0] || null;
      if (relLabel) {
        result.label_id = relLabel.id || null;
        result.label = result.label || relLabel.name || '';
        result.catNo = result.catNo || relLabel.catno || '';
      }

      // The pasted link IS the stream for its own track — don't leave that
      // row blank in the tracklist.
      if (matchedTrack && Array.isArray(result.tracks)) {
        result.tracks = result.tracks.map(t =>
          !t.stream_url && t.position === matchedTrack.position && t.title === matchedTrack.title
            ? { ...t, stream_url: result.stream_url }
            : t);
      }
    }

    res.json(result);
  } catch (err) {
    console.error(`[media/resolve] ${platform} error:`, err.message);
    res.status(500).json({ error: err.message, platform });
  }
});

// GET /api/media/channel-uploads?videoUrl=<any video from the channel>&offset=0&limit=100&q=
//
// The channel spotlight's catalogue source. Artists and labels resolve their
// back catalogue through Discogs (/api/discogs/artist|label/:id/releases);
// a channel isn't a Discogs entity, so its catalogue is the YouTube channel's
// own uploads. Same response shape as the two Discogs endpoints
// ({ releases: [{ id, title, year, thumb }], pagination: { items } }) so
// SpotlightCard renders all three subject types through one code path.
//
// Takes a VIDEO url rather than a channel name because posts only ever store
// `channel` as free text ("HOR", "Boiler Room") — resolving that by name would
// cost 100 quota units and still be a guess. Any post from the channel gives
// an exact answer for 3.
router.get('/channel-uploads', async (req, res) => {
  // offset/limit page through the crawled uploads; q filters by title.
  const { videoUrl, offset, limit, q } = req.query;
  if (!videoUrl) return res.status(400).json({ error: 'videoUrl query param required' });
  const videoId = extractVideoId(videoUrl);
  if (!videoId) return res.status(400).json({ error: 'Not a YouTube URL', videoUrl });
  try {
    res.json(await getChannelUploads(videoId, { offset, limit, q }));
  } catch (err) {
    console.error('[media/channel-uploads]', err.message);
    res.status(502).json({ error: err.message });
  }
});

export default router;