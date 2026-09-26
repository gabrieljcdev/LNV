import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLayout } from '../context/LayoutContext'
import ComposeModal from './ComposeModal'
import Clock from './Clock'
import { RAIL_WIDTH, STRIP_OPEN_WIDTH } from './Strip'
import { getUserId, isAdmin } from '../lib/auth'
import { PALETTES, getAutoIndex, applyPalette } from '../services/themeService'
import { SPECTRUM_START, spectrumBg } from '../services/postSpectrum'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// PLATE CARD (2026-08-22) — reworked from gabriel's own sketch: a numbered
// plate instead of a wordmark-scale artist name, tracklist/description as
// their own hairline-divided zones, art framed on a solid mat instead of
// bleeding to the card edges. Fixed card widths — no hover/open resize
// states. Spotlights use the same standard width so they read as "one of
// these cards," not a special size.
//
// 2026-08-22 (designer pass): gabriel tuned these in the Plate Card Designer
// artifact and asked for one set of numbers across both card types — so
// livemix no longer gets extra width or a wider rail. Album/single and live
// set are now dimensionally identical; only their zone CONTENT differs
// (tracklist vs. channel, art vs. embed).
// ── Card design ───────────────────────────────────────────────────────────────
// Pasted from the Plate Card Designer artifact's JSON export
// (https://claude.ai/code/artifact/87c62e7f-3ba5-4ff7-92b7-dca51d524539).
//
// FREE-FORM LAYOUT. Every box is absolutely positioned inside its column:
// <box>Col picks the column, <box>X / <box>Y place it, <box>W sets its width.
// Nothing flows, so nothing pushes anything else. The nine boxes are
// plate, track, desc, comments, pills, replies, stamp, mat and caption.
//
// DESIGN_BASE is the shared baseline; DESIGN_VARIANTS holds per-slot overrides
// keyed `v<way>:<type>`, so "v2:live" is way 3's live-set design. Each post
// resolves to base overlaid with its slot.
//
// To take a new export: replace the two objects below verbatim and set
// ROTATION to the export's "rotation". Nothing else should need touching.
//
// 2026-08-28: gabriel — only 2 ways now (top plate / bottom plate, both
// media-right). The mediaSide:'left' mirrors (the old v2/v3) are gone, not
// just unreachable — this is the permanent design, not a placeholder.
const ROTATION = 2

// 2026-08-28 (Task B): the rail went from nine absolutely-positioned boxes
// (each pinned to a worst-case Y so nothing could ever collide) to a plain
// flex column — content sizes itself now, and a single flex:1 spacer
// absorbs whatever's left over, instead of every zone reserving its own
// worst-case slack and leaving a mismatched dead gap behind whatever a
// particular card's content didn't use (see the 2026-08-28 "gap between
// info" report — this is the actual fix for that, not a patch to the old
// Y numbers). DESIGN_BASE is now just shared type/spacing tokens; the
// per-way table (DESIGN_VARIANTS, below) is down to three switches:
// mediaSide, plateAlign, and plateBottom (was it plate-top or plate-bottom).
//
// The old PLATE_TOP / PLATE_BOTTOM / LIVE Y-coordinate tables, the box()
// absolute-positioning helper, and the *Col/*X/*Y/*W fields they fed are
// gone — nothing else in this repo imports them (checked before deleting:
// only Feed.jsx itself ever referenced DESIGN_VARIANTS / PLATE_TOP /
// PLATE_BOTTOM / designFor). The standalone card-designer artifacts
// referenced elsewhere in this file's history (Plate Card Designer, Post
// Card / Live Set Rail Editor) are separate published Claude Artifacts,
// not part of this codebase, so they're unaffected either way.
const DESIGN_BASE = {
  mediaSide: 'right',
  cardW: 800, cardH: 820, cardRadius: 0, infoW: 280,
  railBorder: 1,

  // ── plate ──────────────────────────────────────────────────────────────
  badgeSize: 9, badgeWeight: 600, badgeLs: 0.16, badgePy: 4, badgePx: 7,
  badgeRadius: 3,
  artistFf: "'Barlow',sans-serif", artistSize: 30, artistWeight: 700,
  artistLh: 1.02, artistLs: -0.022, artistCase: 'none', artistMt: 15,
  titleSize: 30, titleLh: 1.02, titleLs: -0.022,
  metalineSize: 11, metalineLh: 1.45, metalineLs: 0.09, metalineMt: 11,
  numeralFf: "'Barlow',sans-serif", numeralSize: 180, numeralWeight: 900,
  numeralLh: 0.78, numeralLs: -0.055, numeralOpacity: 0.22,
  numeralMargin: '4px 0 0 -8px', numeralColor: '#111111',

  // ── rules — standalone dividers between flow groups now, not borders on
  // absolutely-placed boxes (see PostCard's railChildren) ─────────────────
  ruleMy: 15, ruleSolidMy: 10,

  // ── tracklist ─────────────────────────────────────────────────────────
  trackSize: 13, trackTitleW: 100, trackGap: 10, trackRowpad: 3.5,
  tracknumSize: 10, trackMoreSize: 11,
  zlabelSize: 9, zlabelLs: 0.2, zlabelMb: 8,

  // ── description (media column) ──────────────────────────────────────
  descSize: 13, descLh: 1.5, descMt: 14, descMtTop: 0,

  // ── byline (rail footer — replies count + handle + stamp, one row) ────
  bylineMt: 14, handleSize: 11.5, handleWeight: 600,
  stampSize: 10, stampLs: 0.08,

  // ── genre pills / replies button — not part of the v2 typography pass;
  // kept at their existing sizes (gabriel: keep both, just re-flowed into
  // the tracklist group and the byline row respectively) ─────────────────
  pillSize: 11, pillPy: 3, pillPx: 10, pillRadius: 99, pillGap: 4,
  metarowSize: 11,

  labelFf: "'Barlow',sans-serif", // was VT323 — badges/zone-labels are Barlow now
  bodyFf: "'Barlow',sans-serif",
  monoFf: "'IBM Plex Mono',monospace", // was VT323 for stamp/track-meta — see index.css import

  // ── media column ─────────────────────────────────────────────────────
  padY: 32, bandPadX: 32, // padY was 120; 2026-09-26 the card itself is trimmed by FLOAT_INSET_Y top/bottom instead (FloatSlot), so content still starts 120px down
  artSize: 390, artRadius: 40, // artSize: 390 per gabriel 2026-09-26 — one size for single AND album cards (was 330 earlier the same day, 396 = 344*1.15 on 2026-08-29); artRadius: KEEP AT 40 per gabriel
  artOffsetY: 0, artOffsetX: 0, artMbBottom: -21, artMtTop: 40, // artMbBottom: -21 per gabriel 2026-08-29 (art top flush with rail artist-name top, not container bottom — see round 9 note below)
  artShadowY: 0, artShadowB: 0, artShadowA: 0,
  captionMt: 11, captionMtBottom: 0, captionMtTop: 16, captionMaxW: 344, captionSize: 12, captionLh: 1.5, // captionMtBottom: 0 per gabriel 2026-08-29 (desc/caption flush in bottom-plate stack)
  captionNameSize: 13.5, captionNameWeight: 700,
  catSize: 10, catLs: 0.1, catMt: 6,
  captionColor: '#2b4553', captionNameColor: '#102430',

  embedWellW: 496, embedWellH: 279, embedInnerW: 456, embedInnerH: 257,
  embedPreset: 'soundcloud', embedW: 560, embedH: 315,

  matFill: 'none', matColor: '#cfe3f0', matRadius: 0, matPad: 0, // matFill: DO NOT TOUCH

  cmPy: 8, cmPx: 16, cmSize: 12,

  // The export also carried cBg / cPri / cSec / cTer / cAccent / cLine, and
  // still carries numeralColor / captionColor / captionNameColor as literal
  // hex. Same as before 2026-08-26: DELIBERATELY NOT APPLIED — the palette
  // system owns text/background/accent/border through --theme-* custom
  // properties, hardcoding these would break the theme picker and the auto
  // clock palette. PostCard reads --theme-* tokens directly instead; these
  // fields are left in place as inert legacy values, not wired to anything.
}

// Two mirrored halves, same idea as before Task B: mediaSide/plateAlign
// flip the card left/right, plateBottom flips whether the rail reads
// plate-then-tracklist-then-byline (top) or byline-then-plate-then-tracklist
// (bottom) — see PostCard's railChildren for how that flag actually
// reorders the flow. Live sets keep the plate at the top on all four ways,
// same as before this rework; cardW:900 (vs DESIGN_BASE's 800) stays
// live-only, same mechanism as before (designFor only merges a live-set
// slot in for isLiveMix posts).
const DESIGN_VARIANTS = {
  // Only 2 ways: v0 is the top plate, v1 was the bottom plate — both
  // media-right. See the 2026-08-28 note by ROTATION.
  // 2026-09-26 (gabriel): the inverted bottom-plate card is retired — every
  // regular post card uses the standard (top-plate) orientation. The
  // "lower orientation" numeral now lives on AlbumCard instead. The
  // plateBottom code paths stay in PostCard, just unused.
  'v0:album': { mediaSide: 'right', plateAlign: 'right', plateBottom: false },
  'v1:album': { mediaSide: 'right', plateAlign: 'right', plateBottom: false },

  'v0:live': { mediaSide: 'right', plateAlign: 'right', plateBottom: false, cardW: 900, padY: 40 },
  'v1:live': { mediaSide: 'right', plateAlign: 'right', plateBottom: false, cardW: 900, padY: 40 },
}

// idx is the post's position in the feed, so consecutive posts step through
// the rotation. ROTATION 2 uses ways 1-2 only; raise it to 4 to bring the
// other two in (they flip mediaSide, which puts two media columns next to
// each other at the seam between cards -- check that before switching).
// ROTATION itself is unchanged by Task B, per gabriel.
function designFor(idx, isLiveMix) {
  const way = ((idx % ROTATION) + ROTATION) % ROTATION
  const slot = 'v' + way + ':' + (isLiveMix ? 'live' : 'album')
  return Object.assign({}, DESIGN_BASE, DESIGN_VARIANTS[slot] || {})
}

// Spotlights are now purely client-side (see buildSpotlightPool /
// buildShelfItems below) — not DB-persisted posts. SPOTLIGHT_EVERY sets
// feed-position cadence (every Nth real post gets a spotlight after it);
// SPOTLIGHT_MIN_POSTS is how many posts a subject needs in the currently
// loaded feed to be spotlight-eligible (below this the recent-adds list /
// collage look sparse).
const SPOTLIGHT_EVERY = 5
const SPOTLIGHT_MIN_POSTS = 3


// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(d) {
  if (!d) return ''
  const s = (Date.now() - new Date(d)) / 1000
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function cleanNote(t)  { return (t || '').replace(/https?:\/\/\S+/g, '').trim() }
function artistName(p) { return p.artists?.[0]?.artist_name || p.artists?.[0]?.name || p.artist_name || '' }
// Discogs' compilation credit, not an individual artist: shown on the post,
// but never an artist spotlight or an artist-drawer link.
const isVariousArtist = name => /^various( artists)?$/i.test((name || '').trim())
function labelName(p)  { return p.labels?.[0]?.label_name  || p.labels?.[0]?.name  || p.label_name  || '' }
function channelName(p){ return p.channel || '' }
function coverSrc(p)   { return p.cover_image || p.coverImage || p.thumb_image || p.thumbImage || p.cover_art || '' }

