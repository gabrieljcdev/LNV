import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLayout } from '../context/LayoutContext'
import ComposeModal from './ComposeModal'
import { getUserId } from '../lib/auth'
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
const ROTATION = 2

const DESIGN_BASE = {
  // ── placement ───────────────────────────────────────────────────────────────
  // ONE text column in the rail. The plate and tracklist carry their own 20px
  // padding, so the pills / replies / byline boxes are inset 20px and 40px
  // narrower (85.51% of 276) to land on exactly the same x 20-256 column.
  // Nothing in the rail runs to the card edge any more.
  //
  // Pills mirror with the card (justifyContent is derived from plateAlign in
  // PostCard). Replies and the byline do NOT mirror: they share one Y and form
  // a footer row, replies hard left, byline hard right, under one dashed rule.
  //
  // Y values live in the PLATE_TOP / PLATE_BOTTOM / LIVE blocks below.
  plateCol:'rail',     plateX:0,    plateW:100,
  trackCol:'rail',     trackX:0,    trackW:100,
  pillsCol:'rail',     pillsX:20,   pillsW:85.51,
  repliesCol:'rail',   repliesX:20, repliesW:85.51,
  stampCol:'rail',     stampX:20,   stampW:85.51,
  commentsCol:'rail',  commentsX:0, commentsY:201, commentsW:100,
  matCol:'media',      matX:0,      matW:100,
  captionCol:'media',  captionX:52.4, captionW:80,
  descCol:'media',     descX:32.4,    descW:87.63,

  mediaSide:'right',
  cardW:800, cardH:820, cardRadius:0, infoW:276,
  railBorder:1, zoneDivider:1,
  platePt:20, platePx:20, platePb:16, plateAlign:'right',
  badgeSize:9, badgeWeight:700, badgeLs:0.1, badgePy:3, badgePx:8,
  badgeRadius:3, badgeMb:9,
  artistFf:"'Barlow',sans-serif", artistSize:21, artistWeight:700,
  artistLh:1.25, artistLs:0, artistCase:'none',
  metalineSize:15, metalineLh:1.4, metalineMt:2,
  numeralFf:"'Barlow',sans-serif", numeralSize:7, numeralWeight:900,
  numeralLh:0.78, numeralLs:-0.03, numeralMt:10, numeralColor:'#111111',
  trackPy:14, trackPx:20, trackSize:12, trackTitleW:100,
  tracknumSize:9, trackGap:8, trackRowpad:4,
  descPy:14, descPx:20, descPb:16, descSize:12.5, descLh:1.55,
  pillSize:11, pillPy:3, pillPx:10, pillRadius:99, pillGap:4, pillBg:'#e8e8e8',
  metarowSize:11, metarowPt:12, stampSize:10,
  cmPy:8, cmPx:16, cmSize:12,
  labelFf:"'VT323',monospace", zlabelSize:11, zlabelLs:0.06, zlabelMb:8,
  colPad:0, captionAlign:'space-between',
  matGrow:'1', matFill:'none', matColor:'#cfe3f0', matRadius:0, matPad:0,
  frameRadius:0, frameRatio:'1/1', artFill:80, artRadius:40,
  artOffsetY:0, artOffsetX:0,
  artShadowY:0, artShadowB:0, artShadowA:0,
  embedPreset:'soundcloud', embedW:560, embedH:315,
  captionPt:12, captionSize:12.5, captionNameSize:13.5, captionNameWeight:700,
  captionColor:'#2b4553', captionNameColor:'#102430',
  bodyFf:"'Barlow',sans-serif",
  badge2Color:'#4a90d9',

  // The export also carries cBg / cPri / cSec / cTer / cAccent / cLine.
  // Those are DELIBERATELY NOT APPLIED: the palette system owns text,
  // background, accent and border colours through the --theme-* custom
  // properties, and hardcoding them would break the theme picker and the
  // auto clock palette.
}

