import { useState, useEffect, useRef } from 'react'
import { getUser, getUserId, authHeaders } from '../lib/auth'
import { STRIP_RADIUS } from './Strip'
import { joinApi } from '../lib/collections'
import { usePhone } from '../lib/usePhone'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// The compose bar (first step). FLOAT_SHADOW is a copy of Feed.jsx's token
// (Feed imports this file, so it isn't imported back) — keep the two equal.
const BAR_W = 680
const FLOAT_SHADOW = '0 0 48px rgba(0,0,0,0.11), 0 30px 60px -12px rgba(0,0,0,0.19), 0 2px 6px rgba(0,0,0,0.06)'
// The compose card. FLOAT_RADIUS is the shared STRIP_RADIUS (same as the
// feed cards); INK_DARK_BG is a copy of Feed.jsx's token, ART_RADIUS / CARD_W of DESIGN_BASE.artRadius / cardW, CARD_PADX
// of LIVE_PADX. CARD_ART is the card's own cover size (artSize 390 leaves
// no room for the text column at 800 wide).
const FLOAT_RADIUS = STRIP_RADIUS
const INK_DARK_BG = { '--theme-text-pri': 'rgba(255,255,255,0.95)', '--theme-text-sec': 'rgba(255,255,255,0.80)', '--theme-text-ter': 'rgba(255,255,255,0.66)', '--theme-border': 'rgba(255,255,255,0.18)' }
const CARD_W = 800
const CARD_PADX = 56
const CARD_ART = 300
const ART_RADIUS = 40
const CARD_FIELD = 'rgba(255,255,255,0.08)' // hover/focus wash behind editable text

const POST_TYPES = [
 { label: 'ALBUM', value: 'album' },
 { label: 'SINGLE', value: 'single' },
 { label: 'LIVE SET', value: 'livemix' },
]

const PLATFORMS = [
 { id: 'youtube', label: 'YOUTUBE', color: '#ff0000', textColor: '#fff', icon: '▶', re: /(?:youtube\.com|youtu\.be)/i },
 { id: 'soundcloud', label: 'SOUNDCLOUD', color: '#ff5500', textColor: '#fff', icon: '☁', re: /soundcloud\.com/i },
 { id: 'bandcamp', label: 'BANDCAMP', color: '#1da0c3', textColor: '#fff', icon: '◎', re: /bandcamp\.com/i },
 { id: 'spotify', label: 'SPOTIFY', color: '#1db954', textColor: '#fff', icon: '◉', re: /open\.spotify\.com/i },
 { id: 'mixcloud', label: 'MIXCLOUD', color: '#5000ff', textColor: '#fff', icon: '∿', re: /mixcloud\.com/i },
 { id: 'deezer', label: 'DEEZER', color: '#a238ff', textColor: '#fff', icon: '◈', re: /deezer\.com/i },
 { id: 'applemusic', label: 'APPLE MUSIC', color: '#fc3c44', textColor: '#fff', icon: '', re: /music\.apple\.com/i },
 { id: 'tidal', label: 'TIDAL', color: '#000', textColor: '#fff', icon: '~', re: /tidal\.com/i },
 { id: 'beatport', label: 'BEATPORT', color: '#01ff95', textColor: '#0a0a0a', icon: '♪', re: /beatport\.com/i },
 { id: 'residentadvisor', label: 'RA', color: '#f03', textColor: '#fff', icon: '◾', re: /(?:ra\.co|residentadvisor\.net)/i },
 { id: 'boilerroom', label: 'BOILER ROOM', color: '#111', textColor: '#fff', icon: '●', re: /boilerroom\.tv/i },
 { id: 'discogs', label: 'DISCOGS', color: '#333', textColor: '#fff', icon: '◈', re: /discogs\.com/i },
]

// A track link as short readable text: host without www, then the path
// and query (the card's tracklist shows these so it's obvious which tracks
// have links, and which link each one is).
function shortLink(url) {
 try { const u = new URL(url); return u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) + u.search }
 catch { return url }
}

function detectPlatform(url) {
 if (!url) return null
 return PLATFORMS.find(p => p.re.test(url)) || null
}
function extractDiscogsId(url) {
 const m = (url || '').match(/release\/(\d+)/)
 return m ? m[1] : null
}

const ARTIST_SPLIT_RE = /\s+(?:b2b|b-2-b|feat\.?|ft\.?|vs\.?|&|x)\s+|\s*,\s+|\s+\/\s+/gi
function splitArtists(str) {
 if (!str?.trim()) return []
 return str.split(ARTIST_SPLIT_RE).map(s => s.trim()).filter(Boolean).map(name => ({ name }))
}

// -- Discogs id book ---------------------------------------------------------
// The artist/label text inputs are free text, and splitArtists() re-derives the
// whole artist list from that text on every keystroke. Until 2026-08-26 that
// silently threw away the Discogs id each artist arrived with, and the label
// field never carried one at all -- so post_artists.discogs_artist_id and
// post_labels.discogs_label_id were NULL on every row in the database, which is
// what left the spotlight discography feature with nothing to resolve.
//
// Rather than fight the free-text field (splitting "what was typed" from "what
// was selected" and having to decide which wins), every id we ever see is
// remembered here against its normalised name and re-attached at POST time.
// Free text still wins for the NAME; the id simply follows any name we know.
// Rename an artist to something unrecognised and its id correctly drops to null.
const normName = n => (n || '').toLowerCase().replace(/\s*\(\d+\)$/, '').replace(/[^a-z0-9]+/g, ' ').trim()

function rememberIds(book, list) {
 for (const item of list || []) {
  const key = normName(item?.name)
  if (key && item?.id != null) book.set(key, item.id)
 }
}
function withId(book, name) {
 const id = book.get(normName(name))
 return id != null ? { name, id } : { name }
}

