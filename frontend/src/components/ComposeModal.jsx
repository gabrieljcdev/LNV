import { useState, useEffect, useRef } from 'react'
import { getUser, getUserId } from '../lib/auth'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const NUMBERING_OPTIONS = [
 { label: 'A1/A2/B1', value: 'vinyl' },
 { label: '1/2/3/4', value: 'numeric' },
 { label: 'A/B/C/D', value: 'side' },
]

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

function detectPlatform(url) {
 if (!url) return null
 return PLATFORMS.find(p => p.re.test(url)) || null
}
function extractDiscogsId(url) {
 const m = (url || '').match(/release\/(\d+)/)
 return m ? m[1] : null
}
function extractYTId(url) {
 if (!url) return null
 const m = url.match(/(?:v=|youtu\.be\/|embed\/)([^&\s?]{11})/)
 return m ? m[1] : null
}

const ARTIST_SPLIT_RE = /\s+(?:b2b|b-2-b|feat\.?|ft\.?|vs\.?|&|x)\s+|\s*,\s+|\s+\/\s+/gi
function splitArtists(str) {
 if (!str?.trim()) return []
 return str.split(ARTIST_SPLIT_RE).map(s => s.trim()).filter(Boolean).map(name => ({ name }))
}

function pillBtn(variant = 'outlined', extra = {}) {
 const base = { borderRadius: 20, padding: '5px 16px', fontFamily: 'VT323, monospace', fontSize: 13, letterSpacing: '0.04em', border: 'none', cursor: 'pointer', lineHeight: 1.4, ...extra }
 const v = {
 dark: { background: '#1e2126', color: '#fff' },
 orange: { background: '#e85d04', color: '#fff' },
 outlined: { border: '1.5px solid rgba(0,0,0,0.12)', background: 'transparent', color: '#6a7480' },
 pastel: { background: '#c8daf0', color: '#2a2d32' },
 active: { background: '#1e2126', color: '#fff' },
 muted: { border: '1.5px solid rgba(0,0,0,0.08)', background: 'transparent', color: '#b0b8c4' },
 }
 return { ...base, ...v[variant] }
}
function inputStyle(extra = {}) {
 return { borderRadius: 20, border: '1.5px solid rgba(0,0,0,0.10)', padding: '6px 14px', fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#3a3d42', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box', ...extra }
}
function Label({ children }) {
 return <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: '#b0b8c4', letterSpacing: 2, marginBottom: 5 }}>{children}</div>
}
function Divider() {
 return <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', margin: '12px 0' }} />
}
function PlatformChip({ platform, suffix = '' }) {
 if (!platform) return null
 return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: platform.color, color: platform.textColor, borderRadius: 20, padding: '2px 10px', fontFamily: 'VT323, monospace', fontSize: 10, letterSpacing: '0.04em' }}>{platform.icon} {platform.label}{suffix}</span>
}