// ---------------------------------------------------------------------------
// The four ways are two mirrored pairs. Measured off gabriel's five reference
// screenshots (2026-08-23) and then normalised, so every pair is exact.
//
//   W1 <-> W3   PLATE_TOP      plate at the top of the rail, artwork at the top
//   W2 <-> W4   PLATE_BOTTOM   byline at the top, plate low, artwork at the base
//
// Within a pair every Y is IDENTICAL; only `mediaSide` and `plateAlign` flip.
//
// The top and bottom halves are exact VERTICAL mirrors of one another. The rail
// is one 450px group (plate 252 + tracklist 134 + 10 + pills 22) plus a 30px
// footer row, and the two are swapped end for end:
//
//   PLATE_TOP     [45] plate track pills ....327.... footer [0]
//   PLATE_BOTTOM  [0] footer ....327.... plate track pills [45]
//
// The media column mirrors the same way: artwork/caption/description reading
// downward in the top ways, description/caption/artwork in the bottom ways,
// with the 80px outer margin swapping ends.
//
// Slot heights are worst-case, so nothing ever collides: a 2-line artist name
// makes the plate 252 tall, and the tracklist is capped at 3 rows + "+n more"
// (see `tracks.slice(0, 3)` in PostCard) which caps it at 134.
// ---------------------------------------------------------------------------

// Artwork is 80% of the 524px media column => 419.2px, centred, so it sits at
// x 52.4-471.6 and, inside a 1:1 mat, 52.4px down from the mat's own top.
const PLATE_TOP = {   // W1 / W3
  plateY:45,  trackY:297, pillsY:441, repliesY:790, stampY:790,
  matY:28,    captionY:508, descY:568,
}
const PLATE_BOTTOM = { // W2 / W4 - rail reads byline, plate, tracklist, pills
  repliesY:0, stampY:0,  plateY:357, trackY:609, pillsY:753,
  descY:125,  captionY:282, matY:268,
}
// Live sets have no tracklist (the zone becomes Channel) and no bottom variant -
// the plate stays at the top on all four ways. Values are gabriel's own, taken
// from the live-set reference screenshot; only the side and alignment mirror.
// Live-set embeds are not square and their height depends on the platform
// (YouTube 560x315, SoundCloud 480x166, Mixcloud 400x60), so the caption sits
// below the TALLEST of them - 278 + 315 = 593 - rather than below the
// SoundCloud embed in the reference screenshot. A short embed therefore leaves
// more air above the caption than a tall one.
const LIVE = {
  plateY:206, trackY:438, pillsY:512, repliesY:790, stampY:790,
  matY:278,   captionY:601, descY:654,
}

const DESIGN_VARIANTS = {
  'v0:album': { ...PLATE_TOP,    mediaSide:'right', plateAlign:'right' },
  'v1:album': { ...PLATE_BOTTOM, mediaSide:'right', plateAlign:'right' },
  'v2:album': { ...PLATE_TOP,    mediaSide:'left',  plateAlign:'left'  },
  'v3:album': { ...PLATE_BOTTOM, mediaSide:'left',  plateAlign:'left'  },

  'v0:live':  { ...LIVE, mediaSide:'right', plateAlign:'right' },
  'v1:live':  { ...LIVE, mediaSide:'right', plateAlign:'right' },
  'v2:live':  { ...LIVE, mediaSide:'left',  plateAlign:'left'  },
  'v3:live':  { ...LIVE, mediaSide:'left',  plateAlign:'left'  },
}

// idx is the post's position in the feed, so consecutive posts step through
// the rotation. ROTATION 2 uses ways 1-2 only; raise it to 4 to bring the
// other two in (they flip mediaSide, which puts two media columns next to
// each other at the seam between cards -- check that before switching).
function designFor(idx, isLiveMix) {
  const way = ((idx % ROTATION) + ROTATION) % ROTATION
  const slot = 'v' + way + ':' + (isLiveMix ? 'live' : 'album')
  return Object.assign({}, DESIGN_BASE, DESIGN_VARIANTS[slot] || {})
}

const SPOTLIGHT_CARD_WIDTH = DESIGN_BASE.cardW

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
function labelName(p)  { return p.labels?.[0]?.label_name  || p.labels?.[0]?.name  || p.label_name  || '' }
function coverSrc(p)   { return p.cover_image || p.coverImage || p.thumb_image || p.thumbImage || p.cover_art || '' }

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

const POST_BG_CYCLE = ['dark1','dark2','dark3','dark1','dark2','light1','dark3','dark1','dark2','dark3','light1','dark1','dark2']

// ── CoverArt ──────────────────────────────────────────────────────────────────