// editPost: a full post (GET /posts shape). Opens the same form pre-filled,
// and saving PATCHes that post instead of creating a new one.
export default function ComposeModal({ onClose, onPosted, initialUrl = '', editPost = null }) {
 // Posting needs a signed-in account (2026-10-01). Not signed in → the bar
 // shows phase 'name': a prompt that goes to /login.
 const user = getUser(), userId = getUserId()
 // 'name' → sign in first, 'link' → the paste bar, 'form' → the full form.
 // The bar hands over to the form on its own once a fetch lands (showForm).
 const [phase, setPhase] = useState(() => (editPost ? 'form' : !user || !userId ? 'name' : 'link'))
 const [coverEdit, setCoverEdit] = useState(false)
 const [openTrack, setOpenTrack] = useState(null) // track row whose link field is open

 const [inputUrl, setInputUrl] = useState(editPost ? (editPost.stream_url || editPost.discogs_url || '') : initialUrl)
 const [title, setTitle] = useState(editPost?.title || '')
 const [artist, setArtist] = useState(() => (editPost?.artists || []).map(a => a.artist_name).filter(Boolean).join(', '))
 const [artistsList, setArtistsList] = useState(() => (editPost?.artists || []).filter(a => a.artist_name).map(a => (a.discogs_artist_id != null ? { name: a.artist_name, id: a.discogs_artist_id } : { name: a.artist_name })))
 const [year, setYear] = useState(editPost?.year ? String(editPost.year) : '')
 const [label, setLabel] = useState(editPost?.labels?.[0]?.label_name || '')
 const [catNo, setCatNo] = useState(editPost?.labels?.[0]?.catalogue_number || '')
 const [genres, setGenres] = useState(editPost?.genres || [])
 const [tracks, setTracks] = useState(() => (editPost?.tracks || []).map(t => ({ position: t.position || '', title: t.title, duration: t.duration || '', stream_url: t.stream_url || t.youtube_url || '' })))
 const [comment, setComment] = useState(editPost?.notes || '')
 // The poster's own headline, shown above the description on the card.
 const [postTitle, setPostTitle] = useState(editPost?.post_title || '')
 const [coverArt, setCoverArt] = useState(editPost?.cover_image || '')
 const [postType, setPostType] = useState(editPost?.post_type || 'album')
 const [streamUrl, setStreamUrl] = useState(editPost?.stream_url || '')
 const [embedUrl, setEmbedUrl] = useState(editPost?.embed_url || '')
 const [channel, setChannel] = useState(editPost?.channel || '')
 const [fetching, setFetching] = useState(false)
 const [fetchStatus, setFetchStatus] = useState('')
 const [fetchError, setFetchError] = useState('')
 const [fetchSource, setFetchSource] = useState(null)
 const [duplicate, setDuplicate] = useState(null)
 const [posting, setPosting] = useState(false)
 // Phones (2026-10-05): one column, the cover full width, less padding.
 const phone = usePhone()
 const padX = phone ? 20 : CARD_PADX
 const [done, setDone] = useState(false)
 const [discogsVideos, setDiscogsVideos] = useState([])
 const [allReleases, setAllReleases] = useState(null)
 // The Discogs release the fetch landed on, from ANY platform. Until
 // 2026-09-25 only pasted discogs.com links saved one, so YouTube/SoundCloud/
 // Bandcamp posts that matched Discogs were stored with discogs_id NULL.
 const [discogsId, setDiscogsId] = useState(editPost?.discogs_id || null)

 // Normalised name -> Discogs id, for artists and labels. Survives every
 // free-text edit of those fields; see the note by rememberIds above.
 const artistIds = useRef(new Map())
 const labelIds = useRef(new Map((editPost?.labels || []).filter(l => l.label_name && l.discogs_label_id != null).map(l => [normName(l.label_name), l.discogs_label_id])))
 // Bumped whenever the tracklist is replaced; a running backgroundYTSearch
 // from before the bump stops instead of writing into the new list.
 const searchGen = useRef(0)

 // Names come from whatever is in the fields right now; ids are re-attached
 // from the book by name (see rememberIds above). backend/routes/posts.js
 // writes a.id -> post_artists.discogs_artist_id and l.id ->
 // post_labels.discogs_label_id, so this is the last point at which the id
 // can be lost -- and, before 2026-08-26, always was.
 const artistsForDB = (artistsList.length ? artistsList : splitArtists(artist))
  .filter(a => a?.name?.trim())
  .map(a => (a.id != null ? { name: a.name.trim(), id: a.id } : withId(artistIds.current, a.name.trim())))
 const labelsForDB = label.trim()
  ? [{ ...withId(labelIds.current, label.trim()), catno: catNo.trim() }]
  : []
 const linkedIdCount = artistsForDB.filter(a => a.id != null).length + labelsForDB.filter(l => l.id != null).length

 const activePlatform = detectPlatform(inputUrl)
 const isDiscogs = activePlatform?.id === 'discogs'
 const isLiveMix = postType === 'livemix'

 useEffect(() => { if (!editPost && initialUrl && detectPlatform(initialUrl)) handleFetch() }, []) // eslint-disable-line
 useEffect(() => {
 const h = e => { if (e.key === 'Escape') onClose() }
 window.addEventListener('keydown', h)
 return () => window.removeEventListener('keydown', h)
 }, [onClose])

 function clearForm() {
 artistIds.current.clear(); labelIds.current.clear(); searchGen.current++
 setTitle(''); setArtist(''); setArtistsList([]); setYear(''); setLabel(''); setCatNo('')
 setGenres([]); setTracks([]); setCoverArt(''); setStreamUrl(''); setEmbedUrl(''); setChannel('')
 setFetchSource(null); setAllReleases(null); setDiscogsVideos([]); setDiscogsId(null)
 }

 function applyEnrichment(data) {
 // /api/media/resolve returns artists as [{ id, name }] plus a label_id
 // whenever it landed on a Discogs release -- for any of the 12 platforms,
 // not just discogs.com links. See the id-attaching block at the end of
 // backend/routes/media.js.
 rememberIds(artistIds.current, data.artists)
 if (data.label && data.label_id != null) rememberIds(labelIds.current, [{ name: data.label, id: data.label_id }])
 if (data.title) setTitle(data.title)
 if (data.artist) setArtist(data.artist)
 if (data.artists?.length) setArtistsList(data.artists)
 else if (data.artist) setArtistsList(splitArtists(data.artist))
 if (data.label) setLabel(data.label)
 if (data.catNo) setCatNo(data.catNo)
 if (data.year) setYear(String(data.year))
 if (data.cover_image) setCoverArt(data.cover_image)
 if (data.genres?.length) setGenres(data.genres.slice(0, 6))
 if (data.tracks?.length) setTracks(data.tracks)
 if (data.stream_url) setStreamUrl(data.stream_url)
 if (data.embed_url) setEmbedUrl(data.embed_url)
 if (data.channel) setChannel(data.channel)
 if (data.detected_type) setPostType(data.detected_type)
 if (data.videos?.length) setDiscogsVideos(data.videos)
 if (data.all_releases?.length > 1) setAllReleases(data.all_releases)
 setDiscogsId(data.discogs_id || null)
 setFetchSource(data.source || 'platform')
 }

 function applyRelease(rel) {
 // Alternates from tryDiscogsLookup carry their own artists / label_id.
 rememberIds(artistIds.current, rel.artists)
 if (rel.label && rel.label_id != null) rememberIds(labelIds.current, [{ name: rel.label, id: rel.label_id }])
 if (rel.discogs_id) setDiscogsId(rel.discogs_id)
 const relArtist = rel.artists?.length ? rel.artists.map(a => a.name).filter(Boolean).join(', ') : artist
 if (rel.artists?.length) { setArtistsList(rel.artists); setArtist(relArtist) }
 const cleanTitle = rel.release_title?.includes(' - ') ? rel.release_title.split(' - ').slice(1).join(' - ') : (rel.release_title || '')
 if (cleanTitle) setTitle(cleanTitle)
 if (rel.label) setLabel(rel.label)
 if (rel.catNo) setCatNo(rel.catNo)
 if (rel.year) setYear(String(rel.year))
 if (rel.cover_image) setCoverArt(rel.cover_image)
 if (rel.genres?.length) setGenres(rel.genres.slice(0, 6))
 if (rel.tracks?.length) {
 const mapped = rel.tracks.map(t => ({ ...t, stream_url: '' }))
 searchGen.current++
 setTracks(mapped)
 setPostType(rel.tracks.length >= 6 ? 'album' : rel.tracks.length <= 2 ? 'single' : 'album')
 setDiscogsVideos(rel.videos || [])
 backgroundYTSearch(mapped, relArtist, rel.label, rel.catNo, rel.videos || [], rel.discogs_id)
 }
 setAllReleases(null)
 }

 async function handleFetch() {
 setFetchError(''); setFetchStatus(''); setDuplicate(null); clearForm()
 let url = inputUrl.trim()
 const ytIdMatch = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
 if (ytIdMatch && /youtube\.com|youtu\.be/.test(url)) { url = `https://www.youtube.com/watch?v=${ytIdMatch[1]}`; setInputUrl(url) }
 const platform = detectPlatform(url)
 if (!url) { setFetchError('PASTE A LINK FIRST'); return }
 if (!platform) { setFetchError("THAT ISN'T A LINK WE CAN READ YET"); return }

 if (platform.id === 'discogs') {
 // Shop listings, marketplace pages and masters don't carry a release id in
 // the URL; the backend does that hop (resolveDiscogsUrl) instead of making
 // the user go and find the /release/ page.
 let id = extractDiscogsId(url)
 if (!id) {
 setFetching(true); setFetchStatus('FINDING THE RELEASE ON DISCOGS...')
 try {
 const r = await fetch(`${API}/discogs/resolve-url?url=${encodeURIComponent(url)}`)
 const d = await r.json().catch(() => ({}))
 if (!r.ok || !d.releaseId) throw new Error(d.error || `lookup failed (${r.status})`)
 id = String(d.releaseId)
 } catch (err) { setFetchError(`DISCOGS — ${String(err.message).toUpperCase()}`); setFetching(false); setFetchStatus(''); return }
 }
 setFetching(true); setFetchStatus('CHECKING DATABASE...')
 try {
 const dupRes = await fetch(`${API}/posts?discogs_id=${id}`)
 if (dupRes.ok) { const dd = await dupRes.json(); const dp = Array.isArray(dd) ? dd : dd.posts; if (dp?.length > 0 && dp[0].id !== editPost?.id) { setDuplicate(dp[0]); setFetching(false); setFetchStatus(''); return } }
 } catch { /* continue */ }
 setFetchStatus('FETCHING FROM DISCOGS...')
 try {
 const res = await fetch(`${API}/discogs/release/${id}`)
 if (!res.ok) throw new Error(`Discogs fetch failed: ${res.status}`)
 const data = await res.json()
 const rawTitle = data.title || ''
 const parts = rawTitle.split(' - ')
 const cleanTitle = parts.length > 1 ? parts.slice(1).join(' - ') : rawTitle
 const fArtist = data.artists?.map(a => a.name).join(', ') || ''
 const fLabel = data.labels?.[0]?.name || ''
 const fCatno = data.labels?.[0]?.catno || ''
 // normaliseRelease() in discogsService returns artists AND labels as
 // [{ id, name, ... }]; both ids are kept from here on.
 rememberIds(artistIds.current, data.artists)
 rememberIds(labelIds.current, data.labels)
 setTitle(cleanTitle); setArtist(fArtist); setLabel(fLabel); setCatNo(fCatno); setYear(String(data.year || ''))
 setCoverArt(data.coverImage || data.thumbImage || '')
 setDiscogsVideos(data.videos || [])
 setGenres([...(data.genres || []), ...(data.styles || [])].slice(0, 6))
 // The release page, not the pasted link: a shop listing URL dies once sold.
 setFetchSource('discogs'); setStreamUrl(`https://www.discogs.com/release/${id}`); setDiscogsId(data.discogsId || Number(id) || null)
 const discogsArtists = data.artists?.length ? data.artists : splitArtists(fArtist)
 setArtistsList(discogsArtists)
 const fmtName = data.formats?.map(f => f.name).join(' ') || ''
 const tCount = (data.tracklist || []).length
 setPostType(/\balbum\b/i.test(fmtName) || tCount >= 6 ? 'album' : 'single')
 const videoMap = {}
 ;(data.videos || []).forEach(v => {
 const m = v.url?.match(/(?:v=|youtu\.be\/)([^&\s]{11})/)
 if (!m) return
 const ytUrl = `https://www.youtube.com/watch?v=${m[1]}`
 const cleaned = (v.title || '').toLowerCase().replace(/\(official.*?\)/gi, '').replace(/\[.*?\]/gi, '').replace(/ft\..*$/gi, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
 videoMap[cleaned] = ytUrl
 })
 const rawTracks = (data.tracklist || []).map(t => {
 const cl = (t.title || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
 let ytUrl = videoMap[cl] || null
 if (!ytUrl) for (const [k, v] of Object.entries(videoMap)) { if (k.includes(cl) || cl.includes(k)) { ytUrl = v; break } }
 return { position: t.position, title: t.title, artists: t.artists || [], stream_url: ytUrl || '' }
 })
 setTracks(rawTracks)
 const ytCount = rawTracks.filter(t => t.stream_url).length
 const missing = rawTracks.filter(t => !t.stream_url)
 setFetchStatus(`✓ FETCHED · ${rawTracks.length} TRACKS · ${ytCount} YT LINKS${missing.length ? ` · SEARCHING ${missing.length} MORE...` : ''}`)
 if (missing.length > 0 && fArtist) backgroundYTSearch(rawTracks, fArtist, fLabel, fCatno, data.videos, id)
 } catch (err) { setFetchError(`FETCH FAILED — ${err.message}`) } finally { setFetching(false) }
 return
 }

 setFetching(true); setFetchStatus(`FETCHING FROM ${platform.label}...`)
 try {
 const res = await fetch(`${API}/media/resolve?url=${encodeURIComponent(url)}`)
 if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Resolver returned ${res.status}`) }
 const data = await res.json()
 applyEnrichment(data)
 // No Discogs release: say which catalogues the partial fill came from
 // (backend resolveWithFallback — iTunes / Deezer / MusicBrainz, plus the
 // Discogs artist and label ids).
 const FILL_NAMES = { musicbrainz: 'MUSICBRAINZ', deezer: 'DEEZER', itunes: 'ITUNES', 'discogs-artist': 'DISCOGS ARTIST', 'discogs-label': 'DISCOGS LABEL' }
 const fill = (data.fill_sources || []).map(s => FILL_NAMES[s]).filter(Boolean)
 const src = data.source === 'discogs' ? ' → DISCOGS MATCH' : fill.length ? ` → PARTIAL FILL FROM ${fill.join(' + ')}` : ''
 if (data.warning) { setFetchStatus(`⚠ ${data.warning}`); return }
 const tCount = data.tracks?.length || 0
 const lCount = data.tracks?.filter(t => t.stream_url).length || 0
 if (data.detected_type === 'livemix') { setFetchStatus(`✓ ${platform.label}${src} · LIVE SET DETECTED`) }
 else if (tCount > 0) {
 setFetchStatus(`✓ ${platform.label}${src} · ${tCount} TRACKS · ${lCount} LINKS`)
 if (data.artist) { const missing = data.tracks.filter(t => !t.stream_url); if (missing.length) backgroundYTSearch(data.tracks, data.artist, data.label, data.catNo, data.videos, data.discogs_id) }
 } else { setFetchStatus(`✓ ${platform.label}${src} · TITLE & ARTIST PRE-FILLED`) }
 } catch (err) { setFetchError(`${platform.label} FETCH FAILED — ${err.message}`) }
 finally { setFetching(false) }
 }

 // Fills empty tracklist rows. Pass 1: match Discogs' own videos[] by title
 // (free). Pass 2: one YouTube search per row still empty, via the backend
 // (/discogs/youtube/search — cached, daily-capped; see searchTrackVideo).
 // Compilations search with each track's own Discogs artist, not "Various".
 // `videos` is passed in by callers that have just fetched it: reading
 // discogsVideos right after setDiscogsVideos() saw the previous render's
 // (empty) list. searchGen stops a run whose tracklist has been replaced
 // (new fetch / other release picked), and rows are only filled while still
 // empty, so a URL typed by hand mid-search is never overwritten.
 // releaseId: when the tracklist is a Discogs release, each search result is
 // saved per release + position (release_track_links) for spotlights to reuse.
 function backgroundYTSearch(initial, fArtist, fLabel, fCatno, videos = discogsVideos, releaseId = null) {
 const gen = searchGen.current
 const stale = () => searchGen.current !== gen
 const setUrl = (i, url) => setTracks(prev => prev.map((t, idx) => (idx === i && !t.stream_url ? { ...t, stream_url: url } : t)))
 ;(async () => {
 const normalize = s => (s || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
 const updated = [...initial]
 for (let i = 0; i < updated.length && videos?.length; i++) {
 if (updated[i].stream_url) continue
 const tt = normalize(updated[i].title); const ar = normalize(fArtist)
 let best = null, bestScore = -Infinity
 for (const v of videos) {
 const vurl = v.url || v.uri || ''
 if (!vurl.includes('youtube.com') && !vurl.includes('youtu.be')) continue
 const vt = normalize(v.title || '')
 let score = 0
 if (vt.includes(tt)) score += 50
 else { const words = tt.split(' ').filter(w => w.length > 2); const matched = words.filter(w => vt.includes(w)); if (words.length > 0 && matched.length / words.length >= 0.7) score += 30 }
 if (vt.includes(ar)) score += 20
 if (/live|remix|cover|karaoke/.test(vt)) score -= 20
 if (score > bestScore) { bestScore = score; best = v }
 }
 if (best && bestScore >= 30) {
 const videoId = (best.url || '').match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1]
 if (videoId) { const ytUrl = `https://www.youtube.com/watch?v=${videoId}`; updated[i] = { ...updated[i], stream_url: ytUrl }; setUrl(i, ytUrl) }
 }
 }

 const releaseArtist = /^various( artists)?$/i.test((fArtist || '').trim()) ? '' : (fArtist || '')
 let capped = false
 for (let i = 0; i < updated.length; i++) {
 if (stale()) return
 if (updated[i].stream_url) continue
 const trackArtist = (updated[i].artists || []).map(a => a.name).filter(Boolean).join(' ') || releaseArtist
 setFetchStatus(`SEARCHING YOUTUBE · ${updated[i].position || i + 1} ${(updated[i].title || '').toUpperCase()}...`)
 try {
 const q = new URLSearchParams({ artist: trackArtist, title: updated[i].title || '', label: fLabel || '' })
 if (releaseId && updated[i].position) { q.set('release_id', releaseId); q.set('position', updated[i].position) }
 const r = await fetch(`${API}/discogs/youtube/search?${q}`)
 const d = await r.json()
 if (d.capped) { capped = true; break }
 if (d.youtube_url && !stale()) { updated[i] = { ...updated[i], stream_url: d.youtube_url }; setUrl(i, d.youtube_url) }
 } catch { /* one failed row shouldn't stop the rest */ }
 }
 if (stale()) return
 const found = updated.filter(t => t.stream_url).length
 setFetchStatus(`✓ ${updated.length} TRACKS · ${found} LINKS FOUND${capped ? ' · DAILY YOUTUBE SEARCH LIMIT REACHED' : ''}`)
 })()
 }

 function updateTrack(i, patch) { setTracks(prev => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t))) }
 function removeGenre(g) { setGenres(prev => prev.filter(x => x !== g)) }
 function addGenre(g) { const t = g.trim(); if (t && !genres.includes(t)) setGenres(prev => [...prev, t]) }

 async function handlePost() {
 if (!title.trim()) return
 setPosting(true); setFetchError('')
 try {
 const postRes = await fetch(editPost ? `${API}/posts/${editPost.id}` : `${API}/posts`, { method: editPost ? 'PATCH' : 'POST', headers: authHeaders(), body: JSON.stringify({ discogs_id: discogsId || null, discogs_url: discogsId ? `https://www.discogs.com/release/${discogsId}` : (isDiscogs ? inputUrl : ''), stream_url: streamUrl || inputUrl, embed_url: embedUrl || '', channel: channel || '', platform: activePlatform?.id || editPost?.platform || '', post_type: postType, title: title.trim(), artists: artistsForDB, labels: labelsForDB, year: year ? parseInt(year) : null, cover_image: coverArt, genres, tracks: tracks.filter(t => t.title?.trim()), body: comment.trim(), notes: comment.trim(), post_title: postTitle.trim() }) })
 if (!postRes.ok) { const e = await postRes.json().catch(() => ({})); throw new Error(e.error || `${editPost ? 'SAVE' : 'POST'} failed: ${postRes.status}`) }
 const saved = await postRes.json()
 const savedPostId = saved.id || saved.postId || editPost?.id
 setDone(true)
 setTimeout(() => { onPosted?.({ postId: savedPostId }); onClose() }, 800)
 } catch (err) { setFetchError(`${editPost ? 'FAILED TO SAVE' : 'FAILED TO POST'} — ${String(err.message).toUpperCase()}`) } finally { setPosting(false) }
 }

 const hasFetched = !!title

 function goSignIn() { window.location.href = '/login' }

 // Already up (2026-10-04): there's one post per release, so the record is
 // ♥'d instead (2026-10-06) — on your wall and in your followers' feeds.
 const dupBy = duplicate?.user?.username || null
 const dupMine = !!duplicate && (duplicate.user_id === getUserId() || (duplicate.alsoPostedBy || []).includes(getUser()))
 async function postItToo() {
 setFetching(true); setFetchError('')
 try { await joinApi.join(duplicate.id); setDuplicate(null); setFetchStatus('ON YOUR WALL ✓'); setTimeout(() => { onPosted?.({ postId: duplicate.id }); onClose() }, 800) }
 catch (err) { setFetchError(String(err.message).toUpperCase()) }
 finally { setFetching(false) }
 }

 const scrim = { position: 'fixed', inset: 0, background: 'rgba(30,33,38,0.7)', zIndex: 1000, backdropFilter: 'blur(3px)' }
 const mono = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, lineHeight: 1.45, letterSpacing: '0.09em', textTransform: 'uppercase' } // DESIGN_BASE metaline
 const quietBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }

 // First step (gabriel, 2026-09-30, mockup "A · bar"): one pill — pick a
 // username if there isn't one, then paste a link. Styled like the feed's
 // search bar (--theme-dark3 pill). The compose card opens once a fetch
 // lands; if a link gives nothing back, "fill it in yourself" opens it empty.
 if (phase !== 'form' && !(phase === 'link' && hasFetched)) {
 const naming = phase === 'name'
 const val = naming ? 'sign in' : inputUrl
 const busy = naming ? false : fetching
 const submit = naming ? goSignIn : handleFetch
 const status = naming ? '' : (fetchError || (fetching ? (fetchStatus || 'FETCHING…') : fetchStatus))
 const isError = naming ? false : !!fetchError
 const cameBackEmpty = !naming && !fetching && !duplicate && (!!fetchError || !!fetchStatus)
 return (
 <div data-overlay="" onClick={e => { if (e.target === e.currentTarget) onClose() }} style={scrim}>
 <div style={{ position: 'absolute', left: '50%', top: '34%', width: BAR_W, maxWidth: 'calc(100vw - 32px)', transform: 'translate(-50%, -50%)' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 64, padding: '0 12px 0 24px', borderRadius: 99, background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', boxShadow: `${FLOAT_SHADOW}, 0 2px 8px rgba(0,0,0,0.2)` }}>
 <span style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 300, fontSize: 26, lineHeight: 1, color: 'var(--theme-text-ter)', width: 18, textAlign: 'center' }}>{naming ? '@' : '+'}</span>
 {naming ? (
 <button autoFocus onClick={goSignIn} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--theme-text-pri)', fontFamily: 'Barlow, sans-serif', fontSize: 18 }}>Sign in or create an account to post</button>
 ) : <input
 key={phase} autoFocus value={val} disabled={busy} spellCheck={false} autoComplete="off"
 onChange={e => setInputUrl(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && submit()}
 placeholder="paste anything, from any platform"
 style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--theme-text-pri)', fontFamily: 'Barlow, sans-serif', fontSize: 18 }}
 />}
 {!naming && activePlatform && <span style={{ flexShrink: 0, background: activePlatform.color, color: activePlatform.textColor, borderRadius: 3, padding: '4px 7px', fontFamily: 'Barlow, sans-serif', fontSize: 9, fontWeight: 600, letterSpacing: '0.16em' }}>{activePlatform.label}</span>}
 <button onClick={submit} disabled={!val.trim() || busy} style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'var(--theme-accent)', color: '#fff', fontSize: 18, cursor: 'pointer', opacity: !val.trim() || busy ? 0.35 : 1, transition: 'background 0.8s' }}>{busy ? '◐' : '→'}</button>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, padding: '12px 24px 0', ...mono }}>
 {duplicate
 ? <span style={{ color: 'rgba(255,255,255,0.85)' }}>{dupMine ? `Already on your wall — ${duplicate.title}` : `Already up, posted by @${dupBy} — ${duplicate.title}. ♥ it to keep it on your wall.`}</span>
 : status
 ? <span style={{ color: isError ? '#ff8a65' : 'rgba(255,255,255,0.75)' }}>{status}</span>
 : naming
 ? <span style={{ color: 'rgba(255,255,255,0.55)' }}>Posts are signed with your account.</span>
 : <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', maxWidth: 480, fontSize: 10, letterSpacing: '0.08em' }}>{PLATFORMS.map(p => <span key={p.id} style={{ color: activePlatform?.id === p.id ? '#fff' : 'rgba(255,255,255,0.45)' }}>{p.label}</span>)}</span>}
 <span style={{ display: 'flex', gap: 16, flexShrink: 0, color: 'rgba(255,255,255,0.45)' }}>
 {duplicate && !dupMine && <button onClick={postItToo} disabled={fetching} style={{ ...quietBtn, color: '#fff' }}>♥ add to my wall</button>}
 {cameBackEmpty && <button onClick={() => setPhase('form')} style={{ ...quietBtn, color: '#fff' }}>fill it in yourself</button>}
 <span>ENTER ↵ · ESC</span>
 </span>
 </div>
 </div>
 </div>
 )
 }

 // ── The compose card (gabriel, 2026-09-30) ────────────────────────────────
 // The post as a feed card, edited in place — replaces the old white form.
 // Sits on --theme-showcase like the spotlights and the intro panel; that
 // swatch is dark in all 8 palettes, so the feed's INK_DARK_BG tones apply.
 // Sizes are DESIGN_BASE's: card width cardW 800, art corners artRadius 40,
 // type 30/700 artist + title, 11px mono metaline, 13px tracks, 9px badges.
 const badge = { display: 'inline-block', fontFamily: 'Barlow, sans-serif', fontSize: 9, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', padding: '4px 7px', borderRadius: 3, lineHeight: 1 }
 const zlabel = { fontFamily: 'Barlow, sans-serif', fontSize: 9, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--theme-text-ter)', margin: '26px 0 8px', display: 'flex', justifyContent: 'space-between' }
 const bigField = { width: '100%', fontFamily: 'Barlow, sans-serif', fontSize: 30, fontWeight: 700, lineHeight: 1.02, letterSpacing: '-0.022em' }
 const fitTo = (v, ph) => Math.max(String(v || '').length, ph.length) + 1
 const linkCount = tracks.filter(t => t.stream_url).length

 return (
 <div data-overlay="" onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ ...scrim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <style>{`
 .lnvc-f { background: transparent; border: none; outline: none; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; padding: 2px 4px; margin: -2px -4px; border-radius: 4px; min-width: 0; transition: background .15s; }
 .lnvc-f:hover, .lnvc-f:focus { background: ${CARD_FIELD}; }
 .lnvc-f::placeholder { color: var(--theme-text-ter); opacity: .6; }
 .lnvc-q { background: none; border: none; padding: 0; cursor: pointer; color: var(--theme-text-ter); font: 600 11px/1 Barlow, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
 .lnvc-q:hover { color: var(--theme-text-pri); }
 .lnvc-g:hover { text-decoration: line-through; }
 @media (max-width: 767px), (pointer: coarse) and (max-height: 500px) { input.lnvc-f, textarea.lnvc-f { font-size: 16px !important; } }
 `}</style>
 <div style={{ ...INK_DARK_BG, width: CARD_W, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)', background: 'var(--theme-showcase)', borderRadius: FLOAT_RADIUS, boxShadow: FLOAT_SHADOW, display: 'flex', flexDirection: 'column', overflow: 'hidden', color: 'var(--theme-text-pri)', transition: 'background 0.8s' }}>

 {/* minHeight 0: lets this middle section shrink to the window and scroll (2026-10-06 — a long release list pushed the description out of reach) */}
 <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `${phone ? 24 : 40}px ${padX}px 8px` }}>
 {/* header — what this is, where it came from, how well it matched */}
 <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
 <span style={{ ...badge, background: 'var(--theme-border)', color: 'var(--theme-text-sec)' }}>{editPost ? `Edit post #${editPost.id}` : 'New post'}</span>
 {activePlatform && <span style={{ ...badge, background: activePlatform.color, color: activePlatform.textColor }}>{activePlatform.label}</span>}
 {/* 2026-08-26: how many Discogs artist/label ids will be written with
     this post. Zero on a Discogs-matched fetch means the id chain broke. */}
 {hasFetched && <span style={{ ...mono, fontSize: 10, color: 'var(--theme-text-ter)' }}>{fetchSource === 'discogs' ? '◈ Discogs match' : fetchSource === 'platform' ? 'Platform data only' : ''}{fetchSource ? ' · ' : ''}{linkedIdCount ? `${linkedIdCount} Discogs id${linkedIdCount > 1 ? 's' : ''} linked` : 'no Discogs ids'}</span>}
 <span style={{ flex: 1 }} />
 <button onClick={onClose} className="lnvc-q" style={{ fontSize: 20, letterSpacing: 0 }} title="Close (Esc)">×</button>
 </div>

 {(fetchStatus || fetchError) && <div style={{ ...mono, marginBottom: 18, color: fetchError ? '#ff8a65' : 'var(--theme-text-ter)' }}>{fetchError || fetchStatus}</div>}

 {allReleases && allReleases.length > 1 && (
 <div style={{ border: '1px solid var(--theme-border)', borderRadius: 10, padding: '12px 14px', marginBottom: 24 }}>
 <div style={{ ...zlabel, margin: '0 0 10px' }}><span>◈ Several releases match — pick one</span><button className="lnvc-q" style={{ fontSize: 9 }} onClick={() => setAllReleases(null)}>keep this one</button></div>
 {allReleases.map((rel, i) => {
 const relTitle = rel.release_title?.includes(' - ') ? rel.release_title.split(' - ').slice(1).join(' - ') : (rel.release_title || '')
 return (
 <div key={rel.discogs_id || i} onClick={() => applyRelease(rel)} className="lnvc-f" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px', margin: 0, cursor: 'pointer' }}>
 <div style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0, background: rel.cover_image ? `center/cover url("${rel.cover_image}")` : CARD_FIELD }} />
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{relTitle}</div>
 <div style={{ ...mono, fontSize: 10, color: 'var(--theme-text-ter)' }}>{[rel.label, rel.catNo, rel.year, rel.country].filter(Boolean).join(' · ')}</div>
 </div>
 <span style={{ ...mono, fontSize: 10, color: 'var(--theme-text-ter)', flexShrink: 0 }}>{rel.tracks?.length || 0} tracks</span>
 </div>
 )
 })}
 </div>
 )}

 <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : `${CARD_ART}px 1fr`, gap: phone ? 20 : 32 }}>
 {/* cover — click it to paste a different image link */}
 <div>
 <div onClick={() => setCoverEdit(v => !v)} title="Change the cover" style={{ width: phone ? '100%' : CARD_ART, height: phone ? 'auto' : CARD_ART, aspectRatio: '1', borderRadius: ART_RADIUS, background: coverArt ? `center/cover url("${coverArt}")` : CARD_FIELD, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--theme-text-ter)', fontSize: 40 }}>{coverArt ? '' : (isLiveMix ? '◉' : '◈')}</div>
 {(coverEdit || !coverArt) && <input className="lnvc-f" value={coverArt} onChange={e => setCoverArt(e.target.value)} placeholder="cover image link" style={{ ...mono, fontSize: 10, width: '100%', marginTop: 10 }} />}
 </div>

 <div style={{ minWidth: 0 }}>
 <div style={{ display: 'flex', gap: 6 }}>
 {POST_TYPES.map(pt => {
 const on = postType === pt.value
 return <button key={pt.value} onClick={() => setPostType(pt.value)} style={{ ...badge, cursor: 'pointer', border: `1px solid ${on ? 'var(--theme-text-pri)' : 'var(--theme-border)'}`, background: on ? 'var(--theme-text-pri)' : 'transparent', color: on ? 'var(--theme-showcase)' : 'var(--theme-text-ter)' }}>{pt.label}</button>
 })}
 </div>
 <input className="lnvc-f" value={artist} onChange={e => { setArtist(e.target.value); setArtistsList(splitArtists(e.target.value)) }} placeholder="Artist" style={{ ...bigField, display: 'block', marginTop: 15 }} />
 <input className="lnvc-f" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" style={{ ...bigField, display: 'block', color: 'var(--theme-text-sec)', marginTop: 2 }} />
 {artistsList.length > 1 && (
 <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>{artistsList.map((a, i) => <span key={i} style={{ fontFamily: 'Barlow, sans-serif', fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'var(--theme-border)', color: 'var(--theme-text-sec)' }}>{a.name}</span>)}</div>
 )}
 <div style={{ ...mono, color: 'var(--theme-text-ter)', marginTop: 11, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 8px' }}>
 {isLiveMix
 ? <input className="lnvc-f" value={channel} onChange={e => setChannel(e.target.value)} placeholder="CHANNEL / VENUE" size={fitTo(channel, 'CHANNEL / VENUE')} style={{ color: 'var(--theme-text-sec)' }} />
 : <>
 <input className="lnvc-f" value={label} onChange={e => setLabel(e.target.value)} placeholder="LABEL" size={fitTo(label, 'LABEL')} style={{ color: 'var(--theme-text-sec)' }} />·
 <input className="lnvc-f" value={catNo} onChange={e => setCatNo(e.target.value)} placeholder="CAT NO" size={fitTo(catNo, 'CAT NO')} style={{ color: 'var(--theme-text-sec)' }} />
 </>}
 ·<input className="lnvc-f" value={year} onChange={e => setYear(e.target.value)} placeholder="YEAR" size={fitTo(year, 'YEAR')} style={{ color: 'var(--theme-text-sec)' }} />
 </div>
 {isLiveMix && (
 <div style={{ ...mono, fontSize: 10, color: 'var(--theme-text-ter)', marginTop: 6, display: 'flex', gap: 8, alignItems: 'baseline' }}>
 STREAM <input className="lnvc-f" value={streamUrl} onChange={e => setStreamUrl(e.target.value)} placeholder="YOUTUBE, SOUNDCLOUD, MIXCLOUD…" style={{ flex: 1, textTransform: 'none', color: 'var(--theme-text-sec)' }} />
 </div>
 )}
 <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 14 }}>
 {genres.map(g => <span key={g} className="lnvc-g" onClick={() => removeGenre(g)} title="Remove" style={{ fontFamily: 'Barlow, sans-serif', fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'var(--theme-border)', color: 'var(--theme-text-sec)', cursor: 'pointer' }}>{g}</span>)}
 <input className="lnvc-f" placeholder="+ genre" size={9} onKeyDown={e => { if (e.key === 'Enter') { addGenre(e.target.value); e.target.value = '' } }} style={{ fontFamily: 'Barlow, sans-serif', fontSize: 11, margin: 0, padding: '3px 10px', borderRadius: 99, border: '1px dashed var(--theme-border)' }} />
 </div>
 </div>
 </div>

 {!isLiveMix && (
 <>
 <div style={zlabel}><span>Tracklist</span><span>{tracks.length ? `${linkCount} / ${tracks.length} playable` : ''}</span></div>
 <div style={{ columns: 2, columnGap: 28 }}>
 {tracks.map((t, i) => {
 const tp = detectPlatform(t.stream_url)
 return (
 <div key={i} style={{ breakInside: 'avoid', padding: '3.5px 0' }}>
 <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 14px', gap: 10, alignItems: 'baseline' }}>
 <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: 'var(--theme-text-ter)' }}>{t.position || i + 1}</span>
 <input className="lnvc-f" value={t.title} onChange={e => updateTrack(i, { title: e.target.value })} placeholder="Track title" style={{ fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--theme-text-sec)' }} />
 <button onClick={() => setOpenTrack(o => (o === i ? null : i))} title={t.stream_url ? 'Playable — edit link' : 'No link — add one'} style={{ width: 8, height: 8, padding: 0, borderRadius: '50%', border: 'none', cursor: 'pointer', alignSelf: 'center', background: t.stream_url ? (tp?.color || '#4caf50') : 'var(--theme-border)' }} />
 </div>
 {openTrack !== i && t.stream_url && (
 <button onClick={() => setOpenTrack(i)} title={`${t.stream_url}
Click to edit`}
 style={{ display: 'flex', gap: 6, alignItems: 'baseline', width: 'calc(100% - 38px)', marginLeft: 38, marginTop: 2, padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', minWidth: 0 }}>
 <span style={{ ...mono, fontSize: 9, flexShrink: 0, color: tp?.color || 'var(--theme-text-ter)' }}>{tp?.label || 'LINK'}</span>
 <span style={{ ...mono, fontSize: 10, textTransform: 'none', letterSpacing: 0, color: 'var(--theme-text-ter)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{shortLink(t.stream_url)}</span>
 </button>
 )}
 {openTrack === i && <input className="lnvc-f" autoFocus value={t.stream_url} onChange={e => updateTrack(i, { stream_url: e.target.value })} onKeyDown={e => e.key === 'Enter' && setOpenTrack(null)} placeholder="paste a link to this track" style={{ ...mono, fontSize: 10, textTransform: 'none', width: 'calc(100% - 38px)', marginLeft: 38, marginTop: 4, color: 'var(--theme-text-sec)' }} />}
 </div>
 )
 })}
 </div>
 <button className="lnvc-q" style={{ marginTop: 8, fontSize: 10 }} onClick={() => { setTracks(prev => [...prev, { position: '', title: '', stream_url: '' }]); setOpenTrack(null) }}>+ track</button>
 </>
 )}

 <div style={zlabel}><span>Post title</span><span>optional</span></div>
 <input value={postTitle} onChange={e => setPostTitle(e.target.value)} maxLength={120} placeholder={isLiveMix ? 'Sum up the set in a line…' : 'Sum up the record in a line…'}
 style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', borderRadius: 10, padding: '10px 14px', background: CARD_FIELD, color: 'var(--theme-text-pri)', fontFamily: 'Barlow, sans-serif', fontSize: 15, fontWeight: 600 }} />

 <div style={zlabel}><span>Description</span><span>optional</span></div>
 <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder={isLiveMix ? 'Lineup, venue, date, set notes…' : 'What makes this record special…'} rows={3} style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', resize: 'vertical', borderRadius: 10, padding: '12px 14px', background: CARD_FIELD, color: 'var(--theme-text-pri)', fontFamily: 'Barlow, sans-serif', fontSize: 13, lineHeight: 1.5 }} />
 </div>

 {/* byline row — who's posting, and the one action */}
 <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: phone ? 12 : 20, padding: `18px ${padX}px 22px`, borderTop: '1px solid var(--theme-border)' }}>
 <span style={{ fontFamily: 'Barlow, sans-serif', fontSize: 11.5, fontWeight: 600, color: 'var(--theme-text-sec)' }}>@{user}</span>
 {!phone && <span style={{ ...mono, fontSize: 10, color: 'var(--theme-text-ter)' }}>{editPost ? 'editing' : 'posting as'}</span>}
 <span style={{ flex: 1 }} />
 {!editPost && <button className="lnvc-q" onClick={() => { setPhase('link'); clearForm(); setFetchStatus(''); setFetchError('') }}>different link</button>}
 <button onClick={handlePost} disabled={!title.trim() || posting || done} style={{ border: 'none', borderRadius: 99, height: 40, padding: '0 22px', cursor: 'pointer', background: 'var(--theme-text-pri)', color: 'var(--theme-showcase)', fontFamily: 'Barlow, sans-serif', fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: !title.trim() || posting ? 0.4 : 1 }}>
 {done ? (editPost ? '✓ Saved' : '✓ Posted') : posting ? (editPost ? 'Saving…' : 'Posting…') : (editPost ? 'Save ▶' : 'Post ▶')}
 </button>
 </div>
 </div>
 </div>
 )
}
