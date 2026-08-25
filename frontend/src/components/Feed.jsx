import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLayout } from '../context/LayoutContext'
import ComposeModal from './ComposeModal'
import Clock from './Clock'
import { RAIL_WIDTH, STRIP_OPEN_WIDTH } from './Strip'
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
  metalineSize:17, metalineLh:1.4, metalineMt:2,
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
// Y and (where they've drifted from DESIGN_BASE's shared X) X values below are
// gabriel's own, dragged in the Post Card Rail Editor artifact and pasted back
// verbatim (2026-08-24). trackX/captionX/descX/matX overrides are per-pair
// (W1/W3 vs W2/W4) rather than shared, since the rail editor let them diverge
// between the plate-top and plate-bottom cards.
// 2026-08-25: repliesY/stampY (the footer row: replies count + byline) nudged
// off the edge it used to sit flush against, on all three variants below --
// gabriel flagged (with a screenshot, red lines marking the empty band above
// and below a card's real content) that the footer sitting right at the card
// edge read as lopsided padding once you look at a single card on its own,
// even though PLATE_TOP/PLATE_BOTTOM were always meant to mirror EACH OTHER
// rather than be internally symmetric. PLATE_TOP: repliesY/stampY 790->726
// (was flush against cardH:820, now ~64px clear -- matches its own top gap,
// plateY:44 + platePt:20). PLATE_BOTTOM: repliesY/stampY 0->52 (was flush
// against the top, now ~64px clear, matching PLATE_TOP's new number). LIVE:
// repliesY/stampY 790->726, same fix as PLATE_TOP's bottom -- LIVE's own top
// (plateY:5) is still tight (~25px) and NOT touched here: pushing it out to
// 64px like the others would need plateY up near 44, which starts to eat
// into the ~236px gap before trackY:280 (worst-case 2-line artist name is
// assumed 252 tall elsewhere in this file -- 44+252 would just clear 280,
// close enough to want it re-checked live, not shipped blind). PLATE_BOTTOM's
// OTHER edge (pillsY:684, ~114px clear at the bottom) is untouched for the
// same reason -- closing it the rest of the way means moving plate/track/
// pills, not just the footer, without a live render to verify against. No
// browser access this session (standing limitation) -- numbers are computed
// from the styles' own padding values, not measured off a render. Re-check
// with the Post Card / Live Set Rail Editor artifacts (2026-08-24) before
// trusting these are pixel-exact.
const PLATE_TOP = {   // W1 / W3
  plateY:44,  trackY:318, pillsY:482, repliesY:726, stampY:726,
  matY:28,    captionY:508, descY:568,
  trackX:-1,  captionX:60.4, descX:55.4,
}
const PLATE_BOTTOM = { // W2 / W4 - rail reads byline, plate, tracklist, pills
  repliesY:52, stampY:52, plateY:308, trackY:550, pillsY:684,
  descY:198,  captionY:289, matY:292,
  descX:57.4, captionX:61.4, matX:4,
}
// Live sets have no tracklist (the zone becomes Channel) and no bottom variant -
// the plate stays at the top on all four ways. Values are gabriel's own, taken
// from the live-set reference screenshot; only the side and alignment mirror.
// Live-set embeds are not square and their height depends on the platform
// (YouTube 560x315, SoundCloud 480x166, Mixcloud 400x60), so the caption sits
// below the TALLEST of them - 278 + 315 = 593 - rather than below the
// SoundCloud embed in the reference screenshot. A short embed therefore leaves
// more air above the caption than a tall one.
// Y values and cardW below are gabriel's own, dragged in the Live Set Rail
// Editor artifact and pasted back verbatim (2026-08-24). cardW:900 (vs the
// shared DESIGN_BASE.cardW:800) is live-only — designFor() only merges LIVE
// in for isLiveMix posts, so this widens live-set cards without touching
// album cards, no other code changes needed.
const LIVE = {
  plateY:5,   trackY:280, pillsY:346, repliesY:726, stampY:726,
  matY:169,   captionY:488, descY:536,
  cardW:900,
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
function labelName(p)  { return p.labels?.[0]?.label_name  || p.labels?.[0]?.name  || p.label_name  || '' }
function channelName(p){ return p.channel || '' }
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

// TEMP (2026-08-25) — placeholder discography data, purely so the visual
// design of this feature (list layout, on-site/not-yet split, embed zone,
// cta) can be reviewed before the real wiring exists. Checked directly:
// every post_artists.discogs_artist_id and post_labels.discogs_label_id
// row in the DB is NULL right now — ComposeModal drops the id before a
// post ever reaches the DB (see claude/2026-08-25-search-todo.md) — so
// subjectDiscogsId() never resolves for any real subject and the feature
// would otherwise show nothing at all to look at. Split into two arrays
// (rather than fake posts.discogs_id matching) so both list sections and
// the cta's on-site/not-yet branching are all visible without depending on
// real id matching. DELETE this block, the `usingPlaceholders` branches
// below, and restore hasDiscography's `&& !!discogsId` once ComposeModal
// keeps real ids and there's real data to test against instead.
const PLACEHOLDER_ON_SITE = [
  { id: -1, title: 'Placeholder — On The Site A', year: 2021, thumb: null, role: null },
  { id: -2, title: 'Placeholder — On The Site B', year: 2019, thumb: null, role: null },
]
const PLACEHOLDER_NOT_YET = [
  { id: -3, title: 'Placeholder — Not Yet Uploaded A', year: 2023, thumb: null, role: null },
  { id: -4, title: 'Placeholder — Not Yet Uploaded B', year: 2022, thumb: null, role: null },
  { id: -5, title: 'Placeholder — Not Yet Uploaded C', year: 2020, thumb: null, role: null },
]

function SpotlightCard({ subject, cardBg, cardKey, onCreateFromDiscogs }) {
  const { registerPostRef, openD3 } = useLayout() || {}
  const { type, name, posts } = subject
  const recent = posts.slice(0, 4)
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
  const markImageUrl = discogsProfile?.imageUrl || null

  // Discogs discography — 2026-08-25, generalized in a fourth pass. Used
  // to be gated on buildSpotlightPool tagging a subject `unknown` (exactly
  // one loaded post, the only case a discography backfill made sense in
  // when this started); gabriel then asked for it to apply to every artist
  // AND every label spotlight regardless of post count. The gate is now
  // just "has a Discogs id and isn't a channel" — channels aren't a
  // Discogs entity (see subjectDiscogsId above), so there's nothing to
  // fetch for them and they keep the plain real-posts grid/list.
  //
  // Fetches a lean release list first (no tracklist/videos — see
  // discogsService's getArtistReleases/getLabelReleases), then lazily
  // fetches ONE release's full detail (including videos) only once the
  // user has picked it, rather than pulling full detail for every release
  // upfront — keeps this well inside Discogs' rate limit even for an
  // artist or label with a large catalogue.
  // TEMP (2026-08-25): gate is "not a channel" only, not `&& !!discogsId`
  // — see PLACEHOLDER_ON_SITE/PLACEHOLDER_NOT_YET's comment above. Restore
  // the discogsId condition once real ids exist to test with.
  const hasDiscography = type !== 'channel'
  const usingPlaceholders = hasDiscography && !discogsId
  const [selectedReleaseId, setSelectedReleaseId] = useState(null)
  const { data: discography } = useQuery({
    queryKey: ['spotlight-discography', type, discogsId],
    queryFn: async () => {
      const endpoint = type === 'label' ? 'label' : 'artist'
      const res = await fetch(`${API}/discogs/${endpoint}/${discogsId}/releases`)
      if (!res.ok) return null
      return res.json()
    },
    enabled: hasDiscography && !!discogsId,
    staleTime: Infinity,
  })
  // Releases already posted to LNV (their Discogs release id matches one
  // of this subject's loaded posts) sort to the top, ahead of everything
  // not yet uploaded. Only checked against `posts` — the loaded feed
  // window, not a DB-wide query — same caveat as the rest of this feature:
  // a release posted outside the currently loaded ~60 posts won't be
  // flagged even if it's really on the site.
  const allReleases = discography?.releases || []
  const onSiteIds = new Set(posts.map(p => p.discogs_id).filter(Boolean))
  const onSiteItems = usingPlaceholders ? PLACEHOLDER_ON_SITE : allReleases.filter(r => onSiteIds.has(r.id))
  const notYetItems = usingPlaceholders ? PLACEHOLDER_NOT_YET : allReleases.filter(r => !onSiteIds.has(r.id))
  const discographyItems = [...onSiteItems, ...notYetItems]
  // Derived, not stored: falls back to the first release (an already-
  // on-site one when there is one, otherwise Discogs' own top-of-list
  // pick) once the list loads, so the visual zone shows something real
  // immediately — an embed loads without waiting for a click — rather
  // than an effect+setState round trip (which would trigger an extra
  // render pass). A real click always wins once one happens
  // (selectedReleaseId is then one of discographyItems' own ids).
  const selectedRelease = discographyItems.find(r => r.id === selectedReleaseId) || discographyItems[0] || null

  const { data: selectedFull } = useQuery({
    queryKey: ['spotlight-release', selectedRelease?.id],
    queryFn: async () => {
      const res = await fetch(`${API}/discogs/release/${selectedRelease.id}`)
      if (!res.ok) return null
      return res.json()
    },
    enabled: !!selectedRelease && selectedRelease.id > 0, // skip placeholder (negative-id) releases — nothing real to fetch
    staleTime: Infinity,
  })
  const selectedYtId = (() => {
    const v = (selectedFull?.videos || []).find(v => /youtube\.com|youtu\.be/.test(v.url || ''))
    if (!v) return null
    const m = v.url.match(/(?:v=|youtu\.be\/)([^&\s]{11})/)
    return m ? m[1] : null
  })()
  const selectedOnSite = !!selectedRelease && (usingPlaceholders
    ? PLACEHOLDER_ON_SITE.some(r => r.id === selectedRelease.id)
    : onSiteIds.has(selectedRelease.id))

  const textPri = 'var(--theme-text-pri)'
  const textSec = 'var(--theme-text-sec)'
  const textTer = 'var(--theme-text-ter)'
  const divider = 'var(--theme-border)'
  // Literal font stacks pulled straight from DESIGN_BASE (bodyFf/artistFf,
  // labelFf) so this card uses exactly the same fonts as PostCard rather
  // than falling back to the browser default — there's no global
  // font-family rule in this app, PostCard sets it per-element, and every
  // text node here needs to do the same.
  const BODY_FF = "'Barlow',sans-serif"
  const LABEL_FF = "'VT323',monospace"
  const postsLine = `${posts.length} ${type === 'channel' ? 'live set' : 'post'}${posts.length !== 1 ? 's' : ''} in the feed`

  // 2026-08-25 (Spotlight Card Editor, second pass) — replaces the old
  // rail(276px)/media two-column split with one stacked layout shared by
  // all three subject types: badge+mark, name, metaline, dashed rule, a
  // visual zone, a caption line, a recent/discography list, then a cta
  // row. Same skeleton gabriel built and tuned in the editor artifact
  // (https://claude.ai/code/artifact/30033b88-ff72-41a6-8063-ba4ed822de7e),
  // ported with two adjustments the editor's absolute-px mockup couldn't
  // capture on its own: card width stays DESIGN_BASE.cardW (800, matching
  // every other card in the feed — "Spotlights use the same standard width
  // so they read as 'one of these cards'", see the comment above
  // DESIGN_BASE — rather than the editor's own 700px preview canvas), and
  // the card's real rendered height is whatever the feed row is (100vh via
  // #scroll-inner, not the editor's fixed 702px mock), so the vertical
  // rhythm below is expressed as flex padding/gaps with the visual zone as
  // the one flex:1 element, instead of the editor's baked-in Y coordinates.
  // Horizontal padding is SPOTLIGHT_PAD (see its own comment above),
  // shared card-wide so every element sits at the same inset instead of
  // the media sitting further in than the text around it.

  return (
    <div
      ref={el => registerPostRef?.(cardKey, el)}
      style={{ flexShrink: 0, width: DESIGN_BASE.cardW, height: '100%', background: cardBg, borderRight: `1px solid ${divider}`, display: 'flex', flexDirection: 'column', padding: `65px ${SPOTLIGHT_PAD}px`, overflow: 'hidden', transition: 'background 0.8s' }}
    >
      {/* badge + mark */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '3px 8px', borderRadius: 3, background: 'var(--theme-accent)', color: '#fff', fontFamily: LABEL_FF, textTransform: 'uppercase' }}>{type} spotlight</span>
        <div style={{ width: type === 'channel' ? 66 : 70, height: 70, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {markImageUrl ? (
            type === 'artist' ? (
              <img src={markImageUrl} alt="" style={{ width: 70, height: 70, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${divider}` }} />
            ) : (
              <div style={{ width: 70, height: 70, borderRadius: 12, background: 'var(--theme-dark3)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, overflow: 'hidden' }}>
                <img src={markImageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
            )
          ) : SPOTLIGHT_MARK[type]}
        </div>
      </div>

      {/* name */}
      <div
        onClick={browsable ? () => openD3?.(type === 'artist' ? 'artists' : 'labels', { filter: name }) : undefined}
        style={{ flexShrink: 0, marginTop: 14, fontSize: 21, fontWeight: 700, lineHeight: 1.25, color: textPri, fontFamily: BODY_FF, cursor: browsable ? 'pointer' : 'default', wordBreak: 'break-word' }}
      >{name}</div>

      {/* metaline */}
      <div style={{ flexShrink: 0, marginTop: 6, fontSize: 17, color: textSec, fontFamily: BODY_FF }}>
        {hasDiscography && discography
          ? `${postsLine} · ${discography.pagination?.items ?? allReleases.length} on Discogs`
          : postsLine}
      </div>

      {/* dashed rule */}
      <div style={{ flexShrink: 0, marginTop: 10, borderTop: `1px dashed ${divider}` }} />

      {/* visual zone — recent covers, or (artist/label with a Discogs id)
          the selected release's embed/cover. No padding of its own — see
          SPOTLIGHT_PAD's own comment and the outer container's padding
          above, which now cover this along with everything else in the card. */}
      <div style={{ flex: 1, minHeight: 0, marginTop: 20, position: 'relative' }}>
        {hasDiscography ? (
          selectedRelease ? (
            <div style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', background: divider, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {selectedRelease.id < 0 ? (
                // Placeholder release (see PLACEHOLDER_ON_SITE/_NOT_YET) —
                // no real artwork or video to show, so a plainly-labeled
                // stand-in instead of an empty box, sized the same as a
                // real embed would be so the layout reads the same either way.
                <div style={{ width: '100%', maxWidth: 560, height: 315, borderRadius: 4, background: 'var(--theme-dark3)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
                  <span style={{ fontFamily: LABEL_FF, fontSize: 13, color: textTer, letterSpacing: '0.04em' }}>PLACEHOLDER EMBED<br />{selectedRelease.title}</span>
                </div>
              ) : selectedYtId ? (
                // Same fixed size as a live-set card's YouTube embed
                // (DESIGN_BASE / PostCard's isLiveMix branch: [embedW,
                // embedH] = [560, 315] for YouTube) — not a stretch-to-fill
                // iframe, so a video here looks exactly like a video
                // anywhere else in the feed.
                <iframe
                  src={`https://www.youtube.com/embed/${selectedYtId}?rel=0&modestbranding=1`}
                  style={{ width: '100%', maxWidth: 560, height: 315, border: 'none', borderRadius: 4 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen title={selectedRelease.title} />
              ) : (
                (selectedFull?.coverImage || selectedFull?.thumbImage || selectedRelease.thumb) && (
                  <img src={selectedFull?.coverImage || selectedFull?.thumbImage || selectedRelease.thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                )
              )}
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: textTer, fontFamily: LABEL_FF, fontSize: 12.5 }}>
              {discography === undefined ? 'fetching discography…' : 'no Discogs history found'}
            </div>
          )
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, Math.min(4, recent.length))}, 1fr)`, gap: 2, borderRadius: 12, overflow: 'hidden', background: divider }}>
            {recent.slice(0, 4).map((p, i) => coverSrc(p)
              ? <img key={p.id} src={coverSrc(p)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div key={i} style={{ background: 'var(--theme-dark3)' }} />)}
          </div>
        )}
      </div>

      {/* caption */}
      <p style={{ flexShrink: 0, margin: 0, marginTop: 14, fontSize: 12.5, lineHeight: 1.55, color: textSec, fontFamily: BODY_FF, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {hasDiscography
          ? (selectedRelease
              ? `${selectedRelease.title}${selectedRelease.year ? ` · ${selectedRelease.year}` : ''}${selectedOnSite ? '' : ' · not in the feed yet'}`
              : `Pulling ${name}'s Discogs catalogue…`)
          : type === 'channel'
            ? `${posts.length} live set${posts.length !== 1 ? 's' : ''} deep and counting — here's what's landed under this channel so far.`
            : `${posts.length} record${posts.length !== 1 ? 's' : ''} deep and counting — here's a closer look at what's landed under this name so far.`}
      </p>

      {/* recent list / discography picker — for artist/label subjects this
          is now always the discography list (not gated to a single-post
          "unknown" case any more), a real scrollable list (maxHeight + its
          own overflowY, so a big discography can't blow out the card's
          fixed height), split into an "already on the site" section first
          and a gap down to "not yet uploaded". Channels have no Discogs
          entity, so they keep the plain real-posts "Recent sets" list. */}
      <div style={{ flexShrink: 0, marginTop: 14 }}>
        {hasDiscography ? (
          discography === undefined ? (
            <>
              <div style={{ fontFamily: LABEL_FF, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: textTer, marginBottom: 8 }}>Discography</div>
              <div style={{ fontSize: 11, color: textTer, fontFamily: LABEL_FF }}>fetching discography…</div>
            </>
          ) : discographyItems.length === 0 ? (
            <>
              <div style={{ fontFamily: LABEL_FF, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: textTer, marginBottom: 8 }}>Discography</div>
              <div style={{ fontSize: 11, color: textTer, fontFamily: LABEL_FF }}>no Discogs history found</div>
            </>
          ) : (
            <div style={{ maxHeight: 140, overflowY: 'auto' }}>
              {onSiteItems.length > 0 && (
                <>
                  <div style={{ fontFamily: LABEL_FF, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: textTer, marginBottom: 8 }}>Already on the site</div>
                  {onSiteItems.map(r => (
                    <div key={r.id} onClick={() => setSelectedReleaseId(r.id)}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: `1px dotted ${divider}`, cursor: 'pointer', background: selectedRelease?.id === r.id ? 'rgba(232,93,4,0.1)' : 'transparent' }}>
                      {r.thumb && <img src={r.thumb} alt="" style={{ width: 22, height: 22, borderRadius: 3, flexShrink: 0, objectFit: 'cover' }} />}
                      <span style={{ flex: 1, fontSize: 12, color: selectedRelease?.id === r.id ? textPri : textSec, fontWeight: selectedRelease?.id === r.id ? 600 : 400, fontFamily: BODY_FF, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                      <span style={{ fontSize: 9, color: textTer, fontFamily: 'monospace', flexShrink: 0 }}>{r.year || ''}</span>
                    </div>
                  ))}
                  <div style={{ height: 14 }} />
                </>
              )}
              <div style={{ fontFamily: LABEL_FF, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: textTer, marginBottom: 8 }}>
                {onSiteItems.length > 0 ? 'Not yet uploaded' : 'From Discogs — not in the feed yet'}
              </div>
              {notYetItems.map(r => (
                <div key={r.id} onClick={() => setSelectedReleaseId(r.id)}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: `1px dotted ${divider}`, cursor: 'pointer', background: selectedRelease?.id === r.id ? 'rgba(232,93,4,0.1)' : 'transparent' }}>
                  {r.thumb && <img src={r.thumb} alt="" style={{ width: 22, height: 22, borderRadius: 3, flexShrink: 0, objectFit: 'cover' }} />}
                  <span style={{ flex: 1, fontSize: 12, color: selectedRelease?.id === r.id ? textPri : textSec, fontWeight: selectedRelease?.id === r.id ? 600 : 400, fontFamily: BODY_FF, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  <span style={{ fontSize: 9, color: textTer, fontFamily: 'monospace', flexShrink: 0 }}>{r.year || ''}</span>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            <div style={{ fontFamily: LABEL_FF, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: textTer, marginBottom: 8 }}>Recent sets</div>
            <div>
              {recent.slice(0, 3).map(p => (
                <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: `1px dotted ${divider}` }}>
                  {coverSrc(p) && <img src={coverSrc(p)} alt="" style={{ width: 22, height: 22, borderRadius: 3, flexShrink: 0, objectFit: 'cover' }} />}
                  <span style={{ flex: 1, fontSize: 12, color: textSec, fontFamily: BODY_FF, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                  <span style={{ fontSize: 9, color: textTer, fontFamily: 'monospace', flexShrink: 0 }}>{timeAgo(p.created_at)}</span>
                </div>
              ))}
              {posts.length > 3 && <div style={{ fontSize: 9, color: textTer, fontFamily: LABEL_FF, marginTop: 4 }}>+{posts.length - 3} more</div>}
            </div>
          </>
        )}
      </div>

      {/* cta row — 2026-08-25 fourth pass: now context-sensitive to the
          currently selected release rather than a single fixed action.
          When one's picked and it's already on the site, "view all →"
          (browse the artist/label) makes more sense than an add button
          that would just re-post a duplicate; when it's not on the site
          yet, "+ add to feed" is the useful action. Falls back to plain
          "view all →" while discography is still loading/empty, or for
          channels (no discography at all). */}
      <div style={{ flexShrink: 0, marginTop: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {hasDiscography && selectedRelease && !selectedOnSite ? (
          <button
            onClick={() => onCreateFromDiscogs?.(`https://www.discogs.com/release/${selectedRelease.id}`)}
            style={{ background: 'var(--theme-accent)', border: 'none', borderRadius: 20, padding: '7px 18px', color: '#fff', fontFamily: LABEL_FF, fontSize: 13, letterSpacing: '0.04em', cursor: 'pointer' }}
          >+ add to feed</button>
        ) : browsable ? (
          <span onClick={() => openD3?.(type === 'artist' ? 'artists' : 'labels', { filter: name })} style={{ fontSize: 11, fontWeight: 600, cursor: 'pointer', color: 'var(--theme-accent)', fontFamily: BODY_FF, borderBottom: '1px dotted currentColor' }}>view all →</span>
        ) : <span />}
        <span style={{ fontSize: 10, fontFamily: LABEL_FF, color: textSec }}>LNV · editorial</span>
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

function buildSpotlightPool(posts) {
  const byArtist = new Map()
  const byLabel = new Map()
  const byChannel = new Map()
  for (const p of posts) {
    const a = artistName(p)
    if (a) { if (!byArtist.has(a)) byArtist.set(a, []); byArtist.get(a).push(p) }
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
        <span>←</span>
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

  function getCardBg(idx, item) {
    if (item?.kind === 'spotlight') return 'var(--theme-showcase)'
    if (idx >= SPECTRUM_START) return spectrumBg(idx, currentPalette.name)
    return `var(--theme-${POST_BG_CYCLE[idx % POST_BG_CYCLE.length]})`
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
        <FeedIntro clockWrapRef={clockWrapRef} scrollCueRef={scrollCueRef} />
        {!posts.length && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, fontFamily: 'VT323, monospace', fontSize: 14, color: 'var(--theme-text-sec)' }}>
            {search ? `No results for "${search}"` : 'No posts yet — share the first record.'}
          </div>
        )}
        {shelfItems.current.map((item, idx) => {
          const cardBg = getCardBg(idx, item)
          if (item.kind === 'spotlight') return <SpotlightCard key={item.key} cardKey={item.key} subject={item.subject} cardBg={cardBg} onCreateFromDiscogs={openComposeWithUrl} />
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
          initialUrl={composeInitialUrl}
          onClose={() => { setComposeOpen(false); setComposeInitialUrl('') }}
          onPosted={() => { setComposeOpen(false); setComposeInitialUrl(''); queryClient.invalidateQueries({ queryKey: ['posts'] }) }}
        />
      )}
    </div>
  )
}