function CoverArt({ post, style = {}, children }) {
  const [err, setErr] = useState(false)
  const src = coverSrc(post || {})
  return (
    <div style={{ background: 'linear-gradient(135deg,#1e2126,#08090b)', position: 'relative', overflow: 'hidden', flexShrink: 0, ...style }}>
      {src && !err && <img src={src} alt="" onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      {(!src || err) && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.1)', fontSize: 36 }}>◈</div>}
      {children}
    </div>
  )
}

// ── Comments ──────────────────────────────────────────────────────────────────

function CommentThread({ postId, onCountChange, d }) {
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

  return (
    // overflowY was 'auto' — this is exactly the same class of bug as
    // feedRef's overflowX fix, just on the vertical axis: whenever the
    // cursor is over this comment box (or the tracklist/note wrapper below,
    // see PostCard), a vertical wheel gesture gets consumed HERE (native
    // scroll of this element) instead of bubbling to #scroll-outer. That's
    // avantt's real trick — nothing inside their horizontally-moving content
    // has its own native scroll at all, so there's never anything to compete
    // with the one wheel-capturing container. 'hidden' means long comment
    // threads get clipped rather than internally wheel-scrollable; there's
    // no other way to preserve independent inner scrolling AND have wheel
    // always drive the main feed when hovering over this area.
    <div style={{ padding: `${d?.cmPy ?? 8}px ${d?.cmPx ?? 16}px 12px`, borderTop: '0.5px solid var(--theme-border)', flexShrink: 0, maxHeight: 140, overflowY: 'hidden' }}>
      {comments === null ? (
        <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'var(--theme-text-ter)' }}>loading…</div>
      ) : comments.length === 0 ? (
        <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'var(--theme-text-ter)' }}>no replies yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
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

// ── Post card — free-form "plate" layout ────────────────────────────────────────
// Nine boxes, each absolutely positioned inside whichever column it belongs to
// (see DESIGN_BASE above). Nothing flows and nothing pushes anything else, so
// what was dragged in the designer is exactly what renders here.
//
// All the original interactive behavior is unchanged: click a track to preview
// it, the replies button toggles the same CommentThread, discogs/stream links
// are unchanged, genre pills still filter via openD3.

function PostCard({ post, cardBg, spectrum, d }) {
  const { openD3, registerPostRef } = useLayout() || {}
  const [activeTrackUrl, setActiveTrackUrl] = useState(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(post.commentCount || post.comment_count || 0)

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
  const tagLabel = isLiveMix ? 'LIVE SET' : type === 'single' ? 'SINGLE' : 'ALBUM'
  const tagColor = isLiveMix ? 'var(--theme-accent)' : d.badge2Color

  const platformColor = PLATFORM_COLORS[platform] || 'var(--theme-accent)'
  const platformLabel = platform?.toUpperCase()

  const streamUrl = activeTrackUrl || post.stream_url || post.embed_url || tracks[0]?.youtube_url || tracks[0]?.stream_url || ''
  const ytMatch = streamUrl.match(/(?:v=|youtu\.be\/|embed\/)([^&\s?]{11})/)
  const ytId = ytMatch ? ytMatch[1] : null
  const scUrl = /soundcloud\.com/i.test(streamUrl) ? streamUrl : null
  const mcUrl = /mixcloud\.com/i.test(streamUrl) ? streamUrl : null

  const embedSrc = ytId
    ? `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&color=white`
    : scUrl
    ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(scUrl)}&color=%23e85d04&auto_play=false&hide_related=true&show_comments=false&show_user=true`
    : mcUrl
    ? `https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(mcUrl.replace('https://www.mixcloud.com',''))}`
    : null

  // The embed's size comes from the platform actually detected in the post's
  // URL, not from the designer's preset — the preset only picks which one the
  // preview mocks up.
  const [embedW, embedH] = ytId ? [560, 315]
    : scUrl ? [480, 166]
    : mcUrl ? [400, 60]
    : [d.embedW, d.embedH]

  const textPri = 'var(--theme-text-pri)'
  const textSec = 'var(--theme-text-sec)'
  const textTer = 'var(--theme-text-ter)'
  const divider = 'var(--theme-border)'

  // A transparent mat puts the caption on the card background, which is dark
  // in most palettes — so it must use the theme tokens rather than the
  // export's literal navy, exactly as the designer does.
  //
  // `spectrum` (idx >= SPECTRUM_START, see postSpectrum.js) forces the mat
  // out of transparent and onto the live spectrum color (`cardBg`) instead
  // of the design export's flat `d.matColor` — the export's literal navy
  // caption color isn't legible against a color that shifts per post, so
  // the caption falls back to theme tokens whenever the mat isn't the
  // design's own flat literal, exactly like the transparent case already did.
  //
  // The spectrum paints the WHOLE CARD (both columns), not the mat — the mat
  // stays transparent exactly as it is today, art sitting directly on the
  // card's own color rather than in a differently-colored frame. See the
  // card container's own `background` below for where the spectrum color
  // actually lands.
  const matTransparent = d.matFill === 'none'
  const captionColor = matTransparent ? textSec : d.captionColor
  const captionNameColor = matTransparent ? textPri : d.captionNameColor

  // Position one box inside its column.
  const box = id => ({
    position: 'absolute',
    left: d[id + 'X'],
    top: d[id + 'Y'],
    width: `${d[id + 'W']}%`,
  })

  // Rail content hugs the edge nearest the media column, so the four ways read
  // as two mirrored pairs. Deriving it here means the pills and meta rows can
  // never be nudged past the rail edge and clipped.
  const railJustify = d.plateAlign === 'right' ? 'flex-end' : d.plateAlign === 'center' ? 'center' : 'flex-start'

  const zlabel = {
    fontFamily: d.labelFf, fontSize: d.zlabelSize, letterSpacing: `${d.zlabelLs}em`,
    textTransform: 'uppercase', color: textTer, marginBottom: d.zlabelMb,
  }
  const artShadow = (d.artShadowY || d.artShadowB)
    ? `0 ${d.artShadowY}px ${d.artShadowB}px rgba(0,0,0,${d.artShadowA})`
    : 'none'
  const artTransform = (d.artOffsetX || d.artOffsetY)
    ? `translate(${d.artOffsetX}px, ${d.artOffsetY}px)`
    : undefined

  // ── the nine boxes ──────────────────────────────────────────────────────────
  const BOX = {}

  BOX.plate = (
    <div key="plate" style={{ ...box('plate'), padding: `${d.platePt}px ${d.platePx}px ${d.platePb}px`, textAlign: d.plateAlign }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: d.badgeMb, justifyContent: d.plateAlign === 'right' ? 'flex-end' : d.plateAlign === 'center' ? 'center' : 'flex-start' }}>
        <span style={{ fontSize: d.badgeSize, fontWeight: d.badgeWeight, letterSpacing: `${d.badgeLs}em`, padding: `${d.badgePy}px ${d.badgePx}px`, borderRadius: d.badgeRadius, background: tagColor, color: '#fff', fontFamily: d.labelFf }}>{tagLabel}</span>
        {platformLabel && (
          <span style={{ fontSize: d.badgeSize, fontWeight: d.badgeWeight, letterSpacing: `${d.badgeLs}em`, padding: `${d.badgePy}px ${d.badgePx}px`, borderRadius: d.badgeRadius, background: platformColor, color: platform === 'beatport' ? '#000' : '#fff', fontFamily: d.labelFf }}>{platformLabel}</span>
        )}
        {post.source === 'discogs' && (
          <span style={{ fontSize: d.badgeSize, fontWeight: d.badgeWeight, letterSpacing: `${d.badgeLs}em`, padding: `${d.badgePy}px ${d.badgePx}px`, borderRadius: d.badgeRadius, background: 'var(--theme-dark3)', color: textSec, fontFamily: d.labelFf }}>◈ DISCOGS</span>
        )}
      </div>
      <div
        onClick={() => artist && openD3?.('artists', { filter: artist })}
        style={{ fontSize: d.artistSize, fontWeight: d.artistWeight, lineHeight: d.artistLh, letterSpacing: `${d.artistLs}em`, textTransform: d.artistCase, color: textPri, fontFamily: d.artistFf, cursor: artist ? 'pointer' : 'default', wordBreak: 'break-word' }}
      >{artist || post.title}</div>
      <div style={{ fontSize: d.metalineSize, color: textSec, marginTop: d.metalineMt, fontFamily: d.bodyFf, lineHeight: d.metalineLh }}>
        {post.title}
        {label && <> · <span onClick={() => openD3?.('labels', { filter: label })} style={{ cursor: 'pointer', borderBottom: '1px dotted currentColor' }}>{label}</span></>}
        {post.year && <> · {post.year}</>}
      </div>
      <div style={{ fontSize: `${d.numeralSize}rem`, fontWeight: d.numeralWeight, lineHeight: d.numeralLh, letterSpacing: `${d.numeralLs}em`, color: textPri, fontFamily: d.numeralFf, marginTop: d.numeralMt }}>
        {String(post.id).padStart(2, '0')}
      </div>
    </div>
  )

  const trackRows = !isLiveMix && tracks.length > 0
  if (trackRows || (isLiveMix && channel)) {
    BOX.track = (
      <div key="track" style={{ ...box('track'), padding: `${d.trackPy}px ${d.trackPx}px`, overflow: 'hidden' }}>
        <div style={zlabel}>{isLiveMix ? 'Channel' : 'Album listing'}</div>
        {isLiveMix ? (
          <div style={{ fontSize: d.trackSize, color: textPri, fontFamily: d.bodyFf }}>{channel}</div>
        ) : (
          <>
            {tracks.slice(0, 3).map((t, i) => {
              const tUrl = t.stream_url || t.youtube_url || null
              const isActive = activeTrackUrl && tUrl && activeTrackUrl === tUrl
              return (
                <div key={i}
                  onClick={() => { if (tUrl) setActiveTrackUrl(isActive ? null : tUrl) }}
                  style={{ display: 'flex', gap: d.trackGap, alignItems: 'baseline', padding: `${d.trackRowpad}px 0`, borderBottom: `1px dotted ${divider}`, cursor: tUrl ? 'pointer' : 'default', background: isActive ? 'rgba(232,93,4,0.1)' : 'transparent' }}>
                  <span style={{ fontSize: d.tracknumSize, color: isActive ? 'var(--theme-accent)' : textTer, fontFamily: 'monospace', flexShrink: 0, minWidth: 16 }}>{tUrl ? (isActive ? '▶' : '▷') : (t.position || i + 1)}</span>
                  <span style={{ flex: `0 1 ${d.trackTitleW}%`, fontSize: d.trackSize, color: isActive ? textPri : textSec, fontWeight: isActive ? 600 : 400, fontFamily: d.bodyFf, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  {t.duration && <span style={{ fontSize: d.tracknumSize, color: textTer, fontFamily: 'monospace', marginLeft: 'auto', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{t.duration}</span>}
                </div>
              )
            })}
            {tracks.length > 3 && <div style={{ fontSize: d.tracknumSize, color: textTer, fontFamily: 'VT323, monospace', marginTop: 4 }}>+{tracks.length - 3} more</div>}
          </>
        )}
      </div>
    )
  }

  BOX.desc = (
    <div key="desc" style={{ ...box('desc'), padding: `${d.descPy}px ${d.descPx}px ${d.descPb}px`, overflow: 'hidden' }}>
      <div style={zlabel}>Post description</div>
      {note ? (
        <p style={{ fontSize: d.descSize, color: textSec, lineHeight: d.descLh, fontFamily: d.bodyFf, margin: 0 }}>{note}</p>
      ) : (
        <p style={{ fontSize: d.descSize, color: textTer, fontStyle: 'italic', fontFamily: d.bodyFf, margin: 0 }}>No description</p>
      )}
    </div>
  )

  BOX.pills = genres.length > 0 ? (
    <div key="pills" style={{ ...box('pills'), display: 'flex', flexWrap: 'wrap', gap: d.pillGap, justifyContent: railJustify }}>
      {genres.slice(0, 6).map(g => (
        <span key={g} onClick={() => openD3?.('genres', { filter: g })}
          style={{ fontSize: d.pillSize, background: 'var(--theme-dark3)', color: textSec, padding: `${d.pillPy}px ${d.pillPx}px`, borderRadius: d.pillRadius, fontFamily: d.bodyFf, cursor: 'pointer' }}
        >{g}</span>
      ))}
    </div>
  ) : null

  BOX.replies = (
    <div key="replies" style={{ ...box('replies'), display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start', paddingTop: d.metarowPt, borderTop: `1px dashed ${divider}`, fontSize: d.metarowSize, color: textTer, fontFamily: d.bodyFf }}>
      <button onClick={() => setCommentsOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: d.metarowSize, color: textTer, padding: 0, fontFamily: d.bodyFf }}>
        <span style={{ color: 'var(--theme-accent)', fontWeight: 700 }}>{commentCount}</span>&nbsp;replies
      </button>
      {post.discogs_url && (
        <a href={post.discogs_url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: d.metarowSize, color: textTer, fontFamily: d.bodyFf, textDecoration: 'none' }}>↗ discogs</a>
      )}
      {isLiveMix && streamUrl && (
        <a href={streamUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: d.metarowSize, color: textTer, fontFamily: d.bodyFf, textDecoration: 'none' }}>↗ {platformLabel || 'stream'}</a>
      )}
    </div>
  )

  BOX.stamp = (
    <div key="stamp" style={{ ...box('stamp'), display: 'flex', justifyContent: 'flex-end', paddingTop: d.metarowPt, fontSize: d.stampSize, color: textTer, fontFamily: 'VT323, monospace' }}>
      <span style={{ color: textSec, fontWeight: 500 }}>{post.user?.username || post.username}</span> · {timeAgo(post.created_at)}
    </div>
  )

  BOX.comments = commentsOpen ? (
    <div key="comments" style={{ ...box('comments'), zIndex: 3, background: 'var(--theme-bg)' }}>
      <CommentThread postId={post.id} onCountChange={setCommentCount} d={d} />
    </div>
  ) : null

  BOX.mat = (
    <div key="mat" style={{ ...box('mat'), background: matTransparent ? 'transparent' : d.matColor, borderRadius: d.matRadius, padding: d.matPad, transition: 'background 0.8s' }}>
      <div style={{ width: '100%', ...(isLiveMix ? { height: embedH } : { aspectRatio: d.frameRatio.replace('/', ' / ') }), borderRadius: d.frameRadius, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {isLiveMix ? (
          embedSrc ? (
            <iframe src={embedSrc}
              style={{ width: '100%', maxWidth: embedW, height: embedH, border: 'none', borderRadius: d.artRadius, boxShadow: artShadow, transform: artTransform }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen title={post.title} />
          ) : (
            <div style={{ width: '100%', height: '100%', borderRadius: d.artRadius, overflow: 'hidden', background: '#1e2126', position: 'relative' }}>
              {coverSrc(post) && <img src={coverSrc(post)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 }} />}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'VT323, monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>NO STREAM URL</div>
            </div>
          )
        ) : (
          <CoverArt post={post} style={{ width: `${d.artFill}%`, height: `${d.artFill}%`, borderRadius: d.artRadius, boxShadow: artShadow, transform: artTransform }} />
        )}
      </div>
    </div>
  )

  BOX.caption = (
    <div key="caption" style={{ ...box('caption'), display: 'flex', justifyContent: d.captionAlign, alignItems: 'baseline', gap: 10, paddingTop: d.captionPt, fontFamily: d.labelFf, fontSize: d.captionSize, color: captionColor }}>
      <span style={{ fontFamily: d.artistFf, fontWeight: d.captionNameWeight, fontSize: d.captionNameSize, color: captionNameColor }}>{label || '—'}</span>
      <span>{[catNo, post.year].filter(Boolean).join(' · ')}</span>
    </div>
  )

  const ORDER = ['plate', 'track', 'desc', 'pills', 'replies', 'stamp', 'comments', 'mat', 'caption']
  const inColumn = which => ORDER
    .filter(id => BOX[id] && (d[id + 'Col'] === 'media') === (which === 'media'))
    .map(id => BOX[id])

  // The card fills the full height of the feed row so that its two vertical
  // rules -- the seam between cards and the rail/media divider -- run from the
  // top of the page to the bottom. The layout itself still lives in a cardH-tall
  // band centred in that height: `band` is the positioning context every
  // absolutely-placed box measures from, so all the Y values in the design table
  // stay relative to the card, not to the viewport.
  const band = {
    position: 'absolute', left: 0, right: 0, top: '50%',
    height: d.cardH, transform: 'translateY(-50%)',
  }

  return (
    <div
      ref={el => registerPostRef?.(post.id, el)}
      style={{
        flexShrink: 0, width: d.cardW, height: '100%', alignSelf: 'stretch',
        background: spectrum ? cardBg : 'var(--theme-bg)',
        borderRight: `1px solid ${divider}`,
        borderRadius: d.cardRadius || undefined,
        display: 'flex',
        flexDirection: d.mediaSide === 'left' ? 'row-reverse' : 'row',
        overflow: 'hidden',
        transition: 'background 0.8s',
      }}
    >
      <div style={{
        width: d.infoW, flexShrink: 0, position: 'relative', overflow: 'hidden',
        [d.mediaSide === 'left' ? 'borderLeft' : 'borderRight']: `${d.railBorder}px solid ${divider}`,
      }}>
        <div style={band}>{inColumn('rail')}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', padding: d.colPad }}>
        <div style={band}>{inColumn('media')}</div>
      </div>
    </div>
  )
}

// ── Spotlight card — one fixed-size card, not split into title/detail ──────────
// Real posts (post.is_spotlight, created server-side by posts.js's
// triggerSpotlights once a subject crosses a post-count milestone — see
// spotlightType/spotlightCount/spotlightCovers, enriched by getFullPost).
// Not a client-side random shuffle.

function SpotlightCard({ post, cardBg, flip, onFilterSubject }) {
  const { registerPostRef } = useLayout() || {}
  const name = post.spotlight_subject
  const type = post.spotlightType
  const count = post.spotlightCount || 0
  const covers = post.spotlightCovers || []

  return (
    <div
      ref={el => registerPostRef?.(post.id, el)}
      style={{ flexShrink: 0, width: SPOTLIGHT_CARD_WIDTH, height: '100%', background: cardBg, borderRight: '1px solid var(--theme-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* TOP HALF — collage + badge avatar */}
      <div style={{ flex: '0 0 50%', background: flip ? '#fff' : cardBg, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {covers.slice(0, 4).map((p, i) => coverSrc(p) && (
          <img key={p.id || i} src={coverSrc(p)} alt="" style={{ position: 'absolute', width: '50%', height: '50%', left: `${(i % 2) * 50}%`, top: `${Math.floor(i / 2) * 50}%`, objectFit: 'cover', opacity: 0.2 }} />
        ))}
        {type === 'artist'
          ? <div style={{ position: 'relative', zIndex: 2, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 900, color: '#fff', fontFamily: 'Barlow, sans-serif', backdropFilter: 'blur(8px)' }}>
              {name.charAt(0).toUpperCase()}
            </div>
          : <div style={{ position: 'relative', zIndex: 2, width: 80, height: 80, borderRadius: 12, background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: 'rgba(255,255,255,0.7)', fontFamily: 'Barlow, sans-serif', backdropFilter: 'blur(8px)', letterSpacing: 1 }}>
              {name.substring(0, 3).toUpperCase()}
            </div>
        }
      </div>
      {/* BOTTOM HALF — info */}
      <div style={{ flex: '0 0 50%', background: flip ? cardBg : '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px 8px', flexShrink: 0, borderBottom: `0.5px solid ${flip ? 'rgba(255,255,255,0.15)' : '#f0ede6'}` }}>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.09em', padding: '2px 6px', borderRadius: 3, display: 'inline-block', marginBottom: 5, background: 'var(--theme-accent)', color: '#fff', fontFamily: 'VT323, monospace' }}>
            {type === 'artist' ? 'Artist spotlight' : type === 'label' ? 'Label spotlight' : 'Genre spotlight'}
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: flip ? '#fff' : '#111', lineHeight: 1.25, marginBottom: 2, fontFamily: 'Barlow, sans-serif' }}>{name}</div>
          <div style={{ fontSize: 11, color: flip ? 'rgba(255,255,255,0.6)' : '#777', marginBottom: 6, fontFamily: 'VT323, monospace', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{count} post{count !== 1 ? 's' : ''} in the feed</span>
            {onFilterSubject && (
              <span onClick={() => onFilterSubject(name)} style={{ cursor: 'pointer', color: 'var(--theme-accent)', textDecoration: 'underline' }}>view all →</span>
            )}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', padding: '6px 12px' }}>
          {covers.slice(0, 3).map((p, i) => (
            <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 5, borderBottom: `0.5px solid ${flip ? 'rgba(255,255,255,0.1)' : '#f5f5f5'}`, marginBottom: 5 }}>
              <div style={{ width: 28, height: 28, borderRadius: 3, flexShrink: 0, overflow: 'hidden', background: flip ? 'rgba(255,255,255,0.15)' : '#eee' }}>
                {coverSrc(p) && <img src={coverSrc(p)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: flip ? '#fff' : '#222', fontFamily: 'Barlow, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                <div style={{ fontSize: 9, color: flip ? 'rgba(255,255,255,0.4)' : '#aaa', fontFamily: 'VT323, monospace' }}>{timeAgo(p.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '5px 12px 8px', flexShrink: 0, borderTop: `0.5px solid ${flip ? 'rgba(255,255,255,0.15)' : '#f0ede6'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: flip ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)', letterSpacing: '0.05em', fontFamily: 'VT323, monospace' }}>Spotlight · read only</span>
          <span style={{ fontSize: 9, color: flip ? 'rgba(255,255,255,0.4)' : '#ccc', fontFamily: 'VT323, monospace' }}><span style={{ color: flip ? 'rgba(255,255,255,0.7)' : '#aaa' }}>LNV</span> · editorial</span>
        </div>
      </div>
    </div>
  )
}

