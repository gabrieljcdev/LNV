import express from 'express';
import fetch from 'node-fetch';
import { searchDiscogs, getRelease, getMaster } from '../services/discogsService.js';
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
 * Attempt a Discogs reverse-lookup for a non-live result.
 * Returns partial release data (plus up to 4 alternates) or null.
 *
 * Artist and label DISCOGS IDS are carried through here, not just names:
 * post_artists.discogs_artist_id / post_labels.discogs_label_id are what the
 * spotlight discography feature resolves against, and before 2026-08-26
 * nothing on the reverse-lookup path ever produced them.
 */
async function tryDiscogsLookup(artist, title) {
  if (!artist || !title) return null;
  try {
    // Search results (up to 20), not just the first
    const searchData = await searchDiscogs(`${artist} ${title}`.trim(), 'release');
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

    const releases = [];
    for (let i = 0; i < uniqueResults.length; i++) {
      const release = fetched[i];
      if (!release) continue;
      const result = uniqueResults[i];
      const relLabel = release.labels?.[0] || null;
      releases.push({
        discogs_id: release.discogsId,
        release_title: release.title,
        // [{ id, name }] — ids are the whole point, see the note above
        artists: (release.artists || []).filter(a => a?.name),
        artist: (release.artists || []).map(a => a.name).filter(Boolean).join(', '),
        label: relLabel?.name || '',
        label_id: relLabel?.id || null,
        catNo: relLabel?.catno || '',
        year: release.year ? String(release.year) : null,
        genres: [...(release.genres || []), ...(release.styles || [])],
        cover_image: release.coverImage || null,
        thumb_image: release.thumbImage || null,
        tracks: (release.tracklist || []).map(t => ({ title: t.title, duration: t.duration, position: t.position })),
        videos: release.videos || [],
        format: result.format || [],
        country: result.country || '',
      });
    }

    if (!releases.length) return null;

    // Primary result = first one (best match from Discogs ranking)
    const primary = releases[0];
    return {
      ...primary,
      all_releases: releases.length > 1 ? releases : null, // only include if multiple
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
  let rawTitle = '', channelTitle = '';
  try {
    const oe = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (oe.ok) {
      const d = await oe.json();
      rawTitle = d.title || '';
      channelTitle = d.author_name || '';
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
      cover_image: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
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

  const parsed = parseYouTubeTitle(rawTitle, channelTitle);
  let artist, artists, channel, title;

  if (parsed) {
    artists = parsed.artists;
    artist = artists.map(a => a.name).join(' B2B ');
    channel = parsed.channel;
    title = rawTitle;
  } else {
    const dashMatch = rawTitle.match(/^(.+?)\s+-\s+(.+)$/);
    if (dashMatch) {
      artist = dashMatch[1].trim();
      title = dashMatch[2].trim();
    } else {
      artist = channelTitle;
      title = rawTitle;
    }
    artists = splitArtists(artist);
    channel = null;
  }

  let postType = detectPostType({ platform: 'youtube', duration, title: rawTitle, tags, description });

  // ── Step 4: Discogs reverse lookup for non-live ───────────────────────────
  let discogsData = null;
  if (postType !== 'livemix' && artist && title) {
    discogsData = await tryDiscogsLookup(artist, title);
    // Re-evaluate type now we know the real track count from Discogs
    if (discogsData?.tracks?.length) {
      postType = detectPostType({ platform: 'youtube', duration, title: rawTitle, tags, description, tracks: discogsData.tracks, catNo: discogsData.catNo });
    }
  }
  if (postType === 'livemix' && genres.length <= 1 && artists.length > 0) {
    const dResult = await discogsSearch(artists[0].name);
    if (dResult?.genre?.length) genres = [...new Set([...genres, ...dResult.genre])];
  }

  return {
    platform: 'youtube',
    detected_type: postType,
    stream_url: `https://www.youtube.com/watch?v=${videoId}`,
    embed_url: `https://www.youtube.com/embed/${videoId}`,
    cover_image: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    year: discogsData?.year || publishedYear,
    tracks: discogsData?.tracks || [],
    artists,
    artist,
    channel: channel || null,
    title,
    label: discogsData?.label || '',
    catNo: discogsData?.catNo || '',
    genres: discogsData?.genres || genres,
    discogs_id: discogsData?.discogs_id || null,
    videos: discogsData?.videos || [],
    all_releases: discogsData?.all_releases || null,
    source: discogsData ? 'discogs' : 'platform',
  };
}
async function resolveSoundCloud(url) {
  // SC oEmbed — try multiple endpoints as SC has changed these over time
  let title = '', artist = '', cover = null, embedUrl = null, duration = 0;

  // Method 1: soundcloud.com/oembed (current)
  const oembedEndpoints = [
    `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    `https://soundcloud.com/oembed.json?url=${encodeURIComponent(url)}`,
    `https://w.soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  ];

  for (const endpoint of oembedEndpoints) {
    try {
      const oe = await fetch(endpoint);
      if (!oe.ok) continue;
      const data = await oe.json();
      if (data.title) {
        title  = data.title || '';
        artist = data.author_name || '';
        cover  = data.thumbnail_url || null;
        // Extract embed URL from HTML snippet
        const srcMatch = data.html?.match(/src="([^"]+)"/);
        embedUrl = srcMatch ? srcMatch[1] : null;
        break;
      }
    } catch { continue; }
  }

  // Method 2: If oEmbed failed, parse from URL slug
  if (!title) {
    const parts = url.replace('https://soundcloud.com/', '').split('/');
    artist = parts[0]?.replace(/-/g, ' ') || '';
    title  = parts[1]?.replace(/-/g, ' ') || parts[0]?.replace(/-/g, ' ') || '';
  }

  const artists = splitArtists(artist);
  const postType = detectPostType({ platform: 'soundcloud', duration, title });

  // Always try Discogs lookup — SC pages often list EPs/albums
  // Use artist + title for the search, also try just artist name
  let discogsData = null;
  
  // Clean the title for Discogs search — remove "- free download", remix suffixes etc
  const cleanTitle = title
    .replace(/[-–]s*(frees+download|free|preview|clip|snippet)$/i, '')
    .replace(/(.*?(remix|edit|mix|version|remaster|bootleg).*?)/i, '')
    .trim();

  // For sets/playlists, extract EP/album name from URL
  const isPlaylist = url.includes('/sets/');
  const slugTitle = isPlaylist
    ? url.split('/sets/')[1]?.split('?')[0]?.replace(/-/g, ' ')
    : cleanTitle;

  if (artist || slugTitle) {
    discogsData = await tryDiscogsLookup(artist, slugTitle || cleanTitle);
    // If no match, try just the title alone
    if (!discogsData && slugTitle) {
      discogsData = await tryDiscogsLookup('', slugTitle);
    }
  }

  // Build tracklist: prefer Discogs (has positions/durations), fall back to SC
  const tracks = discogsData?.tracks?.length ? discogsData.tracks : [];

  // Build embed URL for SC widget if we have it
  const finalEmbedUrl = embedUrl || (url ? 
    `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23e85d04&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=true`
    : null);

  return {
    platform: 'soundcloud',
    detected_type: postType,
    stream_url: url,
    embed_url: finalEmbedUrl,
    cover_image: discogsData?.cover_image || cover,
    year: discogsData?.year || null,
    tracks,
    artists: artists,
    artist: discogsData ? (discogsData.artist || artist) : artist,
    channel: null,
    title: discogsData?.title || title,
    label: discogsData?.label || '',
    catNo: discogsData?.catNo || '',
    genres: discogsData?.genres?.length ? discogsData.genres : genresFromKeywords(title),
    discogs_id: discogsData?.discogs_id || null,
    all_releases: discogsData?.all_releases || null,
    source: discogsData ? 'discogs' : 'platform',
  };
}

async function resolveBandcamp(url) {
  const oembed = await fetch(`https://bandcamp.com/oembed?url=${encodeURIComponent(url)}&format=json`);
  if (!oembed.ok) throw new Error(`Bandcamp oEmbed ${oembed.status}`);
  const data = await oembed.json();

  const title = data.title || '';
  const artist = data.author_name || '';
  const artists = splitArtists(artist);
  const postType = detectPostType({ platform: 'bandcamp', title });

  let discogsData = null;
  if (postType !== 'livemix') {
    discogsData = await tryDiscogsLookup(artist, title);
  }

  return {
    platform: 'bandcamp',
    detected_type: postType,
    stream_url: url,
    embed_url: null,
    cover_image: data.thumbnail_url || null,
    year: null,
    tracks: discogsData?.tracks || [],
    artists,
    artist,
    channel: null,
    title,
    label: discogsData?.label || '',
    catNo: discogsData?.catNo || '',
    genres: discogsData?.genres || genresFromKeywords(title),
    discogs_id: discogsData?.discogs_id || null,
    source: discogsData ? 'discogs' : 'platform',
  };
}

async function resolveSpotify(url) {
  // Spotify requires OAuth — return partial data with embed URL
  const matchTrack = url.match(/spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/);
  if (!matchTrack) throw new Error('Invalid Spotify URL');
  const [, type, id] = matchTrack;
  const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;

  // Try to get metadata via oEmbed
  let title = '', artist = '';
  try {
    const oe = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    if (oe.ok) {
      const d = await oe.json();
      title = d.title || '';
      artist = d.author_name || '';
    }
  } catch { /* ignore */ }

  const artists = splitArtists(artist);
  const postType = type === 'album' ? 'album' : detectPostType({ platform: 'spotify', title });
  let discogsData = null;
  if (postType !== 'livemix' && artist && title) {
    discogsData = await tryDiscogsLookup(artist, title);
  }

  return {
    platform: 'spotify',
    detected_type: postType,
    stream_url: url,
    embed_url: embedUrl,
    cover_image: null,
    year: discogsData?.year || null,
    tracks: discogsData?.tracks || [],
    artists,
    artist,
    channel: null,
    title,
    label: discogsData?.label || '',
    catNo: discogsData?.catNo || '',
    genres: discogsData?.genres || [],
    discogs_id: discogsData?.discogs_id || null,
    source: discogsData ? 'discogs' : 'platform',
  };
}

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

async function resolveDeezer(url) {
  const match = url.match(/deezer\.com\/(?:\w+\/)?(track|album|playlist)\/(\d+)/);
  if (!match) throw new Error('Invalid Deezer URL');
  const [, type, id] = match;

  const apiR = await fetch(`https://api.deezer.com/${type}/${id}`);
  if (!apiR.ok) throw new Error('Deezer API failed');
  const data = await apiR.json();

  const title = data.title || '';
  const artist = data.artist?.name || '';
  const artists = splitArtists(artist);
  const postType = type === 'album' ? 'album' : detectPostType({ platform: 'deezer', title });

  let discogsData = null;
  if (postType !== 'livemix' && artist && title) {
    discogsData = await tryDiscogsLookup(artist, title);
  }

  return {
    platform: 'deezer',
    detected_type: postType,
    stream_url: url,
    embed_url: `https://widget.deezer.com/widget/dark/${type}/${id}`,
    cover_image: data.cover_xl || data.album?.cover_xl || null,
    year: data.release_date ? data.release_date.substring(0, 4) : (discogsData?.year || null),
    tracks: discogsData?.tracks || (data.tracks?.data || []).map(t => ({ title: t.title, duration: t.duration })),
    artists,
    artist,
    channel: null,
    title,
    label: discogsData?.label || '',
    catNo: discogsData?.catNo || '',
    genres: discogsData?.genres || (data.genres?.data || []).map(g => g.name),
    discogs_id: discogsData?.discogs_id || null,
    source: discogsData ? 'discogs' : 'platform',
  };
}

async function resolveAppleMusic(url) {
  // Parse Apple Music URL: /album/name/id or /album/id
  const albumMatch = url.match(/apple\.com\/(?:\w+\/)?album\/(?:[^/]+\/)?(\d+)/);
  const trackMatch = url.match(/\?i=(\d+)/);
  const id = albumMatch?.[1];
  if (!id) throw new Error('Invalid Apple Music URL');

  // iTunes Search API as proxy
  let title = '', artist = '', cover = '', year = '';
  try {
    const lookupUrl = trackMatch
      ? `https://itunes.apple.com/lookup?id=${trackMatch[1]}`
      : `https://itunes.apple.com/lookup?id=${id}&entity=album`;
    const r = await fetch(lookupUrl);
    const d = await r.json();
    const item = d.results?.[0];
    if (item) {
      title = item.collectionName || item.trackName || '';
      artist = item.artistName || '';
      cover = item.artworkUrl100?.replace('100x100', '600x600') || null;
      year = item.releaseDate?.substring(0, 4) || '';
    }
  } catch { /* ignore */ }

  const artists = splitArtists(artist);
  const type = url.includes('?i=') ? 'single' : 'album';
  let discogsData = null;
  if (artist && title) {
    discogsData = await tryDiscogsLookup(artist, title);
  }

  return {
    platform: 'applemusic',
    detected_type: discogsData ? detectPostType({ platform: 'applemusic', title, tracks: discogsData.tracks, catNo: discogsData.catNo }) : type,
    stream_url: url,
    embed_url: `https://embed.music.apple.com/${url.split('apple.com/')[1]}`,
    cover_image: discogsData?.cover_image || cover,
    year: discogsData?.year || year,
    tracks: discogsData?.tracks || [],
    artists,
    artist,
    channel: null,
    title,
    label: discogsData?.label || '',
    catNo: discogsData?.catNo || '',
    genres: discogsData?.genres || [],
    discogs_id: discogsData?.discogs_id || null,
    source: discogsData ? 'discogs' : 'platform',
  };
}

async function resolveTidal(url) {
  const oe = await fetch(`https://oembed.tidal.com/v1/oembed?url=${encodeURIComponent(url)}&format=json`);
  if (!oe.ok) throw new Error('Tidal oEmbed failed');
  const data = await oe.json();

  const title = data.title || '';
  const artist = data.author_name || '';
  const artists = splitArtists(artist);
  let discogsData = null;
  if (artist && title) {
    discogsData = await tryDiscogsLookup(artist, title);
  }

  return {
    platform: 'tidal',
    detected_type: detectPostType({ platform: 'tidal', title }),
    stream_url: url,
    embed_url: null,
    cover_image: data.thumbnail_url || null,
    year: discogsData?.year || null,
    tracks: discogsData?.tracks || [],
    artists,
    artist,
    channel: null,
    title,
    label: discogsData?.label || '',
    catNo: discogsData?.catNo || '',
    genres: discogsData?.genres || [],
    discogs_id: discogsData?.discogs_id || null,
    source: discogsData ? 'discogs' : 'platform',
  };
}

async function resolveBeatport(url) {
  // Beatport has no public API — use oEmbed or page scrape via title tag
  let title = '', artist = '';
  try {
    const oe = await fetch(`https://embed.beatport.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (oe.ok) {
      const d = await oe.json();
      title = d.title || '';
      artist = d.author_name || '';
    }
  } catch { /* ignore */ }

  const artists = splitArtists(artist);
  let discogsData = null;
  if (artist && title) {
    discogsData = await tryDiscogsLookup(artist, title);
  }

  return {
    platform: 'beatport',
    detected_type: detectPostType({ platform: 'beatport', title }),
    stream_url: url,
    embed_url: null,
    cover_image: null,
    year: discogsData?.year || null,
    tracks: discogsData?.tracks || [],
    artists,
    artist,
    channel: null,
    title,
    label: discogsData?.label || '',
    catNo: discogsData?.catNo || '',
    genres: discogsData?.genres || ['Electronic'],
    discogs_id: discogsData?.discogs_id || null,
    source: discogsData ? 'discogs' : 'platform',
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
  const releaseMatch = url.match(/discogs\.com\/(?:[\w-]+\/)?release\/(\d+)/);
  const masterMatch = url.match(/discogs\.com\/(?:[\w-]+\/)?master\/(\d+)/);
  const id = releaseMatch?.[1] || masterMatch?.[1];
  if (!id) throw new Error('Cannot parse Discogs release ID from URL');

  // A /master/ URL is a master id, and Discogs' /releases/{id} endpoint will
  // happily return a DIFFERENT, unrelated release for it rather than erroring.
  // Route each id to its own endpoint. (Masters carry no `labels`, so label /
  // catNo come back empty for those — the release-level pressing is where
  // that data lives.)
  const data = releaseMatch
    ? await getRelease(Number(id))
    : await getMaster(Number(id));
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
    tracks: (data.tracklist || []).map(t => ({ title: t.title, duration: t.duration, position: t.position })),
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
    }

    res.json(result);
  } catch (err) {
    console.error(`[media/resolve] ${platform} error:`, err.message);
    res.status(500).json({ error: err.message, platform });
  }
});

// GET /api/media/channel-uploads?videoUrl=<any video from the channel>&limit=24
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
  const { videoUrl, limit } = req.query;
  if (!videoUrl) return res.status(400).json({ error: 'videoUrl query param required' });
  const videoId = extractVideoId(videoUrl);
  if (!videoId) return res.status(400).json({ error: 'Not a YouTube URL', videoUrl });
  try {
    res.json(await getChannelUploads(videoId, limit));
  } catch (err) {
    console.error('[media/channel-uploads]', err.message);
    res.status(502).json({ error: err.message });
  }
});

export default router;