// 2026-08-26: pulled out of PostCard's inline embed derivation (same
// regexes, same platform priority: YouTube > SoundCloud > Mixcloud) so
// SpotlightCard's new artist/channel post-grid can turn a post's stream
// URL into an embeddable src too, without duplicating slightly-different
// logic. PostCard's own inline version is untouched — this is additive,
// not a refactor of already-shipped, already-tested code.
function postStreamUrl(p) {
  return p.stream_url || p.embed_url || p.tracks?.[0]?.youtube_url || p.tracks?.[0]?.stream_url || ''
}
// ── TrackPlayer (2026-09-25) ─────────────────────────────────────────────────
// An embed iframe that can say when its track has finished, so an album
// plays through. YouTube only — via the official IFrame Player API
// (loaded once, on first use), attached to our own iframe (enablejsapi=1),
// which needs no DOM swap. Other platforms render as a plain iframe:
// SoundCloud's widget API could do the same later; Bandcamp's embed gives no
// end signal. The player is never destroy()ed here — React owns the iframe
// and removes it itself (destroy() would pull it out from under React).
let ytApiPromise = null
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!ytApiPromise) {
    ytApiPromise = new Promise(resolve => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
    })
  }
  return ytApiPromise
}
function TrackPlayer({ src, onEnded, title, autoplay = false }) {
  const ref = useRef(null)
  const endedRef = useRef(onEnded)
  useEffect(() => { endedRef.current = onEnded })
  const isYT = /youtube\.com\/embed\//.test(src)
  const finalSrc = isYT
    ? `${src}${src.includes('?') ? '&' : '?'}enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}${autoplay ? '&autoplay=1' : ''}`
    : src
  useEffect(() => {
    if (!isYT) return
    let cancelled = false
    loadYouTubeApi().then(YT => {
      if (cancelled || !ref.current) return
      new YT.Player(ref.current, {
        events: { onStateChange: e => { if (e.data === YT.PlayerState.ENDED) endedRef.current?.() } },
      })
    })
    return () => { cancelled = true }
  }, [finalSrc, isYT])
  return (
    <iframe ref={ref} src={finalSrc}
      style={{ width: '100%', height: '100%', border: 'none' }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen title={title} />
  )
}

function toEmbedSrc(streamUrl) {
  if (!streamUrl) return null
  const ytMatch = streamUrl.match(/(?:v=|youtu\.be\/|embed\/)([^&\s?]{11})/)
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1&color=white`
  if (/soundcloud\.com/i.test(streamUrl)) return `https://w.soundcloud.com/player/?url=${encodeURIComponent(streamUrl)}&color=%23e85d04&auto_play=false&hide_related=true&show_comments=false&show_user=true`
  if (/mixcloud\.com/i.test(streamUrl)) return `https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(streamUrl.replace('https://www.mixcloud.com',''))}`
  return null
}

function detectType(p) {
  if (p.post_type) return p.post_type
  const f = (p.format || '').toLowerCase()
  if (f.includes('video') || f.includes('mix') || p.is_live_mix) return 'livemix'
  const tl = p.tracks?.length || 0
  if (f.includes('single') || f.includes('7"') || (f.includes('ep') && tl <= 4)) return 'single'
  return 'album'
}

const PLATFORM_COLORS = {
  youtube: '#f00', soundcloud: '#f50', bandcamp: '#1da0c3',
  spotify: '#1db954', mixcloud: '#5000ff', deezer: '#a238ff',
  applemusic: '#fc3c44', tidal: '#000', beatport: '#01ff95',
  ra: '#f03', boilerroom: '#111', discogs: '#333',
}

// URL -> platform id, so the platform badge can name (and link to) whatever
// is actually playing rather than only the post's original platform.
const URL_PLATFORMS = [
  ['youtube', /youtube\.com|youtu\.be/i], ['soundcloud', /soundcloud\.com/i],
  ['bandcamp', /bandcamp\.com/i], ['mixcloud', /mixcloud\.com/i],
  ['spotify', /spotify\.com/i], ['deezer', /deezer\.com/i],
  ['applemusic', /music\.apple\.com/i], ['tidal', /tidal\.com/i],
  ['beatport', /beatport\.com/i], ['discogs', /discogs\.com/i],
]
const platformOfUrl = url => URL_PLATFORMS.find(([, re]) => re.test(url || ''))?.[0] || null

const POST_BG_CYCLE = ['dark1','dark2','dark3','dark1','dark2','light1','dark3','dark1','dark2','dark3','light1','dark1','dark2']

// ── Feed meter ────────────────────────────────────────────────────────────────
// One flat gap between every neighbour in the shelf — intro, posts and
// spotlights alike. The first pass (2026-08-28, Task A) graded this by what
// sat either side (50/100/200 — "a bigger gap means new section") but
// gabriel flagged it as reading inconsistent rather than legible once it
// was actually on screen, so it's back to one number. U stays as the meter
// unit — card widths are still multiples of it (800 = 8U, 900 = 9U).
const U = 100
// Floating cards (2026-09-26, gabriel): cards stay full size ("don't reduce
// any size") but read as separate objects moving over a surface — rounded
// corners and a deep layered shadow on each card, FLOAT_GAP of surface
// between them, over the feed surface (FEED_SURFACE). Replaces full-height
// cards joined by two-tone seams (FeedGap).
const FLOAT_GAP = 28   // was 56; halved per gabriel 2026-09-26
const FLOAT_RADIUS = 14
// Cards are trimmed top and bottom by this much (the space shows the
// underlay + shadow). With padY 32 inside the card, content sits where the
// old 120px padding put it: 88 + 32 = 120.
// 58 (was 88): every card got the album card's height, gabriel 2026-09-26 —
// the album needs it so its 390px sleeve and the big number under the title
// fit on a 900px-tall screen; all cards now share that height.
// 58: cards clear the search bar (top 16 + 30 tall = 46, plus 12px), same
// space at the bottom — gabriel 2026-09-26. Also exactly what the album
// card needs for its 390px sleeve + big numeral on a 900px-tall screen.
// (Briefly 14 = two dot steps taller, which ran cards under the search bar.)
const FEED_DOT = 22
const FLOAT_INSET_Y = 58
// The live-set card's width is derived from its video height; the video
// keeps the size it had at the old 88px inset so card widths don't change.
const LIVE_VIDEO_INSET_Y = 88
// Layered: a wide ambient halo (reads in the gaps either side — cards run
// full height, so that's where the lift shows), a deeper offset drop, and a
// tight contact edge.
const FLOAT_SHADOW = '0 0 48px rgba(0,0,0,0.22), 0 30px 60px -12px rgba(0,0,0,0.38), 0 2px 6px rgba(0,0,0,0.12)'
// The feed surface under the floating cards. History (2026-09-26): white
// with a dot grid, then a per-card contrasting underlay (parked), then white
// cards over the palette colour with dots, now the plain palette colour.
// Plain palette colour (dot grid removed 2026-09-26, gabriel). FEED_DOT is
// kept as the spacing unit it was introduced for.
const FEED_SURFACE = 'var(--theme-bg)'
// Text colours per card: the palette's --theme-text-* assume the palette's
// own light/dark, but a card can be any tone of it (dark1 in a light
// palette, a spectrum step…). FloatSlot sets light or dark ink on each card
// from its actual colour — the same rule useCardInk applies inside
// LiveSetCard / AlbumCard — and re-checks when the palette changes.
// Tones are strong enough for >= 3:1 even on mid-tone spectrum cards, where
// neither white nor black has much room.
const INK_DARK_BG  = { '--theme-text-pri': 'rgba(255,255,255,0.95)', '--theme-text-sec': 'rgba(255,255,255,0.80)', '--theme-text-ter': 'rgba(255,255,255,0.66)', '--theme-border': 'rgba(255,255,255,0.18)' }
const INK_LIGHT_BG = { '--theme-text-pri': 'rgba(0,0,0,0.86)', '--theme-text-sec': 'rgba(0,0,0,0.72)', '--theme-text-ter': 'rgba(0,0,0,0.60)', '--theme-border': 'rgba(0,0,0,0.12)' }
function bgIsDark(el) {
  const c = getComputedStyle(el).backgroundColor
  const m = c.match(/\d+(\.\d+)?/g)
  if (!m) return false
  const k = /^color\(srgb/i.test(c) ? 255 : 1
  const [r, g, b] = m.slice(0, 3).map(v => { v = (Number(v) * k) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18 // ≈ where white and black ink give equal contrast
}

// One floating card: FLOAT_INSET_Y of surface above and below, half the gap
// either side, and the card itself rounded and lifted (FLOAT_SHADOW).
function FloatSlot({ children }) {
  const cardWrapRef = useRef(null)
  const [ink, setInk] = useState(null)
  useLayoutEffect(() => {
    let t = null
    const pick = () => { const card = cardWrapRef.current?.firstElementChild; if (card) setInk(bgIsDark(card) ? INK_DARK_BG : INK_LIGHT_BG) }
    pick()
    // applyPalette rewrites :root's style; card colours then fade for 0.8s.
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(pick, 850) })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => { mo.disconnect(); clearTimeout(t) }
  }, [])
  return (
    <div style={{ flexShrink: 0, height: '100%', display: 'flex', padding: `${FLOAT_INSET_Y}px ${FLOAT_GAP / 2}px` }}>
      <div ref={cardWrapRef} style={{ flexShrink: 0, height: '100%', display: 'flex', borderRadius: FLOAT_RADIUS, overflow: 'hidden', boxShadow: FLOAT_SHADOW, ...ink }}>
        {children}
      </div>
    </div>
  )
}


// ── CoverArt ──────────────────────────────────────────────────────────────────

function CoverArt({ post, style = {}, children }) {
  const [err, setErr] = useState(false)
  const src = coverSrc(post || {})
  return (
    // dark2 -> dark1 rather than the old literal #1e2126 -> #08090b: both of
    // those tokens are dark in all eight palettes, so the tile stays dark
    // enough for the white placeholder glyph while still picking up the
    // palette's hue (Midday reads red, Evening purple) instead of punching a
    // fixed black square through the four light themes.
    <div style={{ background: 'linear-gradient(135deg, var(--theme-dark2), var(--theme-dark1))', position: 'relative', overflow: 'hidden', flexShrink: 0, ...style }}>
      {src && !err && <img src={src} alt="" onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      {(!src || err) && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.1)', fontSize: 36 }}>◈</div>}
      {children}
    </div>
  )
}

// ── Comments ──────────────────────────────────────────────────────────────────

function CommentThread({ postId, onCountChange, d, maxH = 140 }) {
  const [comments, setComments] = useState(null) // null = not yet loaded
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`${API}/posts/${postId}/comments`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setComments(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) setComments([]) })
    return () => { cancelled = true }
  }, [postId])

  const userId = getUserId()

  async function submit() {
    const content = text.trim()
    if (!content || submitting || !userId) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`${API}/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, content }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const saved = await res.json()
      setComments(prev => [...(prev || []), saved])
      onCountChange?.((comments?.length || 0) + 1)
      setText('')
    } catch {
      setError('COULD NOT POST — TRY AGAIN')
    } finally {
      setSubmitting(false)
    }
  }

  // 2026-08-26 (round 3, per gabriel): "no replies yet" / "loading…" empty
  // states are gone entirely — the section is meant to stay invisible until
  // there's an actual comment to show, not announce its own emptiness.
  // The list itself now scales with content (no fixed height) up to `maxH`,
  // THEN scrolls — it doesn't just clip. That real scrollbar reintroduces
  // exactly the wheel-capture risk the old `overflowY:'hidden'` comment
  // above this block used to warn about (a vertical wheel gesture over a
  // full list gets consumed here instead of bubbling to the horizontal
  // feed scroller) — scoped to just the list sub-box, not the whole
  // widget, but the risk is real and gabriel asked for the scrollbar
  // explicitly, so this is a deliberate trade, not an oversight.
  const hasComments = comments && comments.length > 0
  return (
    <div style={{ padding: `${d?.cmPy ?? 8}px ${d?.cmPx ?? 16}px 12px`, borderTop: hasComments ? '0.5px solid var(--theme-border)' : 'none', flexShrink: 0 }}>
      {hasComments && (
        <div data-inner-scroll="" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8, maxHeight: maxH, overflowY: 'auto', ...INNER_SCROLL_STYLE }}>
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 6, fontSize: d?.cmSize ?? 12, fontFamily: d?.bodyFf ?? 'Barlow, sans-serif', lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700, color: 'var(--theme-text-pri)', flexShrink: 0 }}>{c.username || c.display_name || 'anon'}</span>
              <span style={{ color: 'var(--theme-text-sec)' }}>{c.content}</span>
            </div>
          ))}
        </div>
      )}
      {userId ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="reply…"
            style={{ flex: 1, borderRadius: 20, border: '1px solid var(--theme-border)', padding: '5px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 11, background: 'var(--theme-dark3)', color: 'var(--theme-text-pri)', outline: 'none' }}
          />
          <button onClick={submit} disabled={!text.trim() || submitting}
            style={{ borderRadius: 20, border: 'none', padding: '5px 14px', fontFamily: 'VT323, monospace', fontSize: 11, background: 'var(--theme-accent)', color: '#fff', cursor: 'pointer', opacity: (!text.trim() || submitting) ? 0.5 : 1, flexShrink: 0 }}
          >{submitting ? '···' : 'reply'}</button>
        </div>
      ) : (
        <a href="/login" style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'var(--theme-accent)', textDecoration: 'none' }}>log in to reply →</a>
      )}
      {error && <div style={{ fontFamily: 'VT323, monospace', fontSize: 10, color: 'var(--theme-accent)', marginTop: 4 }}>{error}</div>}
    </div>
  )
}

// ── Post card — flow "plate" layout (Task B, 2026-08-28) ───────────────────────
// The rail is a plain flex column now (see DESIGN_BASE's own comment above
// for why) — plate, tracklist, genre pills, a flex:1 spacer, then the
// byline footer (replies count + handle + stamp), reordered top<->bottom by
// d.plateBottom. The media column is a flex column too: art or the embed
// well, then caption, then description, reversed the same way.
//
// All the original interactive behavior is unchanged: click a track to
// preview it, the replies button toggles the same CommentThread (now
// rendered inline in the flow instead of an absolutely-positioned overlay),
// discogs/stream links are unchanged, genre pills still filter via openD3.

// ── In-card scroll boxes (2026-09-25) ─────────────────────────────────────────
// Description, tracklist and comments scroll inside the card when their
// content is taller than the space they get. Shared bits:
//   useScrollFit(ref, deps) -> { overflows, atEnd, onScroll }
//   fadeMask(fit)           -> bottom fade while there's more below
//   INNER_SCROLL_STYLE      -> thin, theme-coloured scrollbar
// The box also needs data-inner-scroll so LayoutProvider's wheel handler
// lets it take the wheel (it otherwise sends every wheel to the feed).
const INNER_SCROLL_STYLE = { scrollbarWidth: 'thin', scrollbarColor: 'var(--theme-border) transparent', overscrollBehavior: 'contain' }
const FADE = 'linear-gradient(to bottom, #000 70%, transparent)'
function fadeMask(fit) {
  return fit.overflows && !fit.atEnd ? { maskImage: FADE, WebkitMaskImage: FADE } : null
}
function useScrollFit(ref, deps) {
  const [overflows, setOverflows] = useState(false)
  const [atEnd, setAtEnd] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      setOverflows(el.scrollHeight > el.clientHeight + 1)
      setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = e => { const el = e.currentTarget; setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2) }
  return { overflows, atEnd, onScroll }
}

// Edit/delete for a post card: the post's author (or lnv_admin). The
// backend checks the same thing (canModify in routes/posts.js). Shared by
// PostCard and LiveSetCard.
function usePostActions(post) {
  const queryClient = useQueryClient()
  const myUserId = getUserId()
  const canModify = !!myUserId && (String(post.user_id) === String(myUserId) || isAdmin())
  const [deleting, setDeleting] = useState(false)
  async function deletePost() {
    if (deleting || !window.confirm(`Delete post #${post.id} "${post.title}"? This can't be undone.`)) return
    setDeleting(true)
    try {
      const r = await fetch(`${API}/posts/${post.id}?user_id=${encodeURIComponent(myUserId)}`, { method: 'DELETE' })
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.status) }
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    } catch (err) {
      window.alert(`Couldn't delete: ${err.message}`)
      setDeleting(false)
    }
  }
  return { queryClient, canModify, deleting, deletePost }
}