// ── Build shelf items ─────────────────────────────────────────────────────────
// One card per post — a spotlight post renders as a SpotlightCard, every
// other post renders as one self-contained PostCard. Spotlights are real
// posts returned by /api/posts in feed order (posts.js's triggerSpotlights)
// — no client-side injection needed.

function buildShelfItems(posts) {
  return posts.map(post => (
    post.is_spotlight
      ? { key: `p-${post.id}-spotlight`, kind: 'spotlight', post }
      : { key: `p-${post.id}`, kind: 'post', post }
  ))
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

function FeedIntro() {
  return (
    <div style={{
      flexShrink: 0,
      width: '100%',
      minWidth: '100%',
      height: '100%',
      background: 'var(--theme-showcase)',
      borderRight: '1px solid var(--theme-border)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      padding: 32,
      boxSizing: 'border-box',
      transition: 'background 0.8s, border-color 0.8s',
    }}>
      <div style={{ fontFamily: 'VT323, monospace', fontSize: 14, letterSpacing: '0.08em', color: 'var(--theme-text-ter)', textTransform: 'uppercase' }}>
        ▾ scroll to begin
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
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const shelfItems                    = useRef([])
  const lastPostsSignature            = useRef(null)
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
      if (!res.ok) return []
      const d = await res.json()
      return Array.isArray(d) ? d : (d.posts || [])
    },
    refetchInterval: search ? false : 30000,
  })
  const posts = Array.isArray(raw) ? raw : []

  const postsSignature = posts.map(p => p.id).join(',')
  if (postsSignature !== lastPostsSignature.current) {
    shelfItems.current = buildShelfItems(posts)
    lastPostsSignature.current = postsSignature
    // New result set (e.g. a search) — jump the shelf back to the start.
    if (feedRef?.current) feedRef.current.scrollLeft = 0
  }

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

  // Keyboard
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') setPickerOpen(false) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  function getCardBg(idx, item) {
    if (item?.kind === 'spotlight') return 'var(--theme-showcase)'
    if (idx >= SPECTRUM_START) return spectrumBg(idx, currentPalette.name)
    return `var(--theme-${POST_BG_CYCLE[idx % POST_BG_CYCLE.length]})`
  }

  function filterToSubject(name) {
    setSearchInput(name)
    setSearch(name)
    if (feedRef?.current) feedRef.current.scrollLeft = 0
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
      <div ref={feedRef} style={{ display: 'flex', flex: 1, gap: 0, overflowX: 'hidden', overflowY: 'hidden', alignItems: 'stretch', scrollbarWidth: 'none' }}>
        <FeedIntro />
        {!posts.length && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, fontFamily: 'VT323, monospace', fontSize: 14, color: 'var(--theme-text-sec)' }}>
            {search ? `No results for "${search}"` : 'No posts yet — share the first record.'}
          </div>
        )}
        {shelfItems.current.map((item, idx) => {
          const cardBg = getCardBg(idx, item)
          if (item.kind === 'spotlight') return <SpotlightCard key={item.key} post={item.post} cardBg={cardBg} flip={idx % 2 !== 0} onFilterSubject={filterToSubject} />
          return <PostCard key={item.key} post={item.post} cardBg={cardBg} spectrum={idx >= SPECTRUM_START} d={designFor(idx, detectType(item.post) === 'livemix')} />
        })}
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

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onPosted={() => { setComposeOpen(false); queryClient.invalidateQueries({ queryKey: ['posts'] }) }}
        />
      )}
    </div>
  )
}