export default function ComposeModal({ onClose, onPosted, initialUrl = '' }) {
 // No admin fallback: composing requires a real (password-less) username —
 // Feed.jsx only opens this modal when one is set, but guard here too in
 // case something else ever mounts it directly.
 const user = getUser()
 const userId = getUserId()

 const [inputUrl, setInputUrl] = useState(initialUrl)
 const [title, setTitle] = useState('')
 const [artist, setArtist] = useState('')
 const [artistsList, setArtistsList] = useState([])
 const [year, setYear] = useState('')
 const [label, setLabel] = useState('')
 const [catNo, setCatNo] = useState('')
 const [genres, setGenres] = useState([])
 const [tracks, setTracks] = useState([])
 const [comment, setComment] = useState('')
 const [numbering, setNumbering] = useState('vinyl')
 const [coverArt, setCoverArt] = useState('')
 const [postType, setPostType] = useState('album')
 const [streamUrl, setStreamUrl] = useState('')
 const [embedUrl, setEmbedUrl] = useState('')
 const [channel, setChannel] = useState('')
 const [fetching, setFetching] = useState(false)
 const [fetchStatus, setFetchStatus] = useState('')
 const [fetchError, setFetchError] = useState('')
 const [fetchSource, setFetchSource] = useState(null)
 const [duplicate, setDuplicate] = useState(null)
 const [posting, setPosting] = useState(false)
 const [done, setDone] = useState(false)
 const [discogsVideos, setDiscogsVideos] = useState([])
 const [allReleases, setAllReleases] = useState(null)

 const inputRef = useRef(null)
 const activePlatform = detectPlatform(inputUrl)
 const isDiscogs = activePlatform?.id === 'discogs'
 const isLiveMix = postType === 'livemix'

 useEffect(() => { if (initialUrl && detectPlatform(initialUrl)) handleFetch() }, []) // eslint-disable-line
 useEffect(() => {
 const h = e => { if (e.key === 'Escape') onClose() }
 window.addEventListener('keydown', h)
 return () => window.removeEventListener('keydown', h)
 }, [onClose])

 function clearForm() {
 setTitle(''); setArtist(''); setArtistsList([]); setYear(''); setLabel(''); setCatNo('')
 setGenres([]); setTracks([]); setCoverArt(''); setStreamUrl(''); setEmbedUrl(''); setChannel('')
 setFetchSource(null); setAllReleases(null); setDiscogsVideos([])
 }

 function applyEnrichment(data) {
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
 setFetchSource(data.source || 'platform')
 }

 function applyRelease(rel) {
 const cleanTitle = rel.release_title?.includes(' - ') ? rel.release_title.split(' - ').slice(1).join(' - ') : (rel.release_title || '')
 if (cleanTitle) setTitle(cleanTitle)
 if (rel.label) setLabel(rel.label)
 if (rel.catNo) setCatNo(rel.catNo)
 if (rel.year) setYear(String(rel.year))
 if (rel.cover_image) setCoverArt(rel.cover_image)
 if (rel.genres?.length) setGenres(rel.genres.slice(0, 6))
 if (rel.tracks?.length) {
 const mapped = rel.tracks.map(t => ({ ...t, stream_url: '' }))
 setTracks(mapped)
 setPostType(rel.tracks.length >= 6 ? 'album' : rel.tracks.length <= 2 ? 'single' : 'album')
 if (rel.videos?.length) { setDiscogsVideos(rel.videos); backgroundYTSearch(mapped, artist, rel.label, rel.catNo) }
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
 if (!platform) { setFetchError('UNRECOGNISED PLATFORM — SUPPORTED: DISCOGS · YOUTUBE · SPOTIFY · SOUNDCLOUD · BANDCAMP · MIXCLOUD · DEEZER · APPLE MUSIC · BEATPORT · TIDAL · RA · BOILER ROOM'); return }

 if (platform.id === 'discogs') {
 const id = extractDiscogsId(url)
 if (!id) { setFetchError('NOT A VALID DISCOGS RELEASE URL — MUST CONTAIN /release/'); return }
 setFetching(true); setFetchStatus('CHECKING DATABASE...')
 try {
 const dupRes = await fetch(`${API}/posts?discogs_id=${id}`)
 if (dupRes.ok) { const dd = await dupRes.json(); const dp = Array.isArray(dd) ? dd : dd.posts; if (dp?.length > 0) { setDuplicate(dp[0]); setFetching(false); setFetchStatus(''); return } }
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
 setTitle(cleanTitle); setArtist(fArtist); setLabel(fLabel); setCatNo(fCatno); setYear(String(data.year || ''))
 setCoverArt(data.coverImage || data.thumbImage || '')
 setDiscogsVideos(data.videos || [])
 setGenres([...(data.genres || []), ...(data.styles || [])].slice(0, 6))
 setFetchSource('discogs'); setStreamUrl(url)
 const discogsArtists = data.artists?.map(a => ({ name: a.name })) || splitArtists(fArtist)
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
 return { position: t.position, title: t.title, stream_url: ytUrl || '' }
 })
 setTracks(rawTracks)
 const ytCount = rawTracks.filter(t => t.stream_url).length
 const missing = rawTracks.filter(t => !t.stream_url)
 setFetchStatus(`✓ FETCHED · ${rawTracks.length} TRACKS · ${ytCount} YT LINKS${missing.length ? ` · SEARCHING ${missing.length} MORE...` : ''}`)
 if (missing.length > 0 && fArtist) backgroundYTSearch(rawTracks, fArtist, fLabel, fCatno)
 } catch (err) { setFetchError(`FETCH FAILED — ${err.message}`) } finally { setFetching(false) }
 return
 }

 setFetching(true); setFetchStatus(`FETCHING FROM ${platform.label}...`)
 try {
 const res = await fetch(`${API}/media/resolve?url=${encodeURIComponent(url)}`)
 if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Resolver returned ${res.status}`) }
 const data = await res.json()
 applyEnrichment(data)
 const src = data.source === 'discogs' ? ' → DISCOGS MATCH' : ''
 if (data.warning) { setFetchStatus(`⚠ ${data.warning}`); return }
 const tCount = data.tracks?.length || 0
 const lCount = data.tracks?.filter(t => t.stream_url).length || 0
 if (data.detected_type === 'livemix') { setFetchStatus(`✓ ${platform.label}${src} · LIVE SET DETECTED`) }
 else if (tCount > 0) {
 setFetchStatus(`✓ ${platform.label}${src} · ${tCount} TRACKS · ${lCount} LINKS`)
 if (data.source === 'discogs' && data.artist) { const missing = data.tracks.filter(t => !t.stream_url); if (missing.length) backgroundYTSearch(data.tracks, data.artist, data.label, data.catNo) }
 } else { setFetchStatus(`✓ ${platform.label}${src} · TITLE & ARTIST PRE-FILLED`) }
 } catch (err) { setFetchError(`${platform.label} FETCH FAILED — ${err.message}`) }
 finally { setFetching(false) }
 }

 function backgroundYTSearch(initial, fArtist, fLabel, fCatno) {
 const videos = discogsVideos
 if (!videos.length) return
 ;(async () => {
 const normalize = s => (s || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
 const updated = [...initial]
 for (let i = 0; i < updated.length; i++) {
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
 if (videoId) { const ytUrl = `https://www.youtube.com/watch?v=${videoId}`; updated[i] = { ...updated[i], stream_url: ytUrl }; setTracks([...updated]) }
 }
 }
 const found = updated.filter(t => t.stream_url).length
 setFetchStatus(`✓ FETCHED · ${updated.length} TRACKS · ${found} LINKS FOUND`)
 })()
 }

 function updateTrackUrl(i, url) { setTracks(prev => prev.map((t, idx) => idx === i ? { ...t, stream_url: url } : t)) }
 function removeGenre(g) { setGenres(prev => prev.filter(x => x !== g)) }
 function addGenre(g) { const t = g.trim(); if (t && !genres.includes(t)) setGenres(prev => [...prev, t]) }

 async function handlePost() {
 if (!title.trim()) return
 setPosting(true); setFetchError('')
 const artistsForDB = artistsList.length ? artistsList : splitArtists(artist)
 try {
 const postRes = await fetch(`${API}/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, username: user, discogs_url: isDiscogs ? inputUrl : '', stream_url: streamUrl || inputUrl, embed_url: embedUrl || '', channel: channel || '', platform: activePlatform?.id || '', post_type: postType, title: title.trim(), artists: artistsForDB, labels: label.trim() ? [{ name: label.trim(), catno: catNo.trim() }] : [], year: year ? parseInt(year) : null, cover_image: coverArt, genres, tracks, body: comment.trim(), notes: comment.trim() }) })
 if (!postRes.ok) throw new Error(`POST failed: ${postRes.status}`)
 const saved = await postRes.json()
 const savedPostId = saved.id || saved.postId
 setDone(true)
 setTimeout(() => { onPosted?.({ postId: savedPostId }); onClose() }, 800)
 } catch (err) { setFetchError(`FAILED TO POST — ${err.message}`) } finally { setPosting(false) }
 }

 const hasFetched = !!title
 const fetchBtnStyle = activePlatform && !isDiscogs
 ? { ...pillBtn('dark', { flexShrink: 0 }), background: activePlatform.color, color: activePlatform.textColor, opacity: fetching ? 0.6 : 1 }
 : { ...pillBtn('orange'), opacity: fetching ? 0.6 : 1, flexShrink: 0 }

 if (!user || !userId) {
 return (
 <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(30,33,38,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}>
 <div style={{ width: 340, background: '#fff', borderRadius: 16, padding: '24px 22px', textAlign: 'center', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
 <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 15, color: '#1e2126', marginBottom: 8 }}>PICK A USERNAME FIRST</div>
 <div style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#8a929c', marginBottom: 16, lineHeight: 1.5 }}>Posting is attributed to a username — no password, just pick one to continue.</div>
 <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
 <button style={pillBtn('outlined')} onClick={onClose}>CANCEL</button>
 <a href="/login" style={{ textDecoration: 'none' }}><button style={pillBtn('orange')}>CHOOSE USERNAME</button></a>
 </div>
 </div>
 </div>
 )
 }

 return (
 <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(30,33,38,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}>
 <div style={{ width: 560, maxHeight: '88vh', background: '#fff', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>

 <div style={{ background: '#1e2126', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
 <span style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 15, color: '#fff' }}>NEW POST</span>
 {activePlatform && <span style={{ background: activePlatform.color, color: activePlatform.textColor, borderRadius: 4, padding: '1px 7px', fontFamily: 'VT323, monospace', fontSize: 10 }}>{activePlatform.icon} {activePlatform.label}</span>}
 </div>
 <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
 </div>

 <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
 <Label>PASTE ANY MUSIC LINK</Label>
 <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
 <input ref={inputRef} value={inputUrl} onChange={e => setInputUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleFetch()} placeholder="Discogs · YouTube · Spotify · SoundCloud · Bandcamp · Mixcloud · Deezer · Apple Music · Beatport · Tidal · RA · Boiler Room" style={{ ...inputStyle(), flex: 1, fontSize: 11 }} />
 <button onClick={handleFetch} disabled={fetching} style={fetchBtnStyle}>{fetching ? (fetchStatus || 'FETCHING...') : (activePlatform ? `${activePlatform.icon} FETCH` : 'FETCH ▶')}</button>
 </div>

 {!inputUrl && (
 <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
 {PLATFORMS.map(p => <span key={p.id} style={{ background: p.color + '1a', color: p.color, border: `1px solid ${p.color}44`, borderRadius: 20, padding: '1px 8px', fontFamily: 'VT323, monospace', fontSize: 10, letterSpacing: '0.04em' }}>{p.icon} {p.label}</span>)}
 </div>
 )}

 {fetchStatus && !fetching && <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: '#7aa8d8', marginBottom: 6 }}>{fetchStatus}</div>}
 {fetchError && <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: '#e85d04', marginBottom: 6 }}>{fetchError}</div>}

 {hasFetched && !fetching && (
 <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
 {activePlatform && <PlatformChip platform={activePlatform} />}
 {fetchSource === 'discogs' && <span style={{ ...pillBtn('dark'), fontSize: 10, padding: '2px 10px' }}>◈ DISCOGS MATCH</span>}
 {fetchSource === 'platform' && <span style={{ ...pillBtn('muted'), fontSize: 10, padding: '2px 10px' }}>PLATFORM DATA ONLY</span>}
 {artistsList.length > 1 && <span style={{ ...pillBtn('pastel'), fontSize: 10, padding: '2px 10px' }}>{artistsList.length} ARTISTS SPLIT</span>}
 </div>
 )}

 {allReleases && allReleases.length > 1 && (
 <div style={{ background: 'rgba(232,93,4,0.05)', border: '1.5px solid rgba(232,93,4,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
 <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: '#e85d04', letterSpacing: 1, marginBottom: 8 }}>◈ MULTIPLE RELEASES FOUND — PICK ONE</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
 {allReleases.map((rel, i) => {
 const isAlbum = rel.format?.some(f => /album/i.test(f))
 const relTitle = rel.release_title?.includes(' - ') ? rel.release_title.split(' - ').slice(1).join(' - ') : (rel.release_title || '')
 return (
 <div key={rel.discogs_id || i} onClick={() => applyRelease(rel)}
 style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 6, cursor: 'pointer', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}
 onMouseEnter={e => e.currentTarget.style.borderColor = '#e85d04'}
 onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'}
 >
 {rel.cover_image ? <img src={rel.cover_image} style={{ width: 36, height: 36, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} alt="" /> : <div style={{ width: 36, height: 36, borderRadius: 3, background: '#eee', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 16 }}>◈</div>}
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 12, fontWeight: 700, color: '#1e2126', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{relTitle}</div>
 <div style={{ fontFamily: 'VT323, monospace', fontSize: 10, color: '#999', marginTop: 1 }}>{[rel.label, rel.catNo, rel.year, rel.country].filter(Boolean).join(' · ')}</div>
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
 <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: isAlbum ? '#4a90d9' : '#888', color: '#fff', fontFamily: 'VT323, monospace' }}>{isAlbum ? 'ALBUM' : 'SINGLE'}</span>
 <span style={{ fontSize: 9, color: '#bbb', fontFamily: 'VT323, monospace' }}>{rel.tracks?.length || 0} tracks</span>
 </div>
 </div>
 )
 })}
 </div>
 </div>
 )}

 {duplicate && (
 <div style={{ background: '#fff8f0', border: '1.5px solid #e85d04', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
 <div style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#e85d04', marginBottom: 4 }}>⚠ ALREADY POSTED</div>
 <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#3a3d42', marginBottom: 8 }}><strong>{duplicate.title?.toUpperCase()}</strong> — posted by @{duplicate.username || 'lnv_admin'}</div>
 <div style={{ display: 'flex', gap: 6 }}>
 <button style={pillBtn('outlined')} onClick={onClose}>CLOSE</button>
 <button style={pillBtn('dark')} onClick={() => setDuplicate(null)}>POST ANYWAY</button>
 </div>
 </div>
 )}

 {!hasFetched && !fetchError && (
 <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: '#b0b8c4', marginBottom: 12, lineHeight: 1.6 }}>
 ⚠ PASTE ANY MUSIC LINK ABOVE TO AUTO-FILL<br />
 DISCOGS → FULL RELEASE DATA · TRACKLIST · YOUTUBE LINKS<br />
 SPOTIFY · DEEZER · APPLE MUSIC → TRACKS + METADATA<br />
 YOUTUBE · SOUNDCLOUD · MIXCLOUD → STREAM + TYPE DETECTION<br />
 BANDCAMP · BEATPORT → TITLE + ARTIST<br />
 RA · BOILER ROOM → AUTO-SET AS LIVE MIX<br />
 ALL PLATFORMS → DISCOGS REVERSE LOOKUP ATTEMPTED
 </div>
 )}

 {hasFetched && (
 <>
 <Divider />
 <div style={{ marginBottom: 12 }}>
 <Label>POST TYPE</Label>
 <div style={{ display: 'flex', gap: 6 }}>
 {POST_TYPES.map(pt => <button key={pt.value} onClick={() => setPostType(pt.value)} style={{ ...pillBtn(postType === pt.value ? 'dark' : 'outlined'), ...(postType === pt.value && pt.value === 'livemix' ? { background: '#e85d04' } : {}) }}>{pt.value === 'livemix' ? '◉ ' : ''}{pt.label}</button>)}
 </div>
 </div>

 {isLiveMix && (
 <div style={{ background: 'rgba(232,93,4,0.05)', border: '1.5px solid rgba(232,93,4,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
 <div style={{ display: 'flex', gap: 8 }}>
 <div style={{ flex: 1 }}><Label>CHANNEL / VENUE</Label><input value={channel} onChange={e => setChannel(e.target.value)} placeholder="HÖR, Boiler Room, Fabric, RA…" style={inputStyle()} /></div>
 <div style={{ flex: 2 }}><Label>STREAM URL</Label><input value={streamUrl} onChange={e => setStreamUrl(e.target.value)} placeholder="YouTube, SoundCloud, Mixcloud…" style={inputStyle()} /></div>
 </div>
 </div>
 )}

 <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
 <div style={{ width: 80, height: 80, borderRadius: 6, flexShrink: 0, background: coverArt ? 'transparent' : 'linear-gradient(135deg,#2a2d32,#1e2126)', overflow: 'hidden', position: 'relative' }}>
 {coverArt ? <img src={coverArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 28 }}>{isLiveMix ? '◉' : '◈'}</div>}
 {activePlatform && <span style={{ position: 'absolute', bottom: 3, right: 3, background: activePlatform.color, color: activePlatform.textColor, borderRadius: 3, padding: '1px 4px', fontFamily: 'VT323, monospace', fontSize: 9 }}>{activePlatform.icon}</span>}
 </div>
 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
 <div style={{ display: 'flex', gap: 6 }}>
 <div style={{ flex: 2 }}><Label>TITLE</Label><input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle()} /></div>
 <div style={{ flex: 1 }}><Label>YEAR</Label><input value={year} onChange={e => setYear(e.target.value)} style={inputStyle()} /></div>
 </div>
 <div>
 <Label>ARTIST{artistsList.length > 1 ? ` (${artistsList.length})` : ''}</Label>
 <input value={artist} onChange={e => { setArtist(e.target.value); setArtistsList(splitArtists(e.target.value)) }} style={inputStyle()} />
 {artistsList.length > 1 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>{artistsList.map((a, i) => <span key={i} style={{ ...pillBtn('pastel'), fontSize: 10, padding: '1px 8px' }}>{a.name}</span>)}</div>}
 </div>
 </div>
 </div>

 {!isLiveMix && (
 <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
 <div style={{ flex: 2 }}><Label>LABEL</Label><input value={label} onChange={e => setLabel(e.target.value)} style={inputStyle()} /></div>
 <div style={{ flex: 1 }}><Label>CAT NO</Label><input value={catNo} onChange={e => setCatNo(e.target.value)} style={inputStyle()} /></div>
 </div>
 )}

 <div style={{ marginBottom: 12 }}>
 <Label>GENRES</Label>
 <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
 {genres.map(g => <span key={g} onClick={() => removeGenre(g)} style={{ ...pillBtn('pastel'), cursor: 'pointer', fontSize: 11 }} title="Click to remove">{g} ×</span>)}
 </div>
 <input placeholder="Add genre and press Enter…" onKeyDown={e => { if (e.key === 'Enter') { addGenre(e.target.value); e.target.value = '' } }} style={{ ...inputStyle(), fontSize: 11 }} />
 </div>

 {!isLiveMix && (
 <>
 <Divider />
 <div style={{ marginBottom: 8 }}>
 <Label>TRACK NUMBERING</Label>
 <div style={{ display: 'flex', gap: 6 }}>
 {NUMBERING_OPTIONS.map(o => <button key={o.value} onClick={() => setNumbering(o.value)} style={pillBtn(numbering === o.value ? 'dark' : 'outlined')}>{o.label}</button>)}
 </div>
 </div>
 {tracks.length > 0 && (
 <div style={{ marginBottom: 12 }}>
 <Label>TRACKLIST</Label>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
 {tracks.map((t, i) => {
 const tPlatform = detectPlatform(t.stream_url)
 return (
 <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
 <span style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#b0b8c4', width: 28, flexShrink: 0 }}>{numbering === 'numeric' ? i + 1 : numbering === 'side' ? String.fromCharCode(65 + i) : t.position || i + 1}</span>
 <span style={{ fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#3a3d42', flex: 1 }}>{t.title}</span>
 <input value={t.stream_url} onChange={e => updateTrackUrl(i, e.target.value)} placeholder="Stream URL…" style={inputStyle({ width: 160, flexShrink: 0, fontSize: 11 })} />
 {t.stream_url && <span style={{ background: tPlatform?.color || '#e85d04', color: tPlatform?.textColor || '#fff', borderRadius: 20, padding: '2px 8px', fontFamily: 'VT323, monospace', fontSize: 10, flexShrink: 0 }}>{tPlatform?.icon || '▶'}</span>}
 </div>
 )
 })}
 </div>
 </div>
 )}
 </>
 )}

 <Divider />
 <div style={{ marginBottom: 4 }}>
 <Label>{isLiveMix ? 'NOTES / LINEUP' : 'COMMENT / NOTES'}</Label>
 <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder={isLiveMix ? 'Lineup, venue, date, set notes…' : 'What makes this record special…'} rows={3} style={inputStyle({ borderRadius: 10, resize: 'vertical', lineHeight: 1.5 })} />
 </div>
 </>
 )}

 {!hasFetched && (
 <div style={{ marginBottom: 8 }}>
 <Label>OR ENTER A TITLE MANUALLY</Label>
 <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Record title…" style={inputStyle()} />
 </div>
 )}
 </div>

 <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(0,0,0,0.07)', flexShrink: 0, background: '#fafbfc' }}>
 {done ? (
 <div style={{ textAlign: 'center', fontFamily: 'VT323, monospace', fontSize: 16, color: '#e85d04' }}>✓ POSTED TO BOARD</div>
 ) : (
 <button onClick={handlePost} disabled={!title.trim() || posting || !!duplicate} style={{ ...pillBtn('orange', { width: '100%', textAlign: 'center', fontSize: 14, padding: '10px 0' }), opacity: (!title.trim() || posting || !!duplicate) ? 0.5 : 1 }}>{posting ? 'POSTING...' : 'POST TO BOARD ▶'}</button>
 )}
 {!title.trim() && <div style={{ textAlign: 'center', fontFamily: 'VT323, monospace', fontSize: 10, color: '#b0b8c4', marginTop: 6 }}>FETCH A LINK OR ENTER A TITLE TO POST</div>}
 </div>

 </div>
 </div>
 )
}