function PostCard({ post, cardBg, d, onEdit }) {
  const { canModify, deleting, deletePost } = usePostActions(post)
  const { openD3, registerPostRef } = useLayout() || {}
  const [activeTrackUrl, setActiveTrackUrl] = useState(null)
  const [hoveredTrack, setHoveredTrack] = useState(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(post.commentCount || post.comment_count || 0)
  // 2026-08-29 (round 10) — dynamic bottom-plate art alignment. See the
  // note above BOX.art below for the full explanation; artMbBottom seeds
  // the first paint (flush-bottom baseline) before the layout effect
  // measures the rail and corrects it, so there's no visible jump.
  const cardRef = useRef(null)
  const artistNameRef = useRef(null)
  const artBoxRef = useRef(null)
  const [dynamicArtMbBottom, setDynamicArtMbBottom] = useState(d.artMbBottom)
  // In-card scroll boxes — see useScrollFit.
  const descRef = useRef(null)
  const descFit = useScrollFit(descRef, [post.notes, post.body])
  const trackListRef = useRef(null)
  const trackFit = useScrollFit(trackListRef, [post.tracks?.length])

  const type = detectType(post)
  const artist = artistName(post)
  const label = labelName(post)
  const catNo = post.labels?.[0]?.catalogue_number || post.catNo || ''
  const genres = post.genres || []
  const note = cleanNote(post.notes || post.body)
  const tracks = post.tracks || []
  const channel = post.channel || ''
  const platform = post.platform || ''
  const isLiveMix = type === 'livemix'
  // Shared left edge for art/embedWell/caption/desc, sized to whichever is
  // this card's "hero" element (embed well for live, art for album) so the
  // narrower caption/desc text lines up with it instead of each being
  // centered independently. Declared this early (not next to BOX.embedWell,
  // where the old live-only liveEmbedOffset lived) because BOX.art below
  // needs it too, and BOX.art is defined before that point in the function.
  // See the 2026-08-29 note further down.
  const mediaCenterOffset = (d.cardW - d.infoW - d.railBorder - d.bandPadX * 2 - (isLiveMix ? d.embedWellW : d.artSize)) / 2
  const tagLabel = isLiveMix ? 'LIVE SET' : type === 'single' ? 'SINGLE' : 'ALBUM'
  // Live sets stay on the palette accent (the loud one -- they're the
  // exception in this feed); album/single take --theme-showcase, which is a
  // dark, saturated colour in all eight palettes and so always carries the
  // badge's white text.
  const tagColor = isLiveMix ? 'var(--theme-accent)' : 'var(--theme-showcase)'

  // 2026-09-25: the badges are links. The platform badge follows what's
  // playing — B2 open on YouTube means the badge reads YOUTUBE and opens B2
  // there; nothing playing, it's the post's own link. DISCOGS opens the
  // release page; BUY opens the Discogs marketplace for it, or the Bandcamp
  // page for a Bandcamp-only release.
  const playingUrl = activeTrackUrl || post.stream_url || ''
  const playingPlatform = platformOfUrl(playingUrl) || platform
  const playingYtId = playingPlatform === 'youtube' ? playingUrl.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1] : null
  const playingHref = playingYtId ? `https://www.youtube.com/watch?v=${playingYtId}` : (playingUrl || null)
  // No release matched (yet — discogsMatcher retries daily): still give a
  // way in, as a Discogs search for the artist + title. Not for live sets.
  const discogsExact = post.discogs_url || (post.discogs_id ? `https://www.discogs.com/release/${post.discogs_id}` : null)
  const discogsHref = discogsExact || (!isLiveMix && (artist || post.title)
    ? `https://www.discogs.com/search/?${new URLSearchParams({ q: [artist, post.title].filter(Boolean).join(' '), type: 'all' })}`
    : null)
  const buyHref = post.discogs_id
    ? `https://www.discogs.com/sell/release/${post.discogs_id}`
    : (platformOfUrl(post.stream_url) === 'bandcamp' ? post.stream_url : null)

  const platformColor = PLATFORM_COLORS[playingPlatform] || 'var(--theme-accent)'
  const platformLabel = playingPlatform?.toUpperCase()

  const streamUrl = activeTrackUrl || post.stream_url || post.embed_url || tracks[0]?.youtube_url || tracks[0]?.stream_url || ''
  const ytMatch = streamUrl.match(/(?:v=|youtu\.be\/|embed\/)([^&\s?]{11})/)
  const ytId = ytMatch ? ytMatch[1] : null
  const scUrl = /soundcloud\.com/i.test(streamUrl) ? streamUrl : null
  const mcUrl = /mixcloud\.com/i.test(streamUrl) ? streamUrl : null
  // Bandcamp's player can't be built from the page URL (it needs the album/
  // track id), so it's the embed_url the resolver saved with the post. The
  // size=large/minimal=true player is the square artwork with a play button.
  const bcEmbed = /bandcamp\.com/i.test(streamUrl) && /bandcamp\.com\/EmbeddedPlayer/i.test(post.embed_url || '')
    ? post.embed_url : null

  const embedSrc = bcEmbed
    ? bcEmbed
    : ytId
    ? `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&color=white`
    : scUrl
    // visual=true: the artwork fills the player, so in the square art frame
    // it stands in for the cover. Live sets keep the compact bar in the well.
    ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(scUrl)}&color=%23e85d04&auto_play=false&hide_related=true&show_comments=false&show_user=true&visual=${isLiveMix ? 'false' : 'true'}`
    : mcUrl
    ? `https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(mcUrl.replace('https://www.mixcloud.com',''))}`
    : null

  // The embed's size comes from the platform actually detected in the post's
  // URL, not from the designer's preset — the preset only picks which one the
  // preview mocks up.
  const [embedW, embedH] = bcEmbed ? [350, 350]
    : ytId ? [560, 315]
    : scUrl ? [480, 166]
    : mcUrl ? [400, 60]
    : [d.embedW, d.embedH]

  const textPri = 'var(--theme-text-pri)'
  const textSec = 'var(--theme-text-sec)'
  const textTer = 'var(--theme-text-ter)'
  const divider = 'var(--theme-border)'
  // Same expression the card's own outer container uses below (spectrum
  // posts get the live spectrum color, everything else the flat theme bg)
  // — pulled out so the comments panel can match it exactly, per gabriel.
  // Was `spectrum ? cardBg : 'var(--theme-bg)'` (first three flat) — the
  // feed passes their POST_BG_CYCLE tint now; see getCardBg.
  const cardBackground = cardBg

  // A transparent mat puts the caption on the card background, which is dark
  // in most palettes — so it must use the theme tokens rather than the
  // export's literal navy, exactly as the designer does.
  const matTransparent = d.matFill === 'none'
  const captionColor = matTransparent ? textSec : d.captionColor
  const captionNameColor = matTransparent ? textPri : d.captionNameColor

  // Rail content hugs the edge nearest the media column, so the four ways
  // read as two mirrored pairs — same derivation as before Task B.
  const railJustify = d.plateAlign === 'right' ? 'flex-end' : d.plateAlign === 'center' ? 'center' : 'flex-start'

  const zlabel = {
    fontFamily: d.labelFf, fontWeight: 600, fontSize: d.zlabelSize, letterSpacing: `${d.zlabelLs}em`,
    textTransform: 'uppercase', color: textTer, marginBottom: d.zlabelMb,
  }
  const artShadow = (d.artShadowY || d.artShadowB)
    ? `0 ${d.artShadowY}px ${d.artShadowB}px rgba(0,0,0,${d.artShadowA})`
    : 'none'
  const artTransform = (d.artOffsetX || d.artOffsetY)
    ? `translate(${d.artOffsetX}px, ${d.artOffsetY}px)`
    : undefined

  // 2026-08-26: clicking a tracklist row (see the track row's onClick below,
  // which sets activeTrackUrl) flips the art around (a real 3D flip, not a
  // crossfade) to reveal that track's embedded player on the back face.
  // Click the same row again to flip back. Livemix posts are unaffected —
  // they show their channel embed the same way they always did. Unchanged
  // by Task B.
  // 2026-09-25: SoundCloud posts start flipped — the SoundCloud player shows
  // the artwork itself, so there's nothing to click through to. A tracklist
  // row with its own link still swaps the player; un-clicking it returns to
  // the SoundCloud one.
  // Bandcamp too (2026-09-25): its player is the artwork as well.
  const playerIsArt = /soundcloud\.com|bandcamp\.com/i.test(post.stream_url || '')
  const albumFlipped = !isLiveMix && !!embedSrc && (!!activeTrackUrl || playerIsArt)

  // 2026-09-25: clicking the front of the art does what clicking track A's
  // row does — flips to its player and highlights the row. Falls back to the
  // first track that has a link, then the post's own link. Once flipped the
  // iframe takes the clicks, so flipping back stays on the active row.
  const firstTrackUrl = tracks.map(t => t.stream_url || t.youtube_url).find(Boolean)
    || post.stream_url || post.embed_url || null
  const playFromArt = !isLiveMix && !albumFlipped && firstTrackUrl
    ? () => setActiveTrackUrl(firstTrackUrl)
    : undefined

  const BOX = {}

  BOX.plate = (
    <div key="plate" style={{ textAlign: d.plateAlign }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: railJustify }}>
        <span style={{ fontSize: d.badgeSize, fontWeight: d.badgeWeight, letterSpacing: `${d.badgeLs}em`, textTransform: 'uppercase', padding: `${d.badgePy}px ${d.badgePx}px`, borderRadius: d.badgeRadius, background: tagColor, color: '#fff', fontFamily: d.labelFf }}>{tagLabel}</span>
        {platformLabel && (
          <a href={playingHref || undefined} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            title={playingHref ? `Open on ${platformLabel.toLowerCase()}` : undefined}
            style={{ fontSize: d.badgeSize, fontWeight: d.badgeWeight, letterSpacing: `${d.badgeLs}em`, textTransform: 'uppercase', padding: `${d.badgePy}px ${d.badgePx}px`, borderRadius: d.badgeRadius, background: platformColor, color: playingPlatform === 'beatport' ? '#000' : '#fff', fontFamily: d.labelFf, textDecoration: 'none', cursor: playingHref ? 'pointer' : 'default' }}>{platformLabel}</a>
        )}
        {discogsHref && (
          // "badge (secondary)" per the v2 spec — no-fill, outline only.
          // Was gated on post.source, a field posts never carry, so it
          // never rendered; now shown whenever the post has a release.
          <a href={discogsHref} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={discogsExact ? 'Open release on Discogs' : 'Search Discogs'}
            style={{ fontSize: d.badgeSize, fontWeight: d.badgeWeight, letterSpacing: `${d.badgeLs}em`, textTransform: 'uppercase', padding: `${d.badgePy}px ${d.badgePx}px`, borderRadius: d.badgeRadius, background: 'none', border: `1px solid ${divider}`, color: textSec, fontFamily: d.labelFf, textDecoration: 'none', cursor: 'pointer' }}>◈ DISCOGS</a>
        )}
        {buyHref && (
          <a href={buyHref} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            title={post.discogs_id ? 'Buy on the Discogs marketplace' : 'Buy on Bandcamp'}
            style={{ fontSize: d.badgeSize, fontWeight: d.badgeWeight, letterSpacing: `${d.badgeLs}em`, textTransform: 'uppercase', padding: `${d.badgePy}px ${d.badgePx}px`, borderRadius: d.badgeRadius, background: 'none', border: `1px solid ${divider}`, color: textSec, fontFamily: d.labelFf, textDecoration: 'none', cursor: 'pointer' }}>BUY ↗</a>
        )}
      </div>
      <div
        ref={artistNameRef}
        onClick={() => artist && !isVariousArtist(artist) && openD3?.('artists', { filter: artist })}
        style={{ fontSize: d.artistSize, fontWeight: d.artistWeight, lineHeight: d.artistLh, letterSpacing: `${d.artistLs}em`, textTransform: d.artistCase, color: textPri, fontFamily: d.artistFf, marginTop: d.artistMt, cursor: artist && !isVariousArtist(artist) ? 'pointer' : 'default', wordBreak: 'break-word' }}
      >{artist || post.title}</div>
      {/* v2: the post title gets promoted to its own large italic line
          (same size as the artist name) instead of sharing the small
          metaline with label/year — only shown when there's an artist
          name above it to distinguish it from (otherwise it'd duplicate
          the headline that already fell back to post.title). */}
      {artist && post.title && (
        <div style={{ fontSize: d.titleSize, fontStyle: 'italic', lineHeight: d.titleLh, letterSpacing: `${d.titleLs}em`, color: textSec, fontFamily: d.artistFf, wordBreak: 'break-word' }}>{post.title}</div>
      )}
      {(label || post.year) && (
        <div style={{ fontSize: d.metalineSize, fontWeight: 500, letterSpacing: `${d.metalineLs}em`, textTransform: 'uppercase', marginTop: d.metalineMt, color: textTer, fontFamily: d.monoFf, lineHeight: d.metalineLh }}>
          {label && <span onClick={() => openD3?.('labels', { filter: label })} style={{ cursor: 'pointer', borderBottom: '1px dotted currentColor' }}>{label}</span>}
          {label && post.year && ' · '}
          {post.year}
        </div>
      )}
      <div style={{ fontSize: d.numeralSize, fontWeight: d.numeralWeight, lineHeight: d.numeralLh, letterSpacing: `${d.numeralLs}em`, opacity: d.numeralOpacity, color: textPri, fontFamily: d.numeralFf, margin: d.numeralMargin }}>
        {String(post.id).padStart(2, '0')}
      </div>
    </div>
  )

  const trackRows = !isLiveMix && tracks.length > 0
  if (trackRows || (isLiveMix && channel)) {
    // 2026-08-26: title sits on the same side as the plate's own text
    // (name/metaline/numeral, controlled by plateAlign/railJustify above),
    // with the number/play-indicator and duration on the opposite side.
    // Mirrors properly for the left-plate variants too.
    const trackTextAlign = d.plateAlign === 'left' ? 'left' : d.plateAlign === 'center' ? 'center' : 'right'
    // 2026-09-25: every track is listed (was the first TRACK_ROWS + "+N
    // more"). The box shrinks to the rail's free space (flex-shrink +
    // minHeight) and the rows scroll inside it, wheel included — see
    // data-inner-scroll in LayoutProvider's wheel handler.
    BOX.track = (
      <div key="track" style={{ overflow: 'hidden', textAlign: trackTextAlign, display: 'flex', flexDirection: 'column', flex: '0 1 auto', minHeight: isLiveMix ? undefined : Math.min(tracks.length, 3) * (d.trackSize * 1.4 + d.trackRowpad * 2) + 18 }}>
        <div style={{ ...zlabel, flexShrink: 0 }}>{isLiveMix ? 'Channel' : 'Album listing'}</div>
        {isLiveMix ? (
          <div style={{ fontSize: d.trackSize, color: textPri, fontFamily: d.bodyFf }}>{channel}</div>
        ) : (
          <div ref={trackListRef} data-inner-scroll={trackFit.overflows ? '' : undefined} onScroll={trackFit.onScroll}
            style={{ minHeight: 0, overflowY: trackFit.overflows ? 'auto' : 'hidden', ...INNER_SCROLL_STYLE, ...fadeMask(trackFit) }}>
            {tracks.map((t, i) => {
              const tUrl = t.stream_url || t.youtube_url || null
              const isActive = activeTrackUrl && tUrl && activeTrackUrl === tUrl
              const isHovered = hoveredTrack === i
              const numEl = (
                <span key="num" style={{ fontSize: d.tracknumSize, fontWeight: 500, color: isActive ? 'var(--theme-accent)' : textTer, fontFamily: d.monoFf, flexShrink: 0, minWidth: 16 }}>{tUrl ? (isActive ? '▶' : '▷') : (t.position || i + 1)}</span>
              )
              const durEl = t.duration ? (
                <span key="dur" style={{ fontSize: d.tracknumSize, color: textTer, fontFamily: d.monoFf, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{t.duration}</span>
              ) : null
              const titleEl = (
                <span key="title" style={{ flex: `0 1 ${d.trackTitleW}%`, fontSize: d.trackSize, color: isActive ? textPri : textSec, fontWeight: isActive ? 600 : 400, fontFamily: d.bodyFf, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              )
              // Left-plate mirror: title leads, num/duration trail.
              // Right-plate (currently live) and center: num/duration
              // lead, title trails — title ends up on the same side as
              // the plate's own text and numeral.
              const order = d.plateAlign === 'left' ? [titleEl, durEl, numEl] : [numEl, durEl, titleEl]
              return (
                <div key={i}
                  onClick={() => { if (tUrl) setActiveTrackUrl(isActive ? null : tUrl) }}
                  onMouseEnter={() => setHoveredTrack(i)}
                  onMouseLeave={() => setHoveredTrack(h => h === i ? null : h)}
                  style={{ display: 'flex', justifyContent: railJustify, gap: d.trackGap, alignItems: 'baseline', padding: `${d.trackRowpad}px 0`, cursor: tUrl ? 'pointer' : 'default', background: (isActive || isHovered) ? 'color-mix(in srgb, var(--theme-accent) 14%, transparent)' : 'transparent' }}>
                  {order}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  BOX.pills = genres.length > 0 ? (
    <div key="pills" style={{ display: 'flex', flexWrap: 'wrap', gap: d.pillGap, justifyContent: railJustify, marginTop: d.plateBottom ? 14 : 7 }}>
      {genres.slice(0, 6).map(g => (
        <span key={g} onClick={() => openD3?.('genres', { filter: g })}
          style={{ fontSize: d.pillSize, background: 'var(--theme-dark3)', color: textSec, padding: `${d.pillPy}px ${d.pillPx}px`, borderRadius: d.pillRadius, fontFamily: d.bodyFf, cursor: 'pointer' }}
        >{g}</span>
      ))}
    </div>
  ) : null

  // Replaces the old separate replies-box + stamp-box (which always shared
  // one Y and formed a footer row anyway — see the pre-Task-B DESIGN_BASE
  // comment) with one real flex row: replies toggle, handle, stamp pushed
  // to the far edge via marginLeft:auto.
  BOX.byline = (
    <div key="byline" style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: d.bylineMt }}>
      <button onClick={() => setCommentsOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: d.metarowSize, color: textTer, padding: 0, fontFamily: d.bodyFf, flexShrink: 0 }}>
        <span style={{ color: 'var(--theme-accent)', fontWeight: 700 }}>{commentCount}</span>&nbsp;replies
      </button>
      <span style={{ fontSize: d.handleSize, fontWeight: d.handleWeight, color: textPri, fontFamily: d.bodyFf, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.user?.username || post.username}</span>
      <span style={{ fontSize: d.stampSize, letterSpacing: `${d.stampLs}em`, color: textTer, fontFamily: d.monoFf, marginLeft: 'auto', flexShrink: 0 }}>{timeAgo(post.created_at)}</span>
      {canModify && (
        <span style={{ display: 'flex', gap: 8, flexShrink: 0, fontSize: d.stampSize, letterSpacing: `${d.stampLs}em`, fontFamily: d.monoFf }}>
          <button onClick={e => { e.stopPropagation(); onEdit?.(post) }} title="Edit this post"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: textTer, font: 'inherit', letterSpacing: 'inherit' }}>edit</button>
          <button onClick={e => { e.stopPropagation(); deletePost() }} disabled={deleting} title="Delete this post"
            style={{ background: 'none', border: 'none', padding: 0, cursor: deleting ? 'default' : 'pointer', color: 'var(--theme-accent)', font: 'inherit', letterSpacing: 'inherit', opacity: deleting ? 0.5 : 1 }}>{deleting ? 'deleting…' : 'delete'}</button>
        </span>
      )}
    </div>
  )

  // Comments render inline in the flow now, right under the byline row,
  // instead of the old absolutely-positioned overlay computed off
  // repliesY/pillsY/plateY (opensUpward/FOOTER_ROW_H/anchorStyle etc, all
  // gone) — the flex column just pushes whatever's below it down while
  // this is open, in both plate-top and plate-bottom variants. Still
  // invisible until there's an actual comment (2026-08-26 round 3).
  const hasComments = commentCount > 0
  BOX.comments = commentsOpen ? (
    <div key="comments" style={{
      marginTop: 8,
      ...(hasComments
        ? { background: cardBackground, border: `1px solid ${divider}`, borderRadius: 4, overflow: 'hidden' }
        : { background: 'transparent' }),
    }}>
      <CommentThread postId={post.id} onCountChange={setCommentCount} d={d} />
    </div>
  ) : null

  useLayoutEffect(() => {
    if (isLiveMix || !d.plateBottom) return
    const cardEl = cardRef.current, artistEl = artistNameRef.current
    if (!cardEl || !artistEl) return
    const cardRect = cardEl.getBoundingClientRect()
    const artistTopRel = artistEl.getBoundingClientRect().top - cardRect.top
    const target = (cardRect.height - d.padY) - (artistTopRel + d.artSize)
    if (Math.abs(target - dynamicArtMbBottom) > 0.5) setDynamicArtMbBottom(target)
  }, [isLiveMix, d.plateBottom, d.padY, d.artSize, dynamicArtMbBottom])

  BOX.art = !isLiveMix ? (
    <div key="art" ref={artBoxRef} onClick={playFromArt} style={{ cursor: playFromArt ? 'pointer' : 'default', width: d.artSize, height: d.artSize, flexShrink: 0, position: 'relative', background: matTransparent ? 'transparent' : d.matColor, borderRadius: d.matRadius, padding: d.matPad, overflow: 'hidden', perspective: 1400, transition: 'background 0.8s', marginTop: d.plateBottom ? d.captionMtTop : d.artMtTop, marginBottom: d.plateBottom ? dynamicArtMbBottom : 0, marginLeft: mediaCenterOffset }}>
      <div style={{
        position: 'relative', width: '100%', height: '100%',
        transformStyle: 'preserve-3d',
        transform: `rotateY(${albumFlipped ? 180 : 0}deg)`,
        transition: 'transform 0.7s cubic-bezier(0.4, 0.1, 0.2, 1)',
      }}>
        <CoverArt post={post} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          borderRadius: d.artRadius, boxShadow: artShadow, transform: artTransform,
          backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
        }} />
        {/* Back face — only mounts the iframe once actually flipped to face
            the viewer, both to avoid loading/autoplay weirdness on a
            hidden iframe and for the same "don't run video you can't see"
            reasoning already applied to spotlight cards. */}
        <div style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          borderRadius: d.artRadius, overflow: 'hidden', background: 'var(--theme-dark1)',
          backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {albumFlipped && embedSrc && (
            // A clicked track autoplays; when it ends the next track with a
            // link plays (album play-through). The pre-flipped SoundCloud /
            // Bandcamp player (no activeTrackUrl) doesn't autoplay.
            <TrackPlayer key={embedSrc} src={embedSrc} title={post.title}
              autoplay={!!activeTrackUrl}
              onEnded={() => {
                const urls = tracks.map(t => t.stream_url || t.youtube_url || null)
                const idx = urls.indexOf(activeTrackUrl)
                const next = idx >= 0 ? urls.slice(idx + 1).find(Boolean) : null
                if (next) setActiveTrackUrl(next)
              }} />
          )}
        </div>
      </div>
    </div>
  ) : null

  // Embed well — a constant-size frame (496x279, inner 456x257) that every
  // platform's native embed size (YouTube 560x315, SoundCloud 480x166,
  // Mixcloud 400x60) letterboxes inside via a uniform scale-to-fit, rather
  // than the well itself changing size per platform.
  const wellScale = Math.min(d.embedInnerW / embedW, d.embedInnerH / embedH, 1)
  // Centers the embed well (and, below, caption/desc to the same edge) in
  // the live media column — see the 2026-08-29 note above.
  BOX.embedWell = isLiveMix ? (
    <div key="embed-well" style={{ width: d.embedWellW, height: d.embedWellH, flexShrink: 0, marginLeft: mediaCenterOffset, background: 'var(--theme-dark1)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
      {embedSrc ? (
        <iframe src={embedSrc}
          style={{ width: embedW * wellScale, height: embedH * wellScale, border: 'none', borderRadius: d.artRadius, boxShadow: artShadow, transform: artTransform }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen title={post.title} />
      ) : (
        <div style={{ width: d.embedInnerW, height: d.embedInnerH, borderRadius: d.artRadius, overflow: 'hidden', background: 'var(--theme-dark2)', position: 'relative' }}>
          {coverSrc(post) && <img src={coverSrc(post)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 }} />}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: d.monoFf, fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>NO STREAM URL</div>
        </div>
      )}
    </div>
  ) : null

  BOX.caption = (
    <div key="caption" style={{ flexShrink: 0, marginTop: isLiveMix ? d.captionMt : (d.plateBottom ? d.captionMtBottom : d.captionMtTop), marginLeft: mediaCenterOffset, maxWidth: d.captionMaxW, fontFamily: d.bodyFf, fontSize: d.captionSize, lineHeight: d.captionLh, color: captionColor }}>
      <div style={{ fontFamily: d.artistFf, fontWeight: d.captionNameWeight, fontSize: d.captionNameSize, lineHeight: 1.3, color: captionNameColor }}>{label || '—'}</div>
      <div style={{ fontFamily: d.monoFf, fontWeight: 500, fontSize: d.catSize, letterSpacing: `${d.catLs}em`, marginTop: d.catMt }}>{[catNo, post.year].filter(Boolean).join(' · ')}</div>
    </div>
  )

  // 2026-09-25: the description used to be sized to its text inside a
  // fixed-height, overflow:hidden column, so anything longer than the space
  // left under the art + caption was silently cut off (or, on plate-bottom
  // cards, pushed out of the top). It now takes only the space that's left
  // (flex-shrink + minHeight 0) and scrolls in place, fading at the bottom
  // until scrolled to the end — see useScrollFit.
  BOX.desc = (
    <div key="desc" style={{ marginTop: (!isLiveMix && !d.plateBottom) ? d.descMtTop : d.descMt, marginLeft: mediaCenterOffset, flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...zlabel, flexShrink: 0 }}>Post description</div>
      {note ? (
        <p ref={descRef} data-inner-scroll={descFit.overflows ? '' : undefined} onScroll={descFit.onScroll}
          style={{
            fontSize: d.descSize, color: textSec, lineHeight: d.descLh, fontFamily: d.bodyFf, margin: 0,
            // Long notes keep >= 3 visible lines rather than being squeezed
            // to nothing on short screens; short ones size to their text.
            minHeight: note.length > 120 ? Math.round(d.descSize * d.descLh * 3) : 0,
            flex: note.length > 120 ? '0 1 auto' : '0 0 auto', overflowWrap: 'anywhere', whiteSpace: 'pre-line',
            overflowY: descFit.overflows ? 'auto' : 'hidden', paddingRight: descFit.overflows ? 6 : 0,
            ...INNER_SCROLL_STYLE, ...fadeMask(descFit),
          }}>{note}</p>
      ) : (
        <p style={{ fontSize: d.descSize, color: textTer, fontStyle: 'italic', fontFamily: d.bodyFf, margin: 0 }}>No description</p>
      )}
    </div>
  )

  // ── assemble the rail: plate+rule+tracklist+pills form one group, the
  // byline (+ its comments panel) forms the other, a flex:1 spacer between
  // them, dividers as standalone rule elements rather than box borders.
  // plateBottom swaps which group comes first — see DESIGN_BASE's comment.
  const ruleSolid = <div key="rule-solid" style={{ height: 1, background: divider, margin: `${d.ruleSolidMy}px 0` }} />
  const ruleDashed = <div key="rule-dashed" style={{ height: 0, borderTop: `1px dashed ${divider}`, margin: `${d.ruleMy}px 0` }} />
  const spacer = <div key="spacer" style={{ flex: 1 }} />

  const plateGroup = [BOX.plate, BOX.track && ruleSolid, BOX.track, BOX.pills].filter(Boolean)
  const bylineGroup = [BOX.byline, BOX.comments].filter(Boolean)
  // Live sets skip the flex:1 spacer — no edge to anchor to, just one
  // compact block (plate group + byline group) that the rail container
  // centers as a whole. See the 2026-08-28 note above.
  const railChildren = isLiveMix
    ? [...plateGroup, ruleDashed, ...bylineGroup]
    : d.plateBottom
      ? [...bylineGroup, ruleDashed, spacer, ...plateGroup]
      : [...plateGroup, spacer, ruleDashed, ...bylineGroup]

  // ── media column: art/embed, caption, description — reversed the same
  // way as the rail (mirrors the pre-Task-B PLATE_TOP/PLATE_BOTTOM
  // convention: "artwork/caption/description reading downward in the top
  // ways, description/caption/artwork in the bottom ways").
  const artOrEmbed = isLiveMix ? BOX.embedWell : BOX.art
  const mediaChildren = d.plateBottom
    ? [BOX.desc, BOX.caption, artOrEmbed]
    : [artOrEmbed, BOX.caption, BOX.desc]

  return (
    <div
      ref={el => { registerPostRef?.(post.id, el); cardRef.current = el }}
      style={{
        flexShrink: 0, width: d.cardW, height: '100%', alignSelf: 'stretch',
        background: cardBackground,
        borderRadius: d.cardRadius || undefined,
        display: 'flex',
        flexDirection: d.mediaSide === 'left' ? 'row-reverse' : 'row',
        overflow: 'hidden',
        transition: 'background 0.8s',
      }}
    >
      <div style={{
        width: d.infoW, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        // Live sets centre the whole (spacer-less) block; albums anchor to
        // the plate group's edge, same as the media column below.
        justifyContent: isLiveMix ? 'center' : 'flex-start',
        padding: d.mediaSide === 'left' ? `${d.padY}px 0 ${d.padY}px 26px` : `${d.padY}px 26px ${d.padY}px 0`,
        [d.mediaSide === 'left' ? 'borderLeft' : 'borderRight']: `${d.railBorder}px solid ${divider}`,
      }}>
        {railChildren}
      </div>
      <div style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        // Live: centred as one block. Album: anchored to the same edge as
        // the rail's plate group — top for the plate-top ways, bottom for
        // the plate-bottom ways. See the 2026-08-28 notes above.
        justifyContent: isLiveMix ? 'center' : (d.plateBottom ? 'flex-end' : 'flex-start'),
        // Horizontal centering is now handled per-child via mediaCenterOffset
        // (marginLeft) above, not alignItems — see the 2026-08-29 note above.
        padding: `${d.padY}px ${d.bandPadX}px`,
      }}>
        {mediaChildren}
      </div>
    </div>
  )
}

// ── Live set card (2026-09-26) ─────────────────────────────────────────────────
// gabriel approved this composition from the card mockup (frontend/
// mockup.html, template "G · wide set") as-is: a wide 16:9 screen with a
// "● live set" tag and a centred play button, then the DJ / channel name
// huge, the set title in light italic under it, and the badges + year on
// the right. Clicking play swaps the thumbnail for the real embed
// (autoplay). The byline (replies, poster, time, edit/delete) sits as one
// quiet row at the bottom so nothing the old card could do is lost.
// Ink (text colours) is picked from the card's actual background, so it
// stays readable whatever palette/spectrum colour the card lands on.
const LIVE_W = 1200     // widest the card gets (video 1088 wide + 2 × LIVE_PADX)
const LIVE_PADX = 56    // same padding left and right

// Width of a live-set card as a CSS length: its video's 16:9 width plus
// LIVE_PADX each side, where the video height is the full-size one or what
// fits the screen height. Shared so spotlights are exactly as wide as live
// sets at every screen size (gabriel, 2026-09-26).
function liveCardWidth() {
  const T = DESIGN_BASE
  const videoH = `min(${Math.round((LIVE_W - 2 * LIVE_PADX) * 9 / 16)}px, calc(100vh - ${2 * (T.padY + LIVE_VIDEO_INSET_Y) + 270}px))`
  return `calc(${videoH} * 16 / 9 + ${2 * LIVE_PADX}px)`
}

// A post is shown as a live set when it's typed as one, or its title reads
// like one ("Artist | Channel - Date", b2b, dj set, live at, session) —
// several older sets were saved as "album".
function isLiveSetPost(p) {
  return detectType(p) === 'livemix' || /\|\s*.+\d{4}|\bb2b\b|dj set|live at|session/i.test(p.title || '')
}

// Readable ink on whatever colour a card lands on: sets --lv-pri / -sec /
// -ter / -line on the card from its actual background luminance. Used by
// LiveSetCard and AlbumCard.
function useCardInk(cardRef, cardBg) {
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    // Same rule and tones as FloatSlot's ink (bgIsDark / INK_*), which also
    // reads color(srgb …) spectrum colours correctly.
    const ink = bgIsDark(el) ? INK_DARK_BG : INK_LIGHT_BG
    ;[['--lv-pri', '--theme-text-pri'], ['--lv-sec', '--theme-text-sec'], ['--lv-ter', '--theme-text-ter'], ['--lv-line', '--theme-border']]
      .forEach(([v, from]) => el.style.setProperty(v, ink[from]))
  }, [cardRef, cardBg])
}

function LiveSetCard({ post, cardBg, d, onEdit }) {
  const { registerPostRef } = useLayout() || {}
  const { canModify, deleting, deletePost } = usePostActions(post)
  const [playing, setPlaying] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(post.commentCount || post.comment_count || 0)
  const cardRef = useRef(null)
  const note = cleanNote(post.notes || post.body)
  const descRef = useRef(null)
  const descFit = useScrollFit(descRef, [post.notes, post.body])
  // Type matches the regular post card exactly (DESIGN_BASE, not the per-slot
  // variants) — gabriel, 2026-09-26: one uniform type scale across all posts.
  const T = DESIGN_BASE
  // One video height drives the whole card: the full-width size, or whatever
  // fits under the regular cards' top/bottom padding once the name row,
  // ~3 description lines and the byline (~270px) are allowed for. The card
  // is then exactly that video's 16:9 width plus LIVE_PADX each side, so
  // the tags / year / edit-delete on the right sit flush with the video's
  // right edge and the side padding is equal.
  const cardW = liveCardWidth()

  // Some older sets were saved with no link, only a YouTube thumbnail as the
  // cover — its URL (i.ytimg.com/vi/<id>/…) still carries the video id.
  const coverVid = (coverSrc(post) || '').match(/ytimg\.com\/vi\/([A-Za-z0-9_-]{11})\//)?.[1]
  const streamUrl = postStreamUrl(post) || (coverVid ? `https://www.youtube.com/watch?v=${coverVid}` : '')
  const vid = ytIdOf(streamUrl)
  const embedSrc = toEmbedSrc(streamUrl)
  const [thumb, setThumb] = useState(vid ? `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg` : coverSrc(post))

  // "Artist | Channel - Date" titles split into the big name and the line under it.
  const artist = (artistName(post) || '').replace(/ - Topic$/, '') || (post.title || '').split('|')[0].trim()
  const subtitle = (post.title || '').includes('|') ? post.title.split('|').slice(1).join('|').trim() : post.title
  const platform = post.platform || platformOfUrl(streamUrl) || ''

  useCardInk(cardRef, cardBg)

  const MONO = "'IBM Plex Mono', monospace", SANS = "'Barlow', sans-serif"
  const pill = { display: 'inline-block', fontFamily: SANS, fontWeight: 600, fontSize: 10, lineHeight: 1, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 8px', borderRadius: 3, textDecoration: 'none' }
  const discogsHref = post.discogs_url || (post.discogs_id ? `https://www.discogs.com/release/${post.discogs_id}` : null)

  return (
    <div
      ref={el => { registerPostRef?.(post.id, el); cardRef.current = el }}
      // Top/bottom padding = the regular post card's (DESIGN_BASE.padY) —
      // trial 2026-09-26, gabriel: "just see what it looks like".
      style={{ flexShrink: 0, width: cardW, height: '100%', background: cardBg, padding: `${T.padY}px ${LIVE_PADX}px`, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'background 0.8s', color: 'var(--lv-pri)' }}
    >
      {/* screen */}
      {/* Fills the card's inner width; the card itself is sized from the
          video height (videoH / cardW above), so this lands at exactly
          that height. */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', flexShrink: 0, overflow: 'hidden', borderRadius: T.artRadius /* same corners as post-card art */ }}>
        {playing && embedSrc ? (
          <TrackPlayer key={embedSrc} src={embedSrc} title={post.title} autoplay />
        ) : (
          <>
            {thumb && <img src={thumb} alt="" onError={() => vid && setThumb(`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
            <span style={{ ...pill, position: 'absolute', left: 18, top: 18, background: 'var(--theme-showcase)', color: '#fff' }}>● live set</span>
            {embedSrc && (
              <button onClick={() => setPlaying(true)} aria-label="Play set"
                style={{ position: 'absolute', left: '50%', top: '50%', width: 92, height: 92, margin: '-46px 0 0 -46px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.92)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <span style={{ width: 0, height: 0, borderLeft: '26px solid #111', borderTop: '16px solid transparent', borderBottom: '16px solid transparent', marginLeft: 7 }} />
              </button>
            )}
          </>
        )}
      </div>

      {/* name + set line | badges + year */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 30, marginTop: 26, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 11, letterSpacing: '0.08em', color: 'var(--lv-sec)' }}>00-{post.id}</div>
          <div style={{ fontFamily: T.artistFf, fontWeight: T.artistWeight, fontSize: T.artistSize, lineHeight: T.artistLh, letterSpacing: `${T.artistLs}em`, textTransform: T.artistCase, marginTop: 10, color: 'var(--lv-pri)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artist}</div>
          <div style={{ fontFamily: T.artistFf, fontStyle: 'italic', fontSize: T.titleSize, lineHeight: T.titleLh, letterSpacing: `${T.titleLs}em`, marginTop: 4, color: 'var(--lv-sec)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ ...pill, background: 'var(--theme-showcase)', color: '#fff' }}>live set</span>{' '}
          {platform && (
            <a href={streamUrl || undefined} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              style={{ ...pill, background: PLATFORM_COLORS[platform] || '#444', color: '#fff' }}>{platform}</a>
          )}
          {discogsHref && <>{' '}<a href={discogsHref} target="_blank" rel="noopener noreferrer" style={{ ...pill, border: '1px solid var(--lv-line)', color: 'var(--lv-sec)' }}>◈ discogs</a></>}
          <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 11, letterSpacing: '0.08em', color: 'var(--lv-sec)', marginTop: 10 }}>{post.year || ''}</div>
        </div>
      </div>

      {/* post description — same label, size and in-card scroll as the
          regular post card */}
      <div style={{ marginTop: 22, flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', maxWidth: 760 }}>
        <div style={{ fontFamily: T.labelFf, fontWeight: 600, fontSize: T.zlabelSize, letterSpacing: `${T.zlabelLs}em`, textTransform: 'uppercase', color: 'var(--lv-ter)', marginBottom: T.zlabelMb, flexShrink: 0 }}>Post description</div>
        {note ? (
          <p ref={descRef} data-inner-scroll={descFit.overflows ? '' : undefined} onScroll={descFit.onScroll}
            style={{ fontSize: T.descSize, lineHeight: T.descLh, fontFamily: T.bodyFf, color: 'var(--lv-sec)', margin: 0, minHeight: (note.length > 120 ? 3 : 1) * Math.round(T.descSize * T.descLh), flex: '0 1 auto', overflowWrap: 'anywhere', whiteSpace: 'pre-line', overflowY: descFit.overflows ? 'auto' : 'hidden', paddingRight: descFit.overflows ? 6 : 0, ...INNER_SCROLL_STYLE, ...fadeMask(descFit) }}>{note}</p>
        ) : (
          <p style={{ fontSize: T.descSize, fontFamily: T.bodyFf, fontStyle: 'italic', color: 'var(--lv-ter)', margin: 0 }}>No description</p>
        )}
      </div>

      {/* byline — kept quiet at the bottom */}
      <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', gap: 14, alignItems: 'baseline', fontFamily: MONO, fontSize: 11, letterSpacing: '0.06em', color: 'var(--lv-ter)', flexShrink: 0 }}>
        <button onClick={() => setCommentsOpen(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--lv-sec)' }}>
          <span style={{ color: 'var(--theme-accent)', fontWeight: 700 }}>{commentCount}</span> replies
        </button>
        <span style={{ color: 'var(--lv-sec)' }}>{post.user?.username || post.username}</span>
        <span>{timeAgo(post.created_at)}</span>
        {canModify && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button onClick={() => onEdit?.(post)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--lv-ter)' }}>edit</button>
            <button onClick={deletePost} disabled={deleting} style={{ background: 'none', border: 'none', padding: 0, cursor: deleting ? 'default' : 'pointer', font: 'inherit', color: 'var(--theme-accent)', opacity: deleting ? 0.5 : 1 }}>{deleting ? 'deleting…' : 'delete'}</button>
          </span>
        )}
      </div>
      {commentsOpen && (
        <div style={{ marginTop: 8, flexShrink: 0 }}>
          <CommentThread postId={post.id} onCountChange={setCommentCount} d={d} />
        </div>
      )}
    </div>
  )
}

// ── Album card (2026-09-26) ────────────────────────────────────────────────────
// From the card mockup's "C · record out" template, which gabriel picked for
// albums, reworked with gabriel 2026-09-26: the sleeve with the post
// description beside it; underneath, badges / artist / title / metaline with
// the big post number below them (the "lower orientation" numeral), and a
// two-column tracklist on the right. (The record peeking out of the sleeve
// and the top-right numeral were tried and dropped.) Used for posts with
// more than ALBUM_MIN_TRACKS tracks.
// Same size, padding and type as the regular post card — everything reads
// from `d` (DESIGN_BASE + the slot's variant): cardW, padY/bandPadX, the
// numeral, badge, artist/title, metaline, track, description and byline
// tokens, and artSize for the sleeve (shrunk only when the screen is too
// short to fit the text under it). Playback works like PostCard: the sleeve
// plays track A, a track row plays that track, the player takes the
// sleeve's place and the album plays through (TrackPlayer).
const ALBUM_MIN_TRACKS = 6   // "over 6 tracks"

function isAlbumPost(p) {
  return (p.tracks?.length || 0) > ALBUM_MIN_TRACKS
}

function AlbumCard({ post, cardBg, d, onEdit }) {
  const { registerPostRef } = useLayout() || {}
  const { canModify, deleting, deletePost } = usePostActions(post)
  const [activeUrl, setActiveUrl] = useState(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(post.commentCount || post.comment_count || 0)
  const cardRef = useRef(null)
  useCardInk(cardRef, cardBg)

  const tracks = post.tracks || []
  const urlOf = t => t.stream_url || t.youtube_url || null
  const artist = artistName(post)
  const label = labelName(post)
  const catNo = post.labels?.[0]?.catalogue_number || post.labels?.[0]?.catno || ''
  const note = cleanNote(post.notes || post.body)
  const cover = coverSrc(post)
  const descRef = useRef(null)
  const descFit = useScrollFit(descRef, [post.notes, post.body])
  const listRef = useRef(null)
  const listFit = useScrollFit(listRef, [tracks.length])

  const firstUrl = tracks.map(urlOf).find(Boolean) || post.stream_url || null
  const playingSrc = activeUrl ? toEmbedSrc(activeUrl) : null
  function playNext() {
    const urls = tracks.map(urlOf)
    const i = urls.indexOf(activeUrl)
    const next = i >= 0 ? urls.slice(i + 1).find(Boolean) : null
    if (next) setActiveUrl(next)
  }

  // Badges, same behaviour as PostCard's: platform follows what's playing.
  const playingUrl = activeUrl || post.stream_url || ''
  const playingPlatform = platformOfUrl(playingUrl) || post.platform || ''
  const playingYtId = playingPlatform === 'youtube' ? ytIdOf(playingUrl) : null
  const playingHref = playingYtId ? `https://www.youtube.com/watch?v=${playingYtId}` : (playingUrl || null)
  const discogsExact = post.discogs_url || (post.discogs_id ? `https://www.discogs.com/release/${post.discogs_id}` : null)
  const discogsHref = discogsExact || `https://www.discogs.com/search/?${new URLSearchParams({ q: [artist, post.title].filter(Boolean).join(' '), type: 'all' })}`
  const buyHref = post.discogs_id ? `https://www.discogs.com/sell/release/${post.discogs_id}` : (platformOfUrl(post.stream_url) === 'bandcamp' ? post.stream_url : null)

  // Sleeve = the regular card's art size, unless the screen is too short to
  // fit the text block + byline under it inside the 120px padding.
  // Room reserved below the sleeve: badges + artist/title + metaline + the
  // big numeral (~290px) + byline — the numeral moved under the title.
  const stageH = `min(${d.artSize}px, calc(100vh - ${2 * (d.padY + FLOAT_INSET_Y) + 330}px))`
  const badge = { display: 'inline-block', fontFamily: d.labelFf, fontWeight: d.badgeWeight, fontSize: d.badgeSize, lineHeight: 1, letterSpacing: `${d.badgeLs}em`, textTransform: 'uppercase', padding: `${d.badgePy}px ${d.badgePx}px`, borderRadius: d.badgeRadius, textDecoration: 'none' }
  const half = Math.ceil(tracks.length / 2)
  const indexed = tracks.map((t, i) => ({ t, i }))
  const trackCol = list => (
    <div style={{ minWidth: 0 }}>
      {list.map(({ t, i }) => {
        const u = urlOf(t)
        const active = !!activeUrl && u === activeUrl
        return (
          <div key={i} onClick={() => { if (u) setActiveUrl(active ? null : u) }}
            style={{ display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr)', gap: 8, alignItems: 'baseline', padding: `${d.trackRowpad}px 0`, borderBottom: '1px solid var(--lv-line)', cursor: u ? 'pointer' : 'default', background: active ? 'color-mix(in srgb, var(--theme-accent) 14%, transparent)' : 'transparent' }}>
            <span style={{ fontFamily: d.monoFf, fontSize: d.tracknumSize, color: active ? 'var(--theme-accent)' : 'var(--lv-ter)' }}>{active ? '▶' : (t.position || i + 1)}</span>
            <span style={{ fontFamily: d.bodyFf, fontSize: d.trackSize, lineHeight: 1.3, color: active ? 'var(--lv-pri)' : 'var(--lv-sec)', fontWeight: active ? 600 : 400 }}>{t.title}</span>
          </div>
        )
      })}
    </div>
  )

  return (
    <div
      ref={el => { registerPostRef?.(post.id, el); cardRef.current = el }}
      style={{ position: 'relative', flexShrink: 0, width: d.cardW, height: '100%', background: cardBg, padding: `${d.padY}px ${d.bandPadX}px`, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'background 0.8s', color: 'var(--lv-pri)' }}
    >
      {/* top row: sleeve (the player takes its place) | post description,
          the same height as the sleeve and scrolling inside it */}
      <div style={{ display: 'flex', gap: 24, height: stageH, flexShrink: 0 }}>
        <div style={{ position: 'relative', height: '100%', aspectRatio: '1 / 1', flexShrink: 0, background: playingSrc ? '#000' : undefined, borderRadius: d.artRadius, overflow: 'hidden' /* same corners as post-card art */ }}>
          {playingSrc ? (
            <TrackPlayer key={playingSrc} src={playingSrc} title={post.title} autoplay onEnded={playNext} />
          ) : (
            <div onClick={() => firstUrl && setActiveUrl(firstUrl)}
              style={{ position: 'absolute', inset: 0, background: cover ? `#000 center/cover no-repeat url("${cover}")` : 'var(--theme-dark3)', cursor: firstUrl ? 'pointer' : 'default' }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: d.labelFf, fontWeight: 600, fontSize: d.zlabelSize, letterSpacing: `${d.zlabelLs}em`, textTransform: 'uppercase', color: 'var(--lv-ter)', marginBottom: d.zlabelMb, flexShrink: 0 }}>Post description</div>
          {note ? (
            <p ref={descRef} data-inner-scroll={descFit.overflows ? '' : undefined} onScroll={descFit.onScroll}
              style={{ fontSize: d.descSize, lineHeight: d.descLh, fontFamily: d.bodyFf, color: 'var(--lv-sec)', margin: 0, minHeight: 0, flex: '0 1 auto', overflowWrap: 'anywhere', whiteSpace: 'pre-line', overflowY: descFit.overflows ? 'auto' : 'hidden', paddingRight: descFit.overflows ? 6 : 0, ...INNER_SCROLL_STYLE, ...fadeMask(descFit) }}>{note}</p>
          ) : (
            <p style={{ fontSize: d.descSize, fontFamily: d.bodyFf, fontStyle: 'italic', color: 'var(--lv-ter)', margin: 0 }}>No description</p>
          )}
        </div>
      </div>

      {/* bottom row: badges, artist/title, metaline and the big post number
          under them ("lower orientation" numeral) | tracklist */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 24, marginTop: 24 }}>
        <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, flexShrink: 0 }}>
            <span style={{ ...badge, background: 'var(--theme-showcase)', color: '#fff' }}>{post.post_type || 'album'}</span>
            {playingPlatform && <a href={playingHref || undefined} target="_blank" rel="noopener noreferrer" style={{ ...badge, background: PLATFORM_COLORS[playingPlatform] || '#444', color: playingPlatform === 'beatport' ? '#000' : '#fff' }}>{playingPlatform}</a>}
            <a href={discogsHref} target="_blank" rel="noopener noreferrer" title={discogsExact ? 'Open release on Discogs' : 'Search Discogs'} style={{ ...badge, border: '1px solid var(--lv-line)', color: 'var(--lv-sec)' }}>◈ discogs</a>
            {buyHref && <a href={buyHref} target="_blank" rel="noopener noreferrer" style={{ ...badge, border: '1px solid var(--lv-line)', color: 'var(--lv-sec)' }}>buy ↗</a>}
          </div>
          <div style={{ flexShrink: 0, fontFamily: d.artistFf, fontWeight: d.artistWeight, fontSize: d.artistSize, lineHeight: d.artistLh, letterSpacing: `${d.artistLs}em`, textTransform: d.artistCase, marginTop: d.artistMt, color: 'var(--lv-pri)', wordBreak: 'break-word' }}>{artist || post.title}</div>
          <div style={{ flexShrink: 0, fontFamily: d.artistFf, fontStyle: 'italic', fontSize: d.titleSize, lineHeight: d.titleLh, letterSpacing: `${d.titleLs}em`, color: 'var(--lv-sec)', wordBreak: 'break-word' }}>{post.title}</div>
          <div style={{ flexShrink: 0, fontFamily: d.monoFf, fontSize: d.metalineSize, lineHeight: d.metalineLh, letterSpacing: `${d.metalineLs}em`, textTransform: 'uppercase', color: 'var(--lv-sec)', marginTop: d.metalineMt }}>{[label, catNo, post.year].filter(Boolean).join(' · ')}</div>
          <div aria-hidden="true" style={{ flexShrink: 0, margin: d.numeralMargin, marginTop: 12, fontFamily: d.numeralFf, fontWeight: d.numeralWeight, fontSize: d.numeralSize, lineHeight: d.numeralLh, letterSpacing: `${d.numeralLs}em`, opacity: d.numeralOpacity, color: 'var(--lv-pri)' }}>
            {String(post.id).padStart(2, '0')}
          </div>
        </div>

        <div ref={listRef} data-inner-scroll={listFit.overflows ? '' : undefined} onScroll={listFit.onScroll}
          style={{ minHeight: 0, overflowY: listFit.overflows ? 'auto' : 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18, alignContent: 'start', ...INNER_SCROLL_STYLE, ...fadeMask(listFit) }}>
          {trackCol(indexed.slice(0, half))}
          {trackCol(indexed.slice(half))}
        </div>
      </div>

      {/* byline — the regular card's byline sizes */}
      <div style={{ marginTop: d.bylineMt, display: 'flex', gap: 10, alignItems: 'baseline', flexShrink: 0 }}>
        <button onClick={() => setCommentsOpen(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: d.bodyFf, fontSize: d.metarowSize, color: 'var(--lv-ter)' }}>
          <span style={{ color: 'var(--theme-accent)', fontWeight: 700 }}>{commentCount}</span>&nbsp;replies
        </button>
        <span style={{ fontFamily: d.bodyFf, fontSize: d.handleSize, fontWeight: d.handleWeight, color: 'var(--lv-pri)' }}>{post.user?.username || post.username}</span>
        <span style={{ marginLeft: 'auto', fontFamily: d.monoFf, fontSize: d.stampSize, letterSpacing: `${d.stampLs}em`, color: 'var(--lv-ter)' }}>{timeAgo(post.created_at)}</span>
        {canModify && (
          <span style={{ display: 'flex', gap: 8, fontFamily: d.monoFf, fontSize: d.stampSize, letterSpacing: `${d.stampLs}em` }}>
            <button onClick={() => onEdit?.(post)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', letterSpacing: 'inherit', color: 'var(--lv-ter)' }}>edit</button>
            <button onClick={deletePost} disabled={deleting} style={{ background: 'none', border: 'none', padding: 0, cursor: deleting ? 'default' : 'pointer', font: 'inherit', letterSpacing: 'inherit', color: 'var(--theme-accent)', opacity: deleting ? 0.5 : 1 }}>{deleting ? 'deleting…' : 'delete'}</button>
          </span>
        )}
      </div>
      {commentsOpen && (
        <div style={{ marginTop: 8, flexShrink: 0 }}>
          <CommentThread postId={post.id} onCountChange={setCommentCount} d={d} />
        </div>
      )}
    </div>
  )
}

// ── Spotlight card — two variants (artist / label) ─────────────────────────────
// Purely client-side now — see buildSpotlightPool/buildShelfItems below.
// `subject` is derived from posts already loaded in this fetch; nothing is
// written to the backend and nothing here is a real post.id. Built on the
// same rail/media anatomy as PostCard (DESIGN_BASE.cardW/cardH), not the
// per-post design table, and no plate numeral — a numeral read as "this
// post's index," which doesn't apply to something that isn't a post. Each
// type gets its own mark in that spot instead: a sunburst for artists, a
// vinyl label-disc for labels — a distinct silhouette per type at a glance.

const SPOTLIGHT_MARK = {
  artist: (
    <svg width="110" height="110" viewBox="0 0 100 100" style={{ color: 'var(--theme-text-pri)' }}>
      <circle cx="50" cy="50" r="9" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
        <line x1="50" y1="18" x2="50" y2="2" />
        <line x1="50" y1="82" x2="50" y2="98" />
        <line x1="18" y1="50" x2="2" y2="50" />
        <line x1="82" y1="50" x2="98" y2="50" />
        <line x1="27" y1="27" x2="15" y2="15" />
        <line x1="73" y1="73" x2="85" y2="85" />
        <line x1="73" y1="27" x2="85" y2="15" />
        <line x1="27" y1="73" x2="15" y2="85" />
      </g>
    </svg>
  ),
  label: (
    <svg width="110" height="110" viewBox="0 0 100 100" style={{ color: 'var(--theme-text-pri)' }}>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <circle cx="50" cy="50" r="7" style={{ fill: 'var(--theme-showcase)' }} stroke="currentColor" strokeWidth="3" />
    </svg>
  ),
  // Channel spotlight mark — an EQ-bar silhouette rather than the sunburst
  // (artist) or label-disc (label), echoing the same live-EQ language as
  // Strip.jsx's #lnv-fbars idle bounce (see index.css's eqBounce comment) so
  // "channel" reads as live/broadcast at a glance, not as a third flavour of
  // the same mark.
  channel: (
    <svg width="110" height="110" viewBox="0 0 100 100" style={{ color: 'var(--theme-text-pri)' }}>
      <g stroke="currentColor" strokeWidth="8" strokeLinecap="round">
        <line x1="20" y1="65" x2="20" y2="35" />
        <line x1="38" y1="80" x2="38" y2="20" />
        <line x1="56" y1="90" x2="56" y2="10" opacity="0.9" />
        <line x1="74" y1="72" x2="74" y2="28" />
        <line x1="92" y1="58" x2="92" y2="42" />
      </g>
    </svg>
  ),
}

// Finds the Discogs id for a spotlighted subject from whatever posts
// carried it (post_artists.discogs_artist_id / post_labels.discogs_label_id,
// already present on every post the feed returns — see getFullPost).
// Used to fetch an artist photo / label logo below; returns null when no
// loaded post has one, which is common (plenty of posts are hand-entered
// without a Discogs link).
function subjectDiscogsId(subject) {
  // Channels aren't a Discogs entity — no artist/label id to look up, so
  // SpotlightCard falls straight through to SPOTLIGHT_MARK.channel below.
  if (subject.type === 'channel') return null
  for (const p of subject.posts) {
    if (subject.type === 'artist') {
      const m = (p.artists || []).find(a => a.artist_name === subject.name)
      if (m?.discogs_artist_id) return m.discogs_artist_id
    } else {
      const m = (p.labels || []).find(l => l.label_name === subject.name)
      if (m?.discogs_label_id) return m.discogs_label_id
    }
  }
  return null
}

// A channel's catalogue key. Artists and labels resolve theirs to a Discogs
// id (above); a channel isn't a Discogs entity, so its back catalogue comes
// from the YouTube channel's own uploads instead — and the backend resolves
// that from a VIDEO rather than the channel's free-text name (posts only ever
// store `channel` as a label like "HÖR"). Any one of this channel's posts with
// a YouTube stream url is an exact, 3-quota-unit answer; see
// getChannelUploads in backend/services/youtubeService.js.
function subjectChannelVideoUrl(subject) {
  if (subject.type !== 'channel') return null
  for (const p of subject.posts) {
    const url = postStreamUrl(p)
    if (url && /youtube\.com|youtu\.be/.test(url)) return url
  }
  return null
}

// Video id out of a YouTube url — used to match a channel's uploads against
// the sets already posted to LNV, the way discogs_id does for releases.
function ytIdOf(url) {
  return (url || '').match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1] || null
}

// SPOTLIGHT CARD SIDE PADDING — change this one number to adjust every
// spotlight card (artist/label/channel) at once. Flat px, same on all
// cards regardless of width — NOT a percentage (that was tried on
// 2026-08-25 via `ART_INSET = (100 - DESIGN_BASE.artFill) / 2`, matching
// PostCard's 80%-art-fill convention, but at the real 800px card width
// that worked out to 80px/side — much bigger than intended, so it was
// reverted back to a flat value here). Applies to the whole card (badge,
// name, metaline, media, caption, list, cta all share this one inset via
// the root div's `padding: 65px ${SPOTLIGHT_PAD}px`), not just the media.
const SPOTLIGHT_PAD = 60

// 2026-08-26: the TEMP placeholder discography arrays that used to sit here
// (PLACEHOLDER_ON_SITE / PLACEHOLDER_NOT_YET, added 2026-08-25 because every
// post_artists.discogs_artist_id and post_labels.discogs_label_id in the DB
// was NULL) are gone. ComposeModal now keeps real ids, and a subject with no
// catalogue key falls through to a grid of its own real LNV posts — a better
// empty state than fake rows, and it can't mask a broken fetch the way the
// placeholders could.

function SpotlightCard({ subject, cardBg, cardKey, onCreateFromDiscogs }) {
  const { registerPostRef, openD3 } = useLayout() || {}
  const { type, name, posts } = subject
  // Artists and labels have a real browse page behind them (ContentPanel's
  // 'artists'/'labels' drawers). Channels don't yet — no Channels page
  // exists — so the title/"view all" click-through is disabled for that
  // type rather than opening a drawer with nothing in it.
  const browsable = type !== 'channel'

  // Artist headshot / label logo, when Discogs has one — falls back to
  // SPOTLIGHT_MARK below when there's no discogs id on any loaded post, the
  // fetch fails, or Discogs simply has no image for that artist/label
  // (the common case). Backend caches the Discogs response for 30 days;
  // staleTime here just avoids re-fetching within this session.
  const discogsId = subjectDiscogsId(subject)
  const { data: discogsProfile } = useQuery({
    queryKey: ['spotlight-media', type, discogsId],
    queryFn: async () => {
      const res = await fetch(`${API}/discogs/${type}/${discogsId}`)
      if (!res.ok) return null
      return res.json()
    },
    enabled: !!discogsId,
    staleTime: Infinity,
  })

  // ── Catalogue — one code path, three sources ──────────────────────────────
  // 2026-08-26 (per gabriel): all three subject types get a back catalogue,
  // each from where that kind of subject actually keeps one:
  //
  //   artist  -> Discogs  GET /api/discogs/artist/:id/releases
  //   label   -> Discogs  GET /api/discogs/label/:id/releases
  //   channel -> YouTube  GET /api/media/channel-uploads?videoUrl=...
  //
  // The two Discogs endpoints and the YouTube one deliberately return the same
  // shape ({ releases: [{ id, title, year, thumb }], pagination: { items } }),
  // so everything below this point is type-agnostic apart from three things:
  // what counts as "already on the site", what a click reveals (a tracklist
  // for a release, a player for a set), and which url the "add to feed" button
  // hands to ComposeModal.
  //
  // Supersedes the 08-25 "labels only" narrowing and the 08-25 placeholder
  // arrays. A subject with no catalogue KEY at all — an artist/label whose
  // posts carry no Discogs id, a channel with no YouTube post — still falls
  // through to the grid of its own real LNV posts further down, which is the
  // fallback gabriel's mockup review established for artists.
  //
  // Both list endpoints are lean (no tracklist/videos); ONE release's full
  // detail is fetched lazily, only once the user picks it, so a label with a
  // 300-release catalogue still costs one request to open.
  const channelVideoUrl = subjectChannelVideoUrl(subject)
  const catalogueKey = type === 'channel' ? channelVideoUrl : discogsId
  const hasCatalogue = !!catalogueKey

  // Index state (see the PIC-style layout note above the return): which row
  // is open, which track is embedded (only ever one iframe), whether the
  // sleeve strip is paused (hover), and per-track YouTube lookups done on
  // click ('none' / 'capped' when nothing came back).
  const [openKey, setOpenKey] = useState(null)
  const [playing, setPlaying] = useState(null)
  const [searching, setSearching] = useState(null)
  const [foundUrls, setFoundUrls] = useState({})
  const [stripPaused, setStripPaused] = useState(false)
  const listRef = useRef(null)
  const rowRefs = useRef(new Map())
  const rowKeyOf = r => `${r.type || 'release'}:${r.id}`

  const { data: catalogue } = useQuery({
    queryKey: ['spotlight-catalogue', type, catalogueKey],
    queryFn: async () => {
      const url = type === 'channel'
        ? `${API}/media/channel-uploads?videoUrl=${encodeURIComponent(channelVideoUrl)}&limit=24`
        : `${API}/discogs/${type}/${catalogueKey}/releases`
      const res = await fetch(url)
      if (!res.ok) return null
      return res.json()
    },
    enabled: hasCatalogue,
    staleTime: Infinity,
  })

  // Catalogue entries already posted to LNV sort to the top, ahead of
  // everything not yet uploaded. For artists/labels that's a Discogs release
  // id match; for channels it's a YouTube video id match against the sets
  // already in the feed. Only checked against `posts` — the loaded feed
  // window, not a DB-wide query — so something posted outside the currently
  // loaded ~60 posts won't be flagged even if it really is on the site.
  // One entry per type+id: Discogs repeats a release once per artist role,
  // and a master and a release can share a numeric id. (The backend merges
  // these now too; this also covers discographies cached before it did.)
  const allReleases = [...new Map((catalogue?.releases || []).map(r => [`${r.type || 'release'}:${r.id}`, r])).values()]
  const onSiteIds = new Set(
    type === 'channel'
      ? posts.map(p => ytIdOf(postStreamUrl(p))).filter(Boolean)
      : posts.map(p => p.discogs_id).filter(Boolean)
  )
  // posts.discogs_id is always a RELEASE id, so a master never counts as on-site.
  const isOnSite = r => r.type !== 'master' && onSiteIds.has(r.id)
  const onSiteItems = allReleases.filter(isOnSite)
  const notYetItems = allReleases.filter(r => !isOnSite(r))
  const catalogueItems = [...onSiteItems, ...notYetItems]
  // The open row's catalogue entry (null when nothing's open, or when the
  // rows are this subject's own posts rather than a catalogue).
  const selectedRelease = catalogueItems.find(r => rowKeyOf(r) === openKey) || null

  // Release detail — artists and labels only. A channel's entry is a video:
  // there's no tracklist to fetch, the reveal is the player itself.
  // 2026-09-26: an artist's Discogs list mixes releases and MASTERS (one
  // entry grouping every pressing). A master id fetched as a release is a
  // different, unrelated record — "Buck Bumble OST" opened "The Throne Of
  // Drones". Masters now resolve to their main release first (cached
  // backend hop, resolveDiscogsUrl), so the tracklist, saved links and
  // "+ add to feed" all refer to a real pressing of THAT record.
  const { data: selectedFull } = useQuery({
    queryKey: ['spotlight-release', selectedRelease?.type || 'release', selectedRelease?.id],
    queryFn: async () => {
      let id = selectedRelease.id
      if (selectedRelease.type === 'master') {
        const r = await fetch(`${API}/discogs/resolve-url?url=${encodeURIComponent(`https://www.discogs.com/master/${id}`)}`)
        const d = await r.json().catch(() => ({}))
        if (!d.releaseId) return null
        id = d.releaseId
      }
      const res = await fetch(`${API}/discogs/release/${id}`)
      if (!res.ok) return null
      return res.json()
    },
    enabled: type !== 'channel' && !!selectedRelease,
    staleTime: Infinity,
  })
  // YouTube links already found for this release's tracks (saved per
  // release + position by the backend — see release_track_links), so a
  // track clicked once plays instantly next time and known misses show "—"
  // without searching again.
  const queryClient = useQueryClient()
  // The real release the open row's tracks belong to (a master's main
  // release, or the release itself).
  const trackReleaseId = selectedFull?.discogsId || null
  const { data: savedLinks } = useQuery({
    queryKey: ['release-track-links', trackReleaseId],
    queryFn: async () => {
      const res = await fetch(`${API}/discogs/release/${trackReleaseId}/track-links`)
      if (!res.ok) return { links: {} }
      return res.json()
    },
    enabled: type !== 'channel' && !!trackReleaseId,
    staleTime: Infinity,
  })
  const selectedOnSite = !!selectedRelease && onSiteIds.has(selectedRelease.id)
  // What "add this to the feed" means per type — ComposeModal's initialUrl
  // pipeline takes any supported platform url, so a channel's uploads can be
  // added straight from here the same way a Discogs release can.
  const addUrl = !selectedRelease
    ? null
    : type === 'channel'
      ? (selectedRelease.url || `https://www.youtube.com/watch?v=${selectedRelease.id}`)
      : `https://www.discogs.com/${selectedRelease.type === 'master' ? 'master' : 'release'}/${selectedRelease.id}`
  const catalogueSource = type === 'channel' ? 'YouTube' : 'Discogs'

  // Artist headshot / label logo from Discogs, or — for channels, which have
  // no Discogs profile to fetch — the YouTube channel avatar that came back
  // with the uploads. Falls through to SPOTLIGHT_MARK when there's nothing,
  // which is the common case for artists.
  const markImageUrl = discogsProfile?.imageUrl
    || (type === 'channel' ? catalogue?.channel?.thumb : null)
    || null

  const textPri = 'var(--theme-text-pri)'
  const textSec = 'var(--theme-text-sec)'
  const textTer = 'var(--theme-text-ter)'
  const divider = 'var(--theme-border)'
  // Literal font stacks pulled straight from DESIGN_BASE (bodyFf/artistFf,
  // labelFf) so this card uses exactly the same fonts as PostCard rather
  // than falling back to the browser default — there's no global
  // font-family rule in this app, PostCard sets it per-element, and every
  // text node here needs to do the same.
  // 2026-09-26 (gabriel): type is uniform with the post cards — every size,
  // weight and family below comes from DESIGN_BASE (badge, artist, metaline,
  // zone label, track, desc, meta-row, stamp tokens). VT323 is gone here.
  const T = DESIGN_BASE
  const BODY_FF = T.bodyFf
  const LABEL_FF = T.labelFf
  const msgText = { fontFamily: T.bodyFf, fontSize: T.descSize, fontStyle: 'italic', color: 'var(--theme-text-ter)' }
  const postsLine = `${posts.length} ${type === 'channel' ? 'live set' : 'post'}${posts.length !== 1 ? 's' : ''} in the feed`

  // 2026-09-25 — Studio PIC-style index (gabriel's reference:
  // awwwards.com/inspiration/list-and-grid-view-studio-pic). Replaces the
  // 08-25/08-26 stacked layout (sleeve grid that flipped to a tracklist, plus
  // a separate picker list). Now, for all three subject types:
  //   header  — name in large type with the catalogue count in superscript
  //   strip   — every sleeve drifting slowly left in an endless loop
  //             (lnv-marquee in index.css); hover pauses it, a click opens
  //             that release's row
  //   index   — numbered rows (no · title · artist-or-label · catno · year);
  //             a click inverts the row and opens it: releases show their
  //             tracklist (each track playable in place), channel uploads
  //             open straight into the player
  //   cta     — unchanged (+ add to feed / view all)
  // Rows come from the catalogue when there is one, otherwise from this
  // subject's own LNV posts, so every spotlight gets the same anatomy.
  const rows = hasCatalogue
    ? catalogueItems.map(r => ({
        key: rowKeyOf(r),
        kind: type === 'channel' ? 'video' : 'release',
        id: r.id,
        title: r.title || '',
        sub: type === 'label' ? (r.artist || '') : (r.label || r.role || ''),
        catno: r.catno || '',
        year: r.year || '',
        thumb: r.thumb || '',
        onSite: isOnSite(r),
      }))
    : posts.map(p => ({
        key: `post:${p.id}`,
        kind: 'post',
        id: p.id,
        title: p.title || '',
        sub: type === 'label' ? artistName(p) : labelName(p),
        catno: p.labels?.[0]?.catalogue_number || '',
        year: p.year || '',
        thumb: coverSrc(p),
        onSite: true,
        post: p,
      }))
  const openRow = rows.find(r => r.key === openKey) || null
  const stripItems = rows.filter(r => r.thumb).slice(0, 40)

  // Full-size sleeves for the strip. Discogs list thumbs are 150px (and
  // signed, so no bigger size can be asked for); the backend returns the
  // 600px covers it has cached and fetches the rest slowly in the background
  // (GET /discogs/covers). Re-asked every 5s while any are still pending;
  // the 150px thumb shows until each one arrives.
  const coverKeys = hasCatalogue && type !== 'channel' ? stripItems.map(r => r.key) : []
  const { data: coverData } = useQuery({
    queryKey: ['spotlight-covers', coverKeys.join(',')],
    queryFn: async () => {
      const res = await fetch(`${API}/discogs/covers?keys=${encodeURIComponent(coverKeys.join(','))}`)
      return res.ok ? res.json() : { covers: {}, pending: 0 }
    },
    enabled: coverKeys.length > 0,
    staleTime: Infinity,
    refetchInterval: q => (q.state.data?.pending > 0 ? 5000 : false),
  })

  // Tracks for the open row, each with the best link we already have:
  // Discogs' own videos (matched by title), then the tracks of a post that
  // already carries this release. Anything still empty is searched on
  // click (playTrack) — one capped, cached YouTube search, never up front.
  const normT = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const onSitePost = openRow?.kind === 'release' ? posts.find(p => p.discogs_id === (trackReleaseId || openRow.id)) : null
  const openTracks = !openRow ? []
    : openRow.kind === 'post'
      ? (openRow.post.tracks || []).map(t => ({ position: t.position, title: t.title, duration: t.duration, url: t.stream_url || t.youtube_url || '' }))
      : openRow.kind === 'release'
        ? (selectedFull?.tracklist || []).map(t => {
            const tt = normT(t.title)
            const video = tt && (selectedFull.videos || []).find(v => /youtu/.test(v.url || '') && normT(v.title).includes(tt))
            const posted = tt && (onSitePost?.tracks || []).find(pt => normT(pt.title) === tt)
            const saved = savedLinks?.links?.[t.position]
            return { position: t.position, title: t.title, duration: t.duration, artists: t.artists, url: video?.url || posted?.stream_url || posted?.youtube_url || saved?.url || '', knownMiss: !!saved && !saved.url }
          })
        : []

  // Returns 'played' | 'none' | 'capped' | 'busy' so playNextFrom can chain.
  async function playTrack(t, i) {
    const trackKey = `${openKey}#${i}`
    if (t.url) { setPlaying(p => (p?.key === trackKey ? null : { key: trackKey, url: t.url })); return 'played' }
    if (searching === trackKey) return 'busy'
    setSearching(trackKey)
    try {
      const artist = (t.artists || []).map(a => a.name).join(' ')
        || (type === 'artist' ? name : type === 'label' ? openRow?.sub : '') || ''
      const q = new URLSearchParams({ artist, title: t.title || '', label: type === 'label' ? name : '' })
      if (openRow?.kind === 'release' && trackReleaseId && t.position) { q.set('release_id', trackReleaseId); q.set('position', t.position) }
      const r = await fetch(`${API}/discogs/youtube/search?${q}`)
      const d = await r.json()
      if (openRow?.kind === 'release' && trackReleaseId && t.position && !d.capped) {
        queryClient.setQueryData(['release-track-links', trackReleaseId], old => ({ links: { ...(old?.links || {}), [t.position]: { url: d.youtube_url || null, title: d.youtube_title || null } } }))
      }
      if (d.youtube_url) {
        setFoundUrls(m => ({ ...m, [trackKey]: d.youtube_url }))
        setPlaying({ key: trackKey, url: d.youtube_url })
        return 'played'
      }
      setFoundUrls(m => ({ ...m, [trackKey]: d.capped ? 'capped' : 'none' }))
      return d.capped ? 'capped' : 'none'
    } catch {
      setFoundUrls(m => ({ ...m, [trackKey]: 'none' }))
      return 'none'
    } finally {
      setSearching(null)
    }
  }

  // Album play-through: when track i ends, play the next track that has (or
  // can get) a link. Known misses are skipped; tracks with no link yet are
  // searched on the fly, at most 3 per step so a run of missing tracks can't
  // drain the daily YouTube quota. Stops at the end of the album or the cap.
  async function playNextFrom(i) {
    let searches = 0
    for (let j = i + 1; j < openTracks.length; j++) {
      const t = openTracks[j]
      const found = foundUrls[`${openKey}#${j}`]
      const url = t.url || (found && found !== 'none' && found !== 'capped' ? found : '')
      if (url) { setPlaying({ key: `${openKey}#${j}`, url }); return }
      if (t.knownMiss || found === 'none') continue
      if (found === 'capped' || searches >= 3) return
      searches++
      const res = await playTrack(t, j)
      if (res === 'played' || res === 'capped') return
    }
  }

  function toggleRow(key) {
    setPlaying(null)
    setOpenKey(k => (k === key ? null : key))
  }
  // From the strip: open the row and bring it into view inside the list —
  // by setting the list's own scrollTop, not scrollIntoView, which would
  // also drag the horizontal feed.
  function openFromStrip(key) {
    setPlaying(null)
    setOpenKey(key)
    requestAnimationFrame(() => {
      const list = listRef.current, row = rowRefs.current.get(key)
      if (list && row) list.scrollTop = row.offsetTop - list.offsetTop - 4
    })
  }

  const count = hasCatalogue && catalogue ? (catalogue.pagination?.items ?? rows.length) : rows.length
  const STRIP_H = 240
  const COLS = '30px minmax(0, 1.7fr) minmax(0, 1fr) 84px 38px 14px'
  const rowText = { fontFamily: T.bodyFf, fontSize: T.trackSize, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const monoText = { ...rowText, fontFamily: T.monoFf, fontSize: T.tracknumSize, letterSpacing: `${T.stampLs}em`, fontVariantNumeric: 'tabular-nums' }

  return (
    <div
      ref={el => registerPostRef?.(cardKey, el)}
      style={{ flexShrink: 0, width: liveCardWidth() /* same width as live-set cards */, height: '100%', background: cardBg, display: 'flex', flexDirection: 'column', padding: `32px ${SPOTLIGHT_PAD}px` /* was 65px; trimmed floating card, see FLOAT_INSET_Y */, overflow: 'hidden', transition: 'background 0.8s' }}
    >
      {/* header — tag + mark, then the name at index scale with its count */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ fontSize: T.badgeSize, fontWeight: T.badgeWeight, letterSpacing: `${T.badgeLs}em`, padding: `${T.badgePy}px ${T.badgePx}px`, borderRadius: T.badgeRadius, background: 'var(--theme-accent)', color: '#fff', fontFamily: T.labelFf, textTransform: 'uppercase' }}>{type} spotlight</span>
        <div style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {markImageUrl ? (
            <img src={markImageUrl} alt="" style={{ width: 44, height: 44, borderRadius: type === 'label' ? 8 : '50%', objectFit: type === 'label' ? 'contain' : 'cover' }} />
          ) : <div style={{ transform: 'scale(0.42)', transformOrigin: 'center' }}>{SPOTLIGHT_MARK[type]}</div>}
        </div>
      </div>
      <div
        onClick={browsable ? () => openD3?.(type === 'artist' ? 'artists' : 'labels', { filter: name }) : undefined}
        style={{ flexShrink: 0, marginTop: T.artistMt, fontSize: T.artistSize, fontWeight: T.artistWeight, lineHeight: T.artistLh, letterSpacing: `${T.artistLs}em`, textTransform: T.artistCase, color: textPri, fontFamily: T.artistFf, cursor: browsable ? 'pointer' : 'default', wordBreak: 'break-word' }}
      >
        {name}<sup style={{ fontFamily: T.monoFf, fontSize: T.metalineSize, fontWeight: 400, letterSpacing: `${T.metalineLs}em`, marginLeft: 6, verticalAlign: 'super', color: textSec }}>[{count}]</sup>
      </div>
      <div style={{ flexShrink: 0, marginTop: T.metalineMt, fontFamily: T.monoFf, fontSize: T.metalineSize, lineHeight: T.metalineLh, letterSpacing: `${T.metalineLs}em`, textTransform: 'uppercase', color: textSec }}>
        {hasCatalogue
          ? (catalogue === undefined ? `${postsLine} · pulling the ${catalogueSource} catalogue…` : `${postsLine} · ${count} on ${catalogueSource}`)
          : postsLine}
      </div>

      {/* sleeve strip */}
      <div
        onMouseEnter={() => setStripPaused(true)}
        onMouseLeave={() => setStripPaused(false)}
        style={{ flexShrink: 0, marginTop: 18, height: STRIP_H, overflow: 'hidden', marginLeft: -SPOTLIGHT_PAD, marginRight: -SPOTLIGHT_PAD, maskImage: 'linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)' }}
      >
        {stripItems.length > 0 ? (
          <div
            className="lnv-marquee-track"
            style={{ display: 'flex', width: 'max-content', height: '100%', animation: `lnv-marquee ${Math.max(30, stripItems.length * 6)}s linear infinite`, animationPlayState: stripPaused ? 'paused' : 'running' }}
          >
            {[...stripItems, ...stripItems].map((r, i) => (
              <div key={`${r.key}~${i}`} onClick={() => openFromStrip(r.key)} title={r.title}
                style={{ paddingRight: 8, height: '100%', flexShrink: 0, cursor: 'pointer' }}>
                <div style={{ width: type === 'channel' ? Math.round(STRIP_H * 16 / 9) : STRIP_H, height: '100%', background: 'var(--theme-dark3)', overflow: 'hidden', borderRadius: DESIGN_BASE.artRadius /* same corners as post-card art */, outline: r.key === openKey ? '2px solid var(--theme-accent)' : 'none', outlineOffset: -2 }}>
                  <img src={coverData?.covers?.[r.key] || (r.kind === 'release' && queryClient.getQueryData(['spotlight-release', r.key.startsWith('master:') ? 'master' : 'release', r.id])?.coverImage) || r.thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...msgText }}>
            {hasCatalogue && catalogue === undefined ? 'fetching catalogue…' : 'no sleeves to show'}
          </div>
        )}
      </div>

      {/* index */}
      <div style={{ flexShrink: 0, marginTop: 18, display: 'grid', gridTemplateColumns: COLS, gap: 10, padding: '0 6px 6px', borderBottom: `1px solid ${textPri}` }}>
        {['No', 'Title', type === 'label' ? 'Artist' : 'Label', 'Cat', 'Year', ''].map((h, i) => (
          <span key={i} style={{ ...rowText, fontFamily: T.labelFf, fontWeight: 600, fontSize: T.zlabelSize, letterSpacing: `${T.zlabelLs}em`, textTransform: 'uppercase', color: textTer }}>{h}</span>
        ))}
      </div>
      <div ref={listRef} data-inner-scroll="" style={{ flex: 1, minHeight: 0, overflowY: 'auto', ...INNER_SCROLL_STYLE }}>
        {rows.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', ...msgText }}>
            {hasCatalogue && catalogue === undefined ? 'fetching catalogue…' : `nothing found on ${catalogueSource}`}
          </div>
        )}
        {rows.map((r, idx) => {
          const open = r.key === openKey
          return (
            <div key={r.key} ref={el => { if (el) rowRefs.current.set(r.key, el); else rowRefs.current.delete(r.key) }}>
              <div
                onClick={() => toggleRow(r.key)}
                style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '6px 6px', borderBottom: `1px solid ${divider}`, cursor: 'pointer', background: open ? textPri : 'transparent', color: open ? cardBg : textPri, transition: 'background 0.15s, color 0.15s' }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'color-mix(in srgb, var(--theme-accent) 10%, transparent)' }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={monoText}>{String(idx + 1).padStart(2, '0')}</span>
                <span style={{ ...rowText, fontWeight: 500 }}>
                  {r.onSite && hasCatalogue && <span title="on LNV" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--theme-accent)', marginRight: 6, verticalAlign: 'middle' }} />}
                  {r.title}
                </span>
                <span style={rowText}>{r.sub}</span>
                <span style={monoText}>{r.catno}</span>
                <span style={monoText}>{r.year}</span>
                <span style={{ ...rowText, textAlign: 'right' }}>{open ? '▴' : '▾'}</span>
              </div>

              {open && (
                <div style={{ padding: '10px 6px 14px', borderBottom: `1px solid ${divider}` }}>
                  {/* A channel upload, or one of this subject's own posts that
                      has no tracklist (a live set), opens straight into its
                      player — there's nothing to list. */}
                  {(r.kind === 'video' || (r.kind === 'post' && !(r.post.tracks || []).length)) ? (() => {
                    const src = r.kind === 'video'
                      ? `https://www.youtube.com/embed/${r.id}?rel=0&modestbranding=1&color=white`
                      : (toEmbedSrc(postStreamUrl(r.post)) || (/bandcamp\.com\/EmbeddedPlayer/.test(r.post.embed_url || '') ? r.post.embed_url : null))
                    return src ? (
                      <div style={{ width: '100%', aspectRatio: '16 / 9', maxHeight: 260, borderRadius: DESIGN_BASE.artRadius, overflow: 'hidden' }}>
                        <iframe key={src} src={src}
                          style={{ width: '100%', height: '100%', border: 'none' }}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen title={r.title} />
                      </div>
                    ) : <div style={{ ...msgText, padding: '6px 0' }}>no player for this link</div>
                  })() : (
                    <>
                      {r.kind === 'release' && !selectedFull ? (
                        <div style={{ ...msgText, padding: '6px 0' }}>fetching tracklist…</div>
                      ) : openTracks.length === 0 ? (
                        <div style={{ ...msgText, padding: '6px 0' }}>no tracklist</div>
                      ) : openTracks.map((t, i) => {
                        const trackKey = `${openKey}#${i}`
                        const found = foundUrls[trackKey]
                        const url = t.url || (found && found !== 'none' && found !== 'capped' ? found : '')
                        const isPlaying = playing?.key === trackKey
                        const miss = found === 'none' || (t.knownMiss && !url)
                        const state = searching === trackKey ? '…' : miss ? '—' : found === 'capped' ? '×' : isPlaying ? '▶' : '▷'
                        return (
                          <div key={i}>
                          <div onClick={() => { if (!miss) playTrack({ ...t, url }, i) }}
                            title={miss ? 'no YouTube link found' : found === 'capped' ? "today's YouTube search limit is reached" : url ? 'play' : 'find on YouTube and play'}
                            style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr) 48px 16px', gap: 10, alignItems: 'baseline', padding: '4px 0', borderBottom: `1px dotted ${divider}`, cursor: miss ? 'default' : 'pointer', background: isPlaying ? 'color-mix(in srgb, var(--theme-accent) 14%, transparent)' : 'transparent' }}>
                            <span style={{ ...monoText, color: textTer }}>{t.position || i + 1}</span>
                            <span style={{ ...rowText, color: isPlaying ? textPri : textSec, fontWeight: isPlaying ? 600 : 400 }}>{t.title}</span>
                            <span style={{ ...monoText, color: textTer, textAlign: 'right' }}>{t.duration || ''}</span>
                            <span style={{ ...monoText, color: isPlaying ? 'var(--theme-accent)' : textTer, textAlign: 'right' }}>{state}</span>
                          </div>
                          {/* The player opens right under the track that was clicked. */}
                          {isPlaying && toEmbedSrc(playing.url) && (
                            <div style={{ width: '100%', aspectRatio: '16 / 9', maxHeight: 240, margin: '8px 0 10px', borderRadius: DESIGN_BASE.artRadius, overflow: 'hidden' }}>
                              <TrackPlayer key={playing.url} src={toEmbedSrc(playing.url)} title={t.title}
                                autoplay onEnded={() => playNextFrom(i)} />
                            </div>
                          )}
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* cta row — unchanged behaviour: "+ add to feed" for an open
          catalogue entry that isn't on LNV yet, otherwise "view all →". */}
      <div style={{ flexShrink: 0, marginTop: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {hasCatalogue && selectedRelease && !selectedOnSite ? (
          <button
            onClick={() => addUrl && onCreateFromDiscogs?.(addUrl)}
            style={{ background: 'var(--theme-accent)', border: 'none', borderRadius: 20, padding: '7px 18px', color: '#fff', fontFamily: T.labelFf, fontWeight: T.badgeWeight, fontSize: T.metarowSize, letterSpacing: `${T.badgeLs}em`, textTransform: 'uppercase', cursor: 'pointer' }}
          >+ add to feed</button>
        ) : browsable ? (
          <span onClick={() => openD3?.(type === 'artist' ? 'artists' : 'labels', { filter: name })} style={{ fontSize: T.metarowSize, fontWeight: 600, cursor: 'pointer', color: 'var(--theme-accent)', fontFamily: T.bodyFf, borderBottom: '1px dotted currentColor' }}>view all →</span>
        ) : <span />}
        <span style={{ fontSize: T.stampSize, letterSpacing: `${T.stampLs}em`, fontFamily: T.monoFf, color: textSec }}>LNV · editorial</span>
      </div>
    </div>
  )
}

// ── Spotlight pool + shelf items ────────────────────────────────────────────────
// Spotlights are computed entirely client-side from whatever posts this
// fetch returned — no backend involvement (see the 2026-08-24 spotlight
// rework notes: this replaces the old triggerSpotlights/is_spotlight DB
// model). A subject (artist or label) is eligible once it has at least
// SPOTLIGHT_MIN_POSTS posts in the currently loaded set. The pool is
// shuffled once per fresh load (buildShelfItems only re-runs when the
// fetched post-id signature changes, see Feed()), then handed out in order
// to each spotlight slot — every SPOTLIGHT_EVERYth real post — so a load
// never repeats a subject until the whole pool's been used once.

// TEMP (2026-08-26): synthetic placeholder channel subject, purely so
// gabriel can see the ChannelGrid layout live in his own feed before any
// real channel data exists (no post currently carries a `channel` name +
// `is_live_mix`/video format together — see channelName()/detectType()
// above). Same convention as PLACEHOLDER_ON_SITE/_NOT_YET: negative ids,
// clearly-labeled placeholder title, no real cover/stream so the grid
// tiles render as plain labeled squares rather than a broken image/embed.
// DELETE this block and its push into `pool` below once real live-set
// posts with channel names exist to spotlight instead — gabriel's already
// flagged the whole feed gets wiped when post/search testing starts, so
// this can go the same day.
const PLACEHOLDER_CHANNEL_NAME = 'Placeholder Channel'
const PLACEHOLDER_CHANNEL_POSTS = [
  { id: -101, title: 'Placeholder — Set A', channel: PLACEHOLDER_CHANNEL_NAME, is_live_mix: true, format: 'video', created_at: new Date(Date.now() - 1 * 86400000).toISOString() },
  { id: -102, title: 'Placeholder — Set B', channel: PLACEHOLDER_CHANNEL_NAME, is_live_mix: true, format: 'video', created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
  { id: -103, title: 'Placeholder — Set C', channel: PLACEHOLDER_CHANNEL_NAME, is_live_mix: true, format: 'video', created_at: new Date(Date.now() - 6 * 86400000).toISOString() },
  { id: -104, title: 'Placeholder — Set D', channel: PLACEHOLDER_CHANNEL_NAME, is_live_mix: true, format: 'video', created_at: new Date(Date.now() - 9 * 86400000).toISOString() },
]

function buildSpotlightPool(posts) {
  const byArtist = new Map()
  const byLabel = new Map()
  const byChannel = new Map()
  for (const p of posts) {
    const a = artistName(p)
    if (a && !isVariousArtist(a)) { if (!byArtist.has(a)) byArtist.set(a, []); byArtist.get(a).push(p) }
    const l = labelName(p)
    if (l) { if (!byLabel.has(l)) byLabel.set(l, []); byLabel.get(l).push(p) }
    // Channel only makes sense for live sets — a channel name on a regular
    // album post would be stale/copy-pasted data, not a real signal.
    if (detectType(p) === 'livemix') {
      const c = channelName(p)
      if (c) { if (!byChannel.has(c)) byChannel.set(c, []); byChannel.get(c).push(p) }
    }
  }
  const pool = []
  for (const [name, ps] of byArtist) {
    if (ps.length >= SPOTLIGHT_MIN_POSTS) { pool.push({ type: 'artist', name, posts: ps }); continue }
    // "Unknown artist" Discogs backfill (2026-08-25): exactly one post for
    // this artist in the currently loaded feed — as close to "they've never
    // posted before" as this client-side, loaded-feed-only model can tell
    // (same caveat as the rest of this pool: it's the loaded ~60 posts, not
    // a true site-wide count). Only eligible if that post carries a Discogs
    // artist id, since without one there's no discography to backfill with —
    // see SpotlightCard, which fetches it and fills "Recent adds" with their
    // Discogs releases instead of (nonexistent) other LNV posts. This never
    // creates posts; it's spotlight-only until the user clicks "add to feed."
    if (ps.length === 1) {
      const discogsArtistId = subjectDiscogsId({ type: 'artist', name, posts: ps })
      if (discogsArtistId) pool.push({ type: 'artist', name, posts: ps, unknown: true, discogsArtistId })
    }
  }
  for (const [name, ps] of byLabel)   if (ps.length >= SPOTLIGHT_MIN_POSTS) pool.push({ type: 'label',   name, posts: ps })
  for (const [name, ps] of byChannel) if (ps.length >= SPOTLIGHT_MIN_POSTS) pool.push({ type: 'channel', name, posts: ps })
  // TEMP (2026-08-26) — see PLACEHOLDER_CHANNEL_POSTS' comment above.
  pool.push({ type: 'channel', name: PLACEHOLDER_CHANNEL_NAME, posts: PLACEHOLDER_CHANNEL_POSTS, isPlaceholder: true })
  return pool
}

// Fisher–Yates — fresh Math.random each call, so each load reshuffles.
function shuffled(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildShelfItems(posts) {
  // Legacy DB-persisted spotlight posts (old triggerSpotlights model) are
  // filtered out entirely — not rendered as spotlights (that path is gone)
  // and not rendered as ordinary posts either (they carry no artists/
  // labels/genres and a synthetic title, so they'd look broken as a PostCard).
  const real = posts.filter(p => !p.is_spotlight)
  const order = shuffled(buildSpotlightPool(real))

  const items = []
  let pick = 0
  real.forEach((post, i) => {
    items.push({ key: `p-${post.id}`, kind: 'post', post })
    if ((i + 1) % SPOTLIGHT_EVERY === 0 && order.length > 0) {
      const subject = order[pick % order.length]
      pick++
      items.push({ key: `spotlight-${i}-${subject.type}-${subject.name}`, kind: 'spotlight', subject })
    }
  })
  return items
}

// ── Theme Picker ──────────────────────────────────────────────────────────────

function ThemePicker({ currentIdx, onSelect }) {
  return (
    <div style={{ position: 'absolute', bottom: 60, right: 0, background: '#1a1a1a', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 0', width: 164, zIndex: 200, boxShadow: '0 8px 28px rgba(0,0,0,0.55)' }}>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', padding: '6px 12px 3px', fontFamily: 'Barlow, sans-serif' }}>Theme</div>
      <div onClick={() => onSelect(-1)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 8px', cursor: 'pointer', fontSize: 11, color: currentIdx === -1 ? '#fff' : 'rgba(255,255,255,0.55)', borderBottom: '0.5px solid rgba(255,255,255,0.08)', marginBottom: 4, fontFamily: 'Barlow, sans-serif' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <span style={{ fontSize: 12 }}>◐</span><span>Auto (clock)</span>
      </div>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', padding: '3px 12px', fontFamily: 'Barlow, sans-serif' }}>Manual</div>
      {PALETTES.map((p, i) => (
        <div key={i} onClick={() => onSelect(i)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 11, color: currentIdx === i ? '#fff' : 'rgba(255,255,255,0.55)', fontFamily: 'Barlow, sans-serif' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; applyPalette(i) }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; applyPalette(currentIdx === -1 ? getAutoIndex() : currentIdx) }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: p.accent, border: '1px solid rgba(255,255,255,0.15)' }} />
          <span style={{ flex: 1 }}>{p.name}</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>{p.slot}</span>
        </div>
      ))}
    </div>
  )
}

// ── FeedIntro ─────────────────────────────────────────────────────────────────
// First slide in the feed, before any real post — a landing panel, fully
// visible at scroll position 0. Modeled on avantt.displaay.net's own main
// content area (per gabriel's 2026-08-21 reference screenshot: their two
// nav columns, then a large open panel before any real content) rather
// than avantt's literal black — themed with the site's own palette instead.
// It's just the first child of feedRef's row, so it rides the exact same
// scrollLeft/RAF-damping mechanics every post card already uses — no new
// scroll logic, and its width is included in feedRef.scrollWidth
// automatically, so LayoutProvider's spacer-height math already accounts
// for it. As a side effect, this also resolves the nav rail/secondary
// strip overlapping real post content when open at rest: they now overlap
// this intro panel instead of post #1's card.
// Content TBD (gabriel: time/date, or the about page) — this is the
// structural shell only.
//
// ROUND 14-15 (2026-08-21): widened this panel to 1.4x, then 2.3x the
// viewport, purely to buy the old separate secondary strip more scroll
// room to collapse slower than the rail. REVERTED round 17 — the rail and
// secondary strip are now one merged element (Strip.jsx) sharing a single
// collapse curve, so there's no second, slower-needing element to give
// extra room to anymore. Back to exactly 100% of the viewport, matching
// round 8's original shape.

// Content settled 2026-08-24 (gabriel: "time/date + live feel") — a clock
// (Clock.jsx, re-themed off the old hardcoded --charcoal/--grey-text onto
// --theme-* tokens so it actually shifts with the time-of-day palette like
// everything else) top-right, and a scroll cue bottom-right. The live post
// count and the small "scroll to begin" caption line (2026-08-24, first
// pass) were both dropped later that same day per gabriel's ask — the
// scroll cue now reuses the numeral treatment instead of its own small
// VT323 line.
function FeedIntro({ clockWrapRef, scrollCueRef }) {
  return (
    <div style={{
      flexShrink: 0,
      width: '100%',
      minWidth: '100%',
      height: '100%',
      background: 'var(--theme-showcase)',
      borderRight: '1px solid var(--theme-border)',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 32,
      boxSizing: 'border-box',
      transition: 'background 0.8s, border-color 0.8s',
    }}>
      {/* Clock is pinned to the top-right corner — a fixed anchor point,
          not part of the centered stack below (per gabriel's ask).
          Starts invisible (opacity 0 below) and fades IN as the feed
          scrolls, exactly like the FADE wordmark in Strip.jsx
          (railWordmarkRef / LayoutProvider's fadeTextOpacity) — see
          Feed()'s "Landing-panel clock" effect, which owns clockWrapRef's
          opacity AND `right` (see that effect's own comment for why
          `right` has to be live-tracked, not a flat value). Not a
          mount-triggered CSS animation (the previous approach) — gabriel
          didn't want the numbers visible on open. Inline `right` below is
          only the very-first-paint fallback, before that effect's first
          frame runs — it matches the strip's known RESTING gap
          (STRIP_OPEN_WIDTH - RAIL_WIDTH) + the same 56px margin the effect
          converges toward. */}
      <div ref={clockWrapRef} style={{ position: 'absolute', top: 28, right: STRIP_OPEN_WIDTH - RAIL_WIDTH + 56, textAlign: 'right', opacity: 0, transition: 'opacity 0.15s linear' }}>
        <Clock />
      </div>
      {/* Scroll cue — pinned to the bottom-right area, same numeral
          treatment as the clock and PostCard's plate numeral (7rem/900/
          lh 0.78/ls -0.03em, Barlow, textPri) per gabriel's ask. Arrow
          leads (before "SCROLL") and points LEFT — matches the feed's own
          motion: scrolling forward pulls the next card in from the right
          while everything already on screen slides left, so a left arrow
          reads as "this way," not down.
          `right` FIX (2026-08-24 — gabriel's screenshot showed "SCR" cut
          off at the actual browser window edge): the earlier vw-based
          `right` guessed at the wrong problem. The real cause is
          structural — Layout.jsx sizes the feed zone as
          `calc(100vw - 108px)`, assuming the nav strip (Strip.jsx) is
          already collapsed to its 108px floor, but AT REST (landing,
          scrollLeft 0 — exactly when this cue needs to be visible) the
          strip is still at its full STRIP_OPEN_WIDTH (530px). That extra
          (530-108=422px) of strip width pushes FeedIntro's whole box
          (and everything positioned via `right` inside it) that far
          past the actually-visible window edge, clipped by #scroll-inner's
          own overflow — nothing to do with viewport width at all, so no
          vw-based value could ever fully fix it. This cue only needs to
          read right at scroll 0 (it scrolls away with everything else in
          FeedIntro once the user starts scrolling), so unlike the clock
          (which stays mounted and visible well past that point — see its
          own live-tracked `right`) a flat value computed from the strip's
          known RESTING width is enough here.
          Fades OUT once scrolling begins, and locked gone for good after
          that (never reappears, even if gabriel scrolls back to position
          0 — only a page reload brings it back) — see Feed()'s "Scroll
          cue fade-out" effect, which owns this element's opacity and
          animation from here on. */}
      <div ref={scrollCueRef} style={{
        position: 'absolute', bottom: 28, right: STRIP_OPEN_WIDTH - RAIL_WIDTH + 56,
        display: 'flex', alignItems: 'baseline', gap: 16, whiteSpace: 'nowrap',
        fontFamily: "'Barlow',sans-serif", fontWeight: 900, fontSize: '7rem',
        lineHeight: 0.78, letterSpacing: '-0.03em', color: 'var(--theme-text-pri)',
        opacity: 0.3, // pre-first-frame fallback; Feed()'s "Scroll cue fade-out" effect owns this from frame one
      }}>
        {/* 2026-08-26: was a bare "←" text glyph — Barlow/900 doesn't draw
            arrow characters at anything like the weight or vertical
            position of its letterforms at this size, so it read as
            floating above/below "SCROLL" instead of sitting on the same
            line. An SVG has no font metrics to fight: a flex item with no
            baseline defaults its bottom edge to the row's baseline, so
            `alignItems:'baseline'` above now lines it up with the text's
            own baseline for real. Sized in `em` off the same fontSize as
            the text so it scales together — nudge the em values if gabriel
            wants it bigger/smaller relative to "SCROLL". */}
        <svg viewBox="0 0 120 60" style={{ height: '0.5em', width: '1em', flexShrink: 0, display: 'block' }}>
          <path fill="currentColor" d="M0,30 L40,0 L40,20 L120,20 L120,40 L40,40 L40,60 Z" />
        </svg>
        <span>SCROLL</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FEED
// ═══════════════════════════════════════════════════════════════════════════════

export default function Feed() {
  const [themeIdx, setThemeIdx]       = useState(-1)
  const [pickerOpen, setPickerOpen]   = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [editingPost, setEditingPost] = useState(null)
  const [composeInitialUrl, setComposeInitialUrl] = useState('')
  // "Add to feed" from a spotlight's Discogs discography preview — opens
  // the normal compose flow pre-loaded with that release's Discogs URL, so
  // it runs through ComposeModal's own existing fetch/populate/dedupe-check
  // pipeline exactly like pasting the link in by hand (see ComposeModal's
  // initialUrl prop + its mount effect). Nothing is posted until the user
  // reviews and hits post themselves.
  function openComposeWithUrl(url) { setComposeInitialUrl(url); setComposeOpen(true) }
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const shelfItems                    = useRef([])
  const lastPostsSignature            = useRef(null)
  const clockWrapRef                  = useRef(null)
  const scrollCueRef                  = useRef(null)
  const queryClient                   = useQueryClient()
  const { feedRef, driveFeedScroll } = useLayout() || {}

  // Theme
  useEffect(() => { applyPalette(themeIdx === -1 ? getAutoIndex() : themeIdx) }, [themeIdx])
  useEffect(() => {
    const t = setInterval(() => { if (themeIdx === -1) applyPalette(getAutoIndex()) }, 60000)
    return () => clearInterval(t)
  }, [themeIdx])

  // Debounce search input → search (300ms)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Data
  const { data: raw, isFetching: searching } = useQuery({
    queryKey: ['posts', search ? 'SEARCH' : 'LATEST', search],
    queryFn: async () => {
      const url = search
        ? `${API}/posts?limit=60&search=${encodeURIComponent(search)}`
        : `${API}/posts?limit=60`
      const res = await fetch(url)
      if (!res.ok) return { posts: [], total: 0 }
      const d = await res.json()
      // /api/posts returns {posts,total,page,limit}; tolerate a bare array too.
      return Array.isArray(d) ? { posts: d, total: d.length } : { posts: d.posts || [], total: d.total ?? (d.posts || []).length }
    },
    refetchInterval: search ? false : 30000,
  })
  const posts = raw?.posts || []

  const postsSignature = posts.map(p => p.id).join(',')
  if (postsSignature !== lastPostsSignature.current) {
    shelfItems.current = buildShelfItems(posts)
    lastPostsSignature.current = postsSignature
  }

  // 2026-09-25: when the SEARCH changes (never on the 30 s background
  // refresh), move the shelf once that search's results have landed — to the
  // first result (or the no-results panel) while searching, back to the
  // start when it's cleared. Must go through driveFeedScroll: the old
  // `feedRef.current.scrollLeft = 0` here was overwritten by LayoutProvider's
  // ticker on the very next frame, so a search that shrank the shelf left the
  // view stranded past its end (typing "38" = blank, unscrollable page).
  const scrolledForSearch = useRef('')
  useEffect(() => {
    if (searching || scrolledForSearch.current === search) return
    scrolledForSearch.current = search
    // Effects run after the new results are in the DOM, so measure now.
    const feed = feedRef?.current
    if (!feed) return
    const first = search ? feed.children[1] : null
    const target = first ? feed.scrollLeft + (first.getBoundingClientRect().left - feed.getBoundingClientRect().left) : 0
    driveFeedScroll?.(Math.max(0, target))
  }, [search, searching, postsSignature, feedRef, driveFeedScroll])

  // Scroll drag
  useEffect(() => {
    const el = feedRef?.current
    if (!el) return
    let down = false, sx = 0, sl = 0
    // Drag-to-scroll drives the feed through #scroll-outer (driveFeedScroll),
    // same as wheel input — the RAF ticker in LayoutProvider owns
    // feedRef.scrollLeft every frame, so writing it directly here would just
    // get overwritten on the very next tick.
    const onDown  = e => { down = true; sx = e.pageX - el.offsetLeft; sl = el.scrollLeft; el.style.cursor = 'grabbing' }
    const onUp    = () => { down = false; el.style.cursor = 'default' }
    const onMove  = e => { if (!down) return; e.preventDefault(); const ns = sl - (e.pageX - el.offsetLeft - sx) * 1.5; driveFeedScroll?.(ns) }
    el.addEventListener('mousedown', onDown); el.addEventListener('mouseleave', onUp)
    el.addEventListener('mouseup', onUp); el.addEventListener('mousemove', onMove)
    return () => { el.removeEventListener('mousedown', onDown); el.removeEventListener('mouseleave', onUp); el.removeEventListener('mouseup', onUp); el.removeEventListener('mousemove', onMove) }
  }, [feedRef, driveFeedScroll])

  // Landing-panel clock — fades IN once, at the very start, mirroring
  // Strip.jsx's FADE wordmark (railWordmarkRef / LayoutProvider's
  // fadeTextOpacity): invisible at rest (right when the feed opens — per
  // gabriel's ask, no numbers on load), then locked fully solid the moment
  // it first reaches opacity 1 — it never dims again after that, even if
  // the feed later scrolls back to position 0 (scroll-to-top, or a new
  // search resetting feedRef.scrollLeft).
  //
  // Also live-tracks `right` (2026-08-24, same investigation as the
  // scroll-cue clipping fix, see FeedIntro's own comment on it): Layout.jsx
  // sizes the feed zone as `calc(100vw - 108px)`, assuming Strip.jsx has
  // already collapsed to its RAIL_WIDTH floor, but the strip only reaches
  // that floor once `raw` (the same scroll-progress value driving this
  // clock's own fadeTextOpacity) hits 1 — well AFTER the clock is already
  // fully opaque (fadeTextOpacity locks at raw=0.4, the strip doesn't
  // finish collapsing until raw=1). So a flat `right` clips the clock for
  // a long stretch of scrolling even after it's fully visible-in-principle.
  // Unlike the scroll cue (which only has to be correct once, at rest, and
  // scrolls off screen shortly after), the clock stays mounted and on
  // screen well past that point, so its `right` has to keep tracking the
  // strip's actual current width for as long as this component lives —
  // not just until first opaque, and not one-way-locked the way opacity
  // is (if gabriel scrolls back toward 0, the strip re-expands, and the
  // clock must retreat with it or it'd end up rendered underneath the
  // strip).
  //
  // PERF NOTE (fixed 2026-08-24 — gabriel reported the scroll had gone
  // janky after this was first added): the first version listened for
  // native 'scroll' events and read `el.scrollLeft` in the handler. That
  // read is the bug — LayoutProvider's own RAF ticker writes several
  // LAYOUT-affecting styles every single frame (stripRef/railZoneRef
  // widths, in handleFeedScroll), and reading any layout-dependent
  // property (scrollLeft included) shortly after those writes forces the
  // browser to run a synchronous layout recalculation on top of the one
  // it would already do for paint — extra forced reflow, 60x/sec, on top
  // of an already write-heavy frame. Fix: don't read the DOM again at all.
  // LayoutProvider already computes both numbers this needs once per frame
  // (`fadeTextOpacity` — the same value driving the FADE wordmark — and
  // `outerWidth`, the strip's live current width) and parks them on
  // `window.lnvDebugStrip` — kept there specifically for reuse like this
  // (see its own round-16 comment). Reading plain object properties isn't
  // a layout read, so this costs nothing extra per frame; runs indefinitely
  // (no early return) precisely because `right` must never stop tracking.
  useEffect(() => {
    let raf = null
    let opacityLocked = false
    function loop() {
      const dbg = window.lnvDebugStrip
      const outerWidth = dbg?.outerWidth ?? STRIP_OPEN_WIDTH // before the first frame, assume the known resting width
      const gap = Math.max(0, outerWidth - RAIL_WIDTH) // how far past the visible window edge FeedIntro's box currently sits
      if (clockWrapRef.current) {
        clockWrapRef.current.style.right = `${gap + 56}px`
        if (!opacityLocked) {
          const opacity = dbg?.fadeTextOpacity ?? 0
          clockWrapRef.current.style.opacity = `${opacity}`
          if (opacity >= 1) opacityLocked = true
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [])

  // Scroll cue fade-out — the "← SCROLL" cue is only for the moment before
  // any scrolling has happened; per gabriel's ask it fades out as soon as
  // scrolling begins and stays gone for good after that (never reappears,
  // even scrolling back to position 0 — only a fresh page load brings it
  // back, since `locked`/`fadeStartOpacity` below live only in this
  // effect's closure and reset on remount). FADE_OUT_RANGE is deliberately
  // tight — the cue should read as "scrolling has started, get out of the
  // way" rather than a slow farewell.
  //
  // FIXED 2026-08-24 — gabriel reported a "snappy" glitch right at the
  // instant scrolling starts. Root cause: the first version left the idle
  // pulse as a CSS `animation` (index.css's `pulse` keyframe, 0.3<->0.7
  // opacity) and, the moment raw left 0, killed it with
  // `style.animation='none'` while simultaneously writing a fresh JS
  // opacity starting near 1. Whatever point the CSS animation's own
  // internal cycle happened to be at (anywhere in 0.3-0.7) got replaced by
  // ~1 in a single frame — a real, visible opacity jump, not a rendering
  // hiccup. Fix: JS owns `opacity` from the very first frame, always — the
  // idle "pulse" is now computed here too (same 0.3<->0.7 curve as the old
  // CSS keyframe, via a plain sine easing off the rAF timestamp) instead
  // of living in a separate CSS animation, so there's no handoff moment at
  // all. And when raw does cross 0, the fade-out starts from
  // `fadeStartOpacity` — whatever the idle pulse's actual value was on
  // that exact frame — down to 0, rather than resetting to a hardcoded 1,
  // so the two phases connect continuously with no discontinuity to see.
  useEffect(() => {
    let raf = null
    let locked = false
    let lastIdleOpacity = 0.3
    let fadeStartOpacity = null
    const FADE_OUT_RANGE = 0.05
    const PULSE_PERIOD_MS = 2200 // matches the old CSS `pulse 2.2s`
    function loop(ts) {
      if (locked) return
      const raw = window.lnvDebugStrip?.raw ?? 0
      let opacity
      if (raw <= 0) {
        const phase = (ts % PULSE_PERIOD_MS) / PULSE_PERIOD_MS // 0..1, wraps every 2.2s
        const eased = (1 - Math.cos(phase * Math.PI * 2)) / 2   // smooth 0..1..0, same shape as ease-in-out
        opacity = 0.3 + eased * 0.4                             // 0.3..0.7, matching the old pulse keyframe's range
        lastIdleOpacity = opacity
      } else {
        if (fadeStartOpacity === null) fadeStartOpacity = lastIdleOpacity // seamless handoff — start from where the pulse actually was
        const decay = Math.min(raw / FADE_OUT_RANGE, 1)
        opacity = fadeStartOpacity * (1 - decay)
      }
      if (scrollCueRef.current) {
        scrollCueRef.current.style.opacity = `${opacity}`
        if (raw > 0 && opacity <= 0) { locked = true; return } // gone for good until reload
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [])

  // Keyboard
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') setPickerOpen(false) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  // 2026-08-28: found via devtools while chasing the "gap looks broken on
  // the first few posts" report — this used to return the POST_BG_CYCLE
  // tint for every non-spectrum post, but PostCard's own `cardBackground`
  // (see its `spectrum ? cardBg : 'var(--theme-bg)'` — gabriel's earlier,
  // still-standing call to render idx < SPECTRUM_START flat) throws that
  // value away and renders flat var(--theme-bg) instead. So the CARD was
  // always flat for posts 1-3; only the seam color (fed by this function)
  // didn't know that, and FeedGap made the mismatch visible for the first
  // time — margin-based gaps never showed a color at all, so nothing
  // exposed it before. Matching this function to what PostCard actually
  // paints (not reverting gabriel's flat-first-three call) is the fix.
  // POST_BG_CYCLE itself is untouched and left in place, just no longer
  // read here — it's still the intended source once/if the first three
  // posts get their own tint back.
  // 2026-09-26 (gabriel): cards cycle through the palette again over the
  // palette-coloured surface (FEED_SURFACE). The first three used to be flat
  // var(--theme-bg) — which is now the surface itself, so they'd vanish into
  // it — and take POST_BG_CYCLE (dark1/dark2/dark3) instead, the tint the
  // note above always meant for them. (White cards were tried briefly.)
  function getCardBg(idx, item) {
    if (item?.kind === 'spotlight') return 'var(--theme-showcase)'
    if (idx >= SPECTRUM_START) return spectrumBg(idx, currentPalette.name)
    // Trial (gabriel, 2026-09-26): the first three match the surface —
    // lifted only by their shadow. POST_BG_CYCLE was:
    // `var(--theme-${POST_BG_CYCLE[idx % POST_BG_CYCLE.length]})`
    return 'var(--theme-bg)'
  }

  const currentPalette = PALETTES[themeIdx === -1 ? getAutoIndex() : themeIdx]

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--theme-bg)', position: 'relative' }}>

      {/* overflowX must stay 'hidden', NOT 'auto' — #scroll-outer is meant to be
          the ONLY element that natively captures wheel/trackpad input (see
          LayoutProvider's RAF ticker). With 'auto' here, Chrome's own
          vertical-wheel-to-horizontal-scroll fallback (kicks in on any element
          with horizontal-but-not-vertical overflow) intercepted the wheel
          event directly, moving feedRef.scrollLeft natively — which the RAF
          ticker then immediately fought/overwrote from #scroll-outer's
          (unchanged, since it never got the event) scrollTop every frame.
          That fight is exactly the "wheel doesn't work / feels stuck" bug —
          native drag-to-scroll worked because it goes through driveFeedScroll
          -> #scroll-outer.scrollTop instead. 'hidden' still allows
          programmatic .scrollLeft writes (which is all this ever needs), it
          just stops the browser from independently claiming wheel input. */}
      <div ref={feedRef} style={{ display: 'flex', flex: 1, gap: 0, overflowX: 'hidden', overflowY: 'hidden', alignItems: 'stretch', scrollbarWidth: 'none', background: FEED_SURFACE }}>
        <FeedIntro clockWrapRef={clockWrapRef} scrollCueRef={scrollCueRef} />
        {!posts.length && (
          // A card-width panel, not flex:1 — the intro already fills the
          // viewport, so flex:1 squeezed this to ~40px just off-screen.
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: `0 0 ${DESIGN_BASE.cardW}px`, fontFamily: 'VT323, monospace', fontSize: 14, color: 'var(--theme-text-sec)' }}>
            {search ? `No results for "${search}"` : 'No posts yet — share the first record.'}
          </div>
        )}
        {(() => {
          const items = shelfItems.current
          const nodes = []
          items.forEach((item, idx) => {
            const cardBg = getCardBg(idx, item)
            const card = (item.kind === 'spotlight'
              ? <SpotlightCard key={item.key} cardKey={item.key} subject={item.subject} cardBg={cardBg} onCreateFromDiscogs={openComposeWithUrl} />
              : isLiveSetPost(item.post)
                ? <LiveSetCard key={item.key} post={item.post} cardBg={cardBg} d={designFor(idx, true)} onEdit={setEditingPost} />
                : isAlbumPost(item.post)
                ? <AlbumCard key={item.key} post={item.post} cardBg={cardBg} d={designFor(idx, false)} onEdit={setEditingPost} />
                : <PostCard key={item.key} post={item.post} cardBg={cardBg} d={designFor(idx, detectType(item.post) === 'livemix')} onEdit={setEditingPost} />)
            // Floating card — rounded and lifted off the surface (FloatSlot).
            nodes.push(<FloatSlot key={item.key}>{card}</FloatSlot>)
          })
          return nodes
        })()}
      </div>

      {/* Search */}
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 100, display: 'flex', alignItems: 'center', background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', borderRadius: 99, padding: '6px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
        <span style={{ color: 'var(--theme-text-ter)', fontSize: 13, marginRight: 6 }}>{searching ? '◐' : '⌕'}</span>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="search artists, genres, labels, tracks…"
          style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--theme-text-pri)', fontFamily: 'Barlow, sans-serif', fontSize: 12, width: 220 }}
        />
        {searchInput && (
          <button onClick={() => setSearchInput('')} style={{ background: 'none', border: 'none', color: 'var(--theme-text-ter)', cursor: 'pointer', fontSize: 13, padding: 0, marginLeft: 4 }}>×</button>
        )}
      </div>

      {/* Theme button */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 100 }}>
        {pickerOpen && <ThemePicker currentIdx={themeIdx} onSelect={i => { setThemeIdx(i); setPickerOpen(false) }} />}
        <button onClick={() => setPickerOpen(v => !v)}
          style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', cursor: 'pointer', color: 'var(--theme-text-sec)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>◐</button>
        <div style={{ fontSize: 8, textAlign: 'center', color: 'var(--theme-text-ter)', marginTop: 3, fontFamily: 'VT323, monospace', letterSpacing: '0.06em' }}>
          {themeIdx === -1 ? 'AUTO' : currentPalette?.name?.split(' ')[0].toUpperCase()}
        </div>
      </div>

      {/* Compose button */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 100 }}>
        <button onClick={() => setComposeOpen(true)}
          style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--theme-accent)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', transition: 'background 0.8s' }}>+</button>
      </div>

      {editingPost && (
        <ComposeModal
          key={`edit-${editingPost.id}`}
          editPost={editingPost}
          onClose={() => setEditingPost(null)}
          onPosted={() => { setEditingPost(null); queryClient.invalidateQueries({ queryKey: ['posts'] }) }}
        />
      )}

      {composeOpen && (
        <ComposeModal
          initialUrl={composeInitialUrl}
          onClose={() => { setComposeOpen(false); setComposeInitialUrl('') }}
          onPosted={() => { setComposeOpen(false); setComposeInitialUrl(''); queryClient.invalidateQueries({ queryKey: ['posts'] }) }}
        />
      )}
    </div>
  )
}
