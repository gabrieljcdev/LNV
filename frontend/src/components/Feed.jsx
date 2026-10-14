import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useLayout } from '../context/LayoutContext'
import ComposeModal from './ComposeModal'
import Clock from './Clock'
import SearchBox from './SearchBox'
import { RAIL_WIDTH, STRIP_OPEN_WIDTH, STRIP_RADIUS } from './Strip'
import { getUserId, isAdmin, authHeaders, isLoggedIn, getUser } from '../lib/auth'
import { useFeedMode, setFeedMode, homeMode, setHomeFriends, openWall, openPlaylistFeed, playlistsApi, trackFrom, useIntroductions, usePlaylists, playableTracks } from '../lib/collections'
import { askText } from './Dialogs'
import Login from '../pages/Login'
import { FeedSwitcher, WallLink, MainNumber, AddToPlaylistButton, FollowedTag, AlsoPosted, CommentAuthor, HeartButton, WallCard, FavHeart, IntroCard, WelcomeCard } from './Collect'
import { usePhone } from '../lib/usePhone'
import { withoutHeadings, linkKeys } from '../lib/tracklist'
import { AddLinkRow, UserLinkNote } from './TrackLinkAdd'
import { PALETTES, getAutoIndex, applyPalette, getActivePaletteName } from '../services/themeService'
import { BLOCK_SPECTRUM } from '../services/blockSpectrum'
import { INK_DARK_BG, INK_LIGHT_BG, bgIsDark, inkOnHex, BLOCK_CP, BLOCK_CSS, themeHex, useThemeTick } from '../lib/blocksKit'
import { MODULE_CARDS, MODULE_CSS, moduleLook, solid } from '../lib/moduleKit'
import { Blk } from './Blocks'
import { SPECTRUM_START, spectrumBg } from '../services/postSpectrum'
import { installPlayerGuard, trackEmbedSrc } from '../lib/playerGuard'
import TrackPlayer from './TrackPlayer'
import { toEmbedSrc } from '../lib/embeds'
import { useDiscogsAccount, useDiscogsRecords } from '../lib/discogsAccount'
import { SOURCE_SHORT, SOURCE_NAME, useSourcePref, urlForTrack, platformOf } from '../lib/sources'
import { useListening, pickUrl } from '../lib/listening'
import ListeningSettings from './ListeningSettings'
import { DiscogsPrompt } from './DiscogsConnect'
import { releaseTag, roleGroup, ROLE_PILL, cleanLabelName } from '../lib/catalogue'

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
  cardW: 800, cardH: 820, cardRadius: 0, infoW: 312, // 312 (was 280) 2026-10-01: +32 for the rail's new outer padding, so the rail text keeps its width
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
  descSize: 13, descLh: 1.5, descMt: 14, descMtTop: 28, // descMtTop 28 (was 0) 2026-10-01: room between the caption and the description
  // The description's label ("Post title", was "Post description" —
  // gabriel, 2026-10-01): its own size, larger than the other zone labels.
  postLabelSize: 12, postLabelMb: 10,

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
  padY: 90, bandPadX: 32, // padY 90 = the old 58px gap + 32px padding: 2026-09-30 cards fill the screen height (FLOAT_INSET_Y 0) with content left exactly where it was (90px down). Was 120 before 2026-09-26, then 32 with a 58px gap.
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
const SPOTLIGHT_EVERY = 5 // superseded by SPOTLIGHT_ROUTINE (2026-10-02); kept for the comments that cite it

// Feed rhythm (2026-10-02, from the "LNV Feed Rhythm" mockup gabriel picked):
// - spotlights come after 3, then 5, then 4 posts, on repeat, and their
//   subject rotates artist -> label -> channel (a type with no subject is skipped);
// - in a run of back-to-back singles every second one is mirrored (art on
//   the left), so pairs face each other like a book spread;
// "Sides" (5-post sides with marker cards) is parked for later.
const SPOTLIGHT_ROUTINE = [3, 5, 4]
const SPOTLIGHT_TYPES = ['artist', 'label', 'channel']

// Feed lazy loading: posts per page, and how far from the end of what's
// loaded the next page is fetched (60 / 10 → at post 50, 110, 170…).
const FEED_PAGE = 60
const FEED_LOAD_AHEAD = 10
const SPOTLIGHT_MIN_POSTS = 3


// ── Helpers ────────────────────────────────────────────────────────────────────

const asUtc = d => new Date(typeof d === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(d) ? d.replace(' ', 'T') + 'Z' : d)
// "Sat 10 Oct · 03:12" in the viewer's own time
const stampOf = d => { const t = asUtc(d); return isNaN(t) ? '' : `${t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(t.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })} · ${t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` }
const stampShort = d => { const t = asUtc(d); return isNaN(t) ? '' : `${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(t.getFullYear() !== new Date().getFullYear() ? { year: '2-digit' } : {}) })} · ${t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` }
function timeAgo(d) {
  if (!d) return ''
  const s = (Date.now() - asUtc(d)) / 1000
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
// The player for a post, or for one of its tracks (trackUrl) — the same
// platform rules as PostCard's inline version: a Bandcamp track's own
// player, else YouTube > SoundCloud > Mixcloud > the post's Bandcamp player.
// `ratio` is width / height for a box that scales with the screen; `h` a
// fixed height for the bar players. Used by the phone card (2026-10-05).
function postEmbed(post, trackUrl = null) {
  const tracks = post.tracks || []
  const url = trackUrl || post.stream_url || post.embed_url || tracks[0]?.youtube_url || tracks[0]?.stream_url || ''
  const live = detectType(post) === 'livemix'
  const track = trackUrl ? tracks.find(t => (t.stream_url || t.youtube_url) === trackUrl) : null
  if (/bandcamp\.com\/EmbeddedPlayer/i.test(track?.embed_url || '')) return { src: track.embed_url, ratio: 1 }
  const yt = url.match(/(?:v=|youtu\.be\/|embed\/)([^&\s?]{11})/)?.[1]
  if (yt) return { src: `https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1&color=white&enablejsapi=1&playsinline=1`, ratio: 16 / 9 }
  if (/soundcloud\.com/i.test(url)) return live
    ? { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23e85d04&auto_play=true&hide_related=true&show_comments=false&show_user=true&visual=false`, h: 166 }
    : { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23e85d04&auto_play=true&hide_related=true&show_comments=false&show_user=true&visual=true`, ratio: 1 }
  if (/mixcloud\.com/i.test(url)) return { src: `https://www.mixcloud.com/widget/iframe/?hide_cover=1&autoplay=1&feed=${encodeURIComponent(url.replace('https://www.mixcloud.com', ''))}`, h: 120 }
  if (/bandcamp\.com/i.test(url) && /bandcamp\.com\/EmbeddedPlayer/i.test(post.embed_url || '')) return { src: post.embed_url, ratio: 1 }
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
// Where the compose button locks (2026-10-08, gabriel): this far clear of the nav rail's right edge
// (the feed starts STRIP_RADIUS under the rail), in the notch beside the rail's rounded corner.
const COMPOSE_LOCK_GAP = 12
// One corner radius for everything that floats: cards, the intro panel,
// the nav strip (Strip.jsx), the compose card. 40 since 2026-09-30 (was
// 14) — gabriel wanted the strip rounder, then all the edges uniform.
const FLOAT_RADIUS = STRIP_RADIUS
// Cards are trimmed top and bottom by this much (the space shows the
// underlay + shadow). With padY 32 inside the card, content sits where the
// old 120px padding put it: 88 + 32 = 120.
// 58 (was 88): every card got the album card's height, gabriel 2026-09-26 —
// the album needs it so its 390px sleeve and the big number under the title
// fit on a 900px-tall screen; all cards now share that height.
// 0 (gabriel, 2026-09-30): cards fill the screen top to bottom. The 58px
// that used to sit outside each card (clearing the search bar) moved inside
// as padding (DESIGN_BASE.padY 32 → 90), so nothing inside moved. History:
// 88 → 58 (album fit) → 14 (briefly) → 58 (clear the search bar) → 0.
const FEED_DOT = 22
const FLOAT_INSET_Y = 0
// The live-set card's width is derived from its video height, sized from a
// fixed 120px of padding + inset per side (as before) so its width is
// unchanged: 90 (padY) + 30.
const LIVE_VIDEO_INSET_Y = 30
// Layered: a wide ambient halo (reads in the gaps either side — cards run
// full height, so that's where the lift shows), a deeper offset drop, and a
// tight contact edge.
// Opacities halved 2026-09-30 (were 0.22 / 0.38 / 0.12), gabriel.
const FLOAT_SHADOW = '0 0 48px rgba(0,0,0,0.11), 0 30px 60px -12px rgba(0,0,0,0.19), 0 2px 6px rgba(0,0,0,0.06)'
// The feed surface under the floating cards. History (2026-09-26): white
// with a dot grid, then a per-card contrasting underlay (parked), then white
// cards over the palette colour with dots, now the plain palette colour.
// Plain palette colour (dot grid removed 2026-09-26, gabriel). FEED_DOT is
// kept as the spacing unit it was introduced for.
const FEED_SURFACE = 'var(--theme-bg)'
// Text colours per card: the palette's --theme-text-* assume the palette's
// own light/dark, but a card can be any tone of it (dark1 in a light
// palette, a spectrum step…). FloatSlot sets light or dark ink on each card
// from its actual colour — for every card type, LiveSetCard and AlbumCard
// included — and re-checks when the palette changes.
// Tones are strong enough for >= 3:1 even on mid-tone spectrum cards, where
// neither white nor black has much room.
// 2026-10-02: tertiary text a touch stronger (.66 -> .72 / .60 -> .66) — it
// sat right at 3:1 on mid-tone spectrum cards. The --lv-* names are what
// AlbumCard / LiveSetCard read; they used to be set once by useCardInk and
// went stale when the palette changed (dark-on-dark after a switch).

// One floating card: FLOAT_INSET_Y of surface above and below, half the gap
// either side, and the card itself rounded and lifted (FLOAT_SHADOW).
function FloatSlot({ children, bare = false }) {
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
    <div data-float-slot="" style={{ flexShrink: 0, height: '100%', display: 'flex', padding: `${FLOAT_INSET_Y}px ${FLOAT_GAP / 2}px` }}>
      <div ref={cardWrapRef} style={{ flexShrink: 0, height: '100%', display: 'flex', ...(bare ? null : { borderRadius: FLOAT_RADIUS, overflow: 'hidden', boxShadow: FLOAT_SHADOW }), ...ink }}>
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
      {src && !err && <img src={src} alt="" loading="lazy" decoding="async" onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      {(!src || err) && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.1)', fontSize: 36 }}>◈</div>}
      {children}
    </div>
  )
}

// The heading above a post's description: the poster's own post title when
// the post has one (bigger, sentence case), otherwise the plain "Post title"
// zone label in the style it's given (gabriel, 2026-10-01).
function PostTitle({ post, labelStyle }) {
  const t = (post.post_title || '').trim()
  if (!t) return <div style={labelStyle}>Post title</div>
  return (
    <div style={{ ...labelStyle, fontFamily: DESIGN_BASE.bodyFf, fontSize: 17, fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.005em', textTransform: 'none', color: 'var(--theme-text-pri)', overflowWrap: 'anywhere' }}>{t}</div>
  )
}

// A small confirmation that opens beside the cursor (instead of the browser's own box). Esc or a click elsewhere cancels.
function ConfirmPop({ at, message, detail, confirmLabel = 'Delete', onConfirm, onCancel }) {
  useEffect(() => {
    const away = e => { if (!e.target.closest?.('[data-confirm-pop]')) onCancel() }
    const esc = e => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [onCancel])
  const W = 250
  const left = Math.min(Math.max(at.x - W / 2, 12), window.innerWidth - W - 12)
  const above = at.y > window.innerHeight - 170 // near the bottom of the screen: open upwards
  return createPortal(
    <div data-confirm-pop="" role="alertdialog" aria-label={message}
      style={{ position: 'fixed', zIndex: 10000, left, top: above ? at.y - 14 : at.y + 14, transform: above ? 'translateY(-100%)' : 'none', width: W, background: 'var(--theme-bg)', color: 'var(--theme-text-pri)', border: '1px solid var(--theme-border)', borderRadius: 16, boxShadow: '0 18px 44px rgba(0,0,0,0.38)', padding: '14px 16px 12px', fontFamily: 'Barlow, sans-serif' }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{message}</div>
      {detail && <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.35, color: 'var(--theme-text-sec)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{detail}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button autoFocus onClick={onConfirm} style={{ flex: 1, border: 'none', borderRadius: 99, background: 'var(--theme-accent)', color: '#fff', padding: '7px 0', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{confirmLabel}</button>
        <button onClick={onCancel} style={{ flex: 1, border: '1px solid var(--theme-border)', borderRadius: 99, background: 'none', color: 'var(--theme-text-sec)', padding: '7px 0', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cancel</button>
      </div>
    </div>, document.body)
}

// ── Comments ──────────────────────────────────────────────────────────────────

function CommentThread({ postId, onCountChange, d, maxH = 140, inputSize = 11, drawer = false, ownerName = null }) {
  const [comments, setComments] = useState(null) // null = not yet loaded
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [priv, setPriv] = useState(false) // the next reply goes to the post's owner only
  const [ask, setAsk] = useState(null) // the delete pop-up: where it opens and which comment

  useEffect(() => {
    let cancelled = false
    fetch(`${API}/posts/${postId}/comments`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setComments(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) setComments([]) })
    return () => { cancelled = true }
  }, [postId])

  const userId = getUserId()
  const meName = getUser()
  const canDelete = c => !!meName && (c.username === meName || ownerName === meName || isAdmin())
  async function remove(c) {
    try {
      const res = await fetch(`${API}/posts/${postId}/comments/${c.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error(String(res.status))
      setComments(prev => (prev || []).filter(x => x.id !== c.id))
      if (!c.private) onCountChange?.(Math.max(0, (comments || []).filter(x => !x.private && x.id !== c.id).length))
    } catch { window.alert('Could not delete that comment — try again.') }
  }

  async function submit() {
    const content = text.trim()
    if (!content || submitting || !userId) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`${API}/posts/${postId}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content, private: priv }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const saved = await res.json()
      setComments(prev => [...(prev || []), saved])
      if (!saved.private) onCountChange?.((comments || []).filter(c => !c.private).length + 1)
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
          {comments.map(c => drawer ? (
            <div key={c.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--lv-line)', fontFamily: d?.bodyFf ?? 'Barlow, sans-serif' }}>
              <span style={{ width: 36, height: 36, borderRadius: 11, border: '1px solid var(--lv-line)', display: 'grid', placeItems: 'center', font: '700 14px sans-serif', color: 'var(--lv-pri)', flexShrink: 0 }}>{c.username?.[0]?.toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 15, color: 'var(--lv-pri)' }}><CommentAuthor name={c.username} /></b>
                <span style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--lv-sec)', overflowWrap: 'anywhere' }}>{c.content}</span>
              </span>
              <span style={{ fontFamily: d?.monoFf ?? 'IBM Plex Mono, monospace', fontSize: 11.5, color: 'var(--lv-ter)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                {stampShort(c.created_at)}
                {c.private ? <><br /><span style={{ color: 'var(--theme-accent)' }}>🔒 private</span></> : null}
                {canDelete(c) ? <><br /><button onClick={e => setAsk({ x: e.clientX, y: e.clientY, c })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--lv-ter)' }}>delete</button></> : null}
              </span>
            </div>
          ) : (
            <div key={c.id} style={{ display: 'flex', gap: 6, fontSize: d?.cmSize ?? 12, fontFamily: d?.bodyFf ?? 'Barlow, sans-serif', lineHeight: 1.4 }}>
              <CommentAuthor name={c.username} />
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
            placeholder={priv ? `private to ${ownerName}…` : 'reply…'}
            style={{ flex: 1, minWidth: 0, borderRadius: 20, border: '1px solid var(--theme-border)', padding: '5px 12px', fontFamily: 'Barlow, sans-serif', fontSize: inputSize, background: 'var(--theme-dark3)', color: 'var(--theme-text-pri)', outline: 'none' }}
          />
          {ownerName && meName && ownerName !== meName && (
            <button onClick={() => setPriv(v => !v)} title={priv ? `Private: only you and ${ownerName} will see it` : `Make this reply private to ${ownerName}`} aria-pressed={priv}
              style={{ borderRadius: 20, border: `1px solid ${priv ? 'var(--theme-accent)' : 'var(--theme-border)'}`, background: priv ? 'color-mix(in srgb, var(--theme-accent) 18%, transparent)' : 'none', padding: '4px 10px', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>🔒</button>
          )}
          <button onClick={submit} disabled={!text.trim() || submitting}
            style={{ borderRadius: 20, border: 'none', padding: '5px 14px', fontFamily: 'VT323, monospace', fontSize: 11, background: 'var(--theme-accent)', color: '#fff', cursor: 'pointer', opacity: (!text.trim() || submitting) ? 0.5 : 1, flexShrink: 0 }}
          >{submitting ? '···' : 'reply'}</button>
        </div>
      ) : (
        <a href="/login" style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'var(--theme-accent)', textDecoration: 'none' }}>log in to reply →</a>
      )}
      {error && <div style={{ fontFamily: 'VT323, monospace', fontSize: 10, color: 'var(--theme-accent)', marginTop: 4 }}>{error}</div>}
      {ask && <ConfirmPop at={ask} message="Delete this comment?" detail={ask.c.content} onCancel={() => setAsk(null)} onConfirm={() => { const c = ask.c; setAsk(null); remove(c) }} />}
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
      const r = await fetch(`${API}/posts/${post.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.status) }
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    } catch (err) {
      window.alert(`Couldn't delete: ${err.message}`)
      setDeleting(false)
    }
  }
  return { queryClient, canModify, deleting, deletePost }
}

// A name on a card that opens its drawer straight to that artist / label /
// genre / DJ (gabriel, 2026-10-02: every card, not just the single one).
// Small text (labels) is dotted-underlined like a link; big names (`quiet`)
// underline on hover only, so the headline type isn't scored through.
function DrawerLink({ kind, name, quiet = false, style, children }) {
  const { openD3 } = useLayout() || {}
  const [hover, setHover] = useState(false)
  const open = e => { e.stopPropagation(); openD3?.(kind, { filter: name }) }
  return (
    <span role="link" tabIndex={0} title={`Open ${name} in the ${kind === 'live' ? 'live sets' : kind} drawer`}
      onClick={open} onKeyDown={e => { if (e.key === 'Enter') open(e) }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer',
        ...(quiet
          ? { textDecoration: hover ? 'underline' : 'none', textDecorationThickness: 2, textUnderlineOffset: 4 }
          : { borderBottom: '1px dotted currentColor' }),
        ...style,
      }}>{children}</span>
  )
}

function PostCard({ post, cardBg, d, onEdit }) {
  const { canModify, deleting, deletePost } = usePostActions(post)
  const { openD3, registerPostRef } = useLayout() || {}
  const [activeTrackUrl, setActiveTrackUrl] = useState(null)
  const [hoveredTrack, setHoveredTrack] = useState(null)
  const [srcPref, setSrcPref] = useSourcePref() // the listener's preferred source (lib/sources.js)
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
  // A clicked Bandcamp track carries its own player (track id); otherwise
  // it's the post's album/track player.
  const activeTrack = activeTrackUrl ? tracks.find(t => urlForTrack(t, srcPref) === activeTrackUrl) : null
  const activeIsOwn = !!activeTrack && activeTrackUrl === (activeTrack.stream_url || activeTrack.youtube_url) // another source's link has no Bandcamp embed
  const bcEmbed = activeIsOwn && /bandcamp\.com\/EmbeddedPlayer/i.test(activeTrack?.embed_url || '')
    ? activeTrack.embed_url
    : /bandcamp\.com/i.test(streamUrl) && /bandcamp\.com\/EmbeddedPlayer/i.test(post.embed_url || '')
      ? post.embed_url : null

  const embedSrc = bcEmbed
    ? bcEmbed
    : ytId
    ? `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&color=white&enablejsapi=1`
    : scUrl
    // visual=true: the artwork fills the player, so in the square art frame
    // it stands in for the cover. Live sets keep the compact bar in the well.
    ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(scUrl)}&color=%23e85d04&auto_play=false&hide_related=true&show_comments=false&show_user=true&visual=${isLiveMix ? 'false' : 'true'}`
    : mcUrl
    ? `https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(mcUrl.replace('https://www.mixcloud.com',''))}`
    : toEmbedSrc(streamUrl) // Spotify, Deezer, Apple Music (free sources) — null for anything else

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
  const postLinkKeys = linkKeys(tracks)
  const firstTrackUrl = tracks.map(t => urlForTrack(t, srcPref)).find(Boolean)
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
        style={{ fontSize: d.artistSize, fontWeight: d.artistWeight, lineHeight: d.artistLh, letterSpacing: `${d.artistLs}em`, textTransform: d.artistCase, color: textPri, fontFamily: d.artistFf, marginTop: d.artistMt, wordBreak: 'break-word' }}
      >{artist && !isVariousArtist(artist) ? <DrawerLink kind="artists" name={artist} quiet>{artist}</DrawerLink> : (artist || post.title)}</div>
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
          {label && <DrawerLink kind="labels" name={label}>{label}</DrawerLink>}
          {label && post.year && ' · '}
          {post.year}
        </div>
      )}
      <div aria-hidden="true" style={{ pointerEvents: 'none' /* its glyphs reach up over the metaline: clicks go to the label link */, fontSize: d.numeralSize, fontWeight: d.numeralWeight, lineHeight: d.numeralLh, letterSpacing: `${d.numeralLs}em`, opacity: d.numeralOpacity, color: textPri, fontFamily: d.numeralFf, margin: d.numeralMargin }}>
        {String(post.feedNumber ?? post.id).padStart(2, '0')}
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
              const tUrl = urlForTrack(t, srcPref)
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
              // + (a playlist) — 2026-10-03. The heart is the record's
              // (byline), not each track's — 2026-10-06.
              const actEl = tUrl ? (
                <span key="act" style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline', flexShrink: 0 }}>
                  <SourceChips track={t} activeUrl={activeTrackUrl} pref={srcPref} d={d} onPick={s => { setSrcPref(s.platform); setActiveTrackUrl(s.url) }} />
                  <AddToPlaylistButton tracks={[trackFrom(post, t)]} label="+" align={d.plateAlign === 'left' ? 'left' : 'right'} style={{ fontFamily: d.monoFf, fontSize: d.trackSize, color: textTer }} />
                </span>
              ) : null
              const order = d.plateAlign === 'left' ? [titleEl, durEl, numEl, actEl] : [actEl, numEl, durEl, titleEl]
              return (
                <div key={i}>
                <div
                  onClick={() => { if (tUrl) setActiveTrackUrl(isActive ? null : tUrl) }}
                  onMouseEnter={() => setHoveredTrack(i)}
                  onMouseLeave={() => setHoveredTrack(h => h === i ? null : h)}
                  style={{ display: 'flex', justifyContent: railJustify, gap: d.trackGap, alignItems: 'baseline', padding: `${d.trackRowpad}px 0`, cursor: tUrl ? 'pointer' : 'default', background: (isActive || isHovered) ? 'color-mix(in srgb, var(--theme-accent) 14%, transparent)' : 'transparent' }}>
                  {order}
                </div>
                {isActive && <PreviewPrompt post={post} track={t} linkKey={postLinkKeys[i]} activeUrl={activeTrackUrl} indent={0} />}
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
      <AddToPlaylistButton post={post} style={{ fontSize: d.metarowSize, color: textTer, fontFamily: d.bodyFf }} />
      <HeartButton post={post} style={{ fontSize: d.metarowSize, color: textTer, fontFamily: d.bodyFf }} />
      <FollowedTag post={post} />
      <WallLink name={post.user?.username || post.username} style={{ fontSize: d.handleSize, fontWeight: d.handleWeight, color: textPri, fontFamily: d.bodyFf }} />
      <AlsoPosted post={post} style={{ fontSize: d.handleSize, color: textPri, fontFamily: d.bodyFf }} />
      <MainNumber post={post} style={{ fontSize: d.stampSize, color: textTer, fontFamily: d.monoFf }} />
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
      <PostTitle post={post} labelStyle={{ ...zlabel, fontSize: d.postLabelSize, marginBottom: d.postLabelMb, flexShrink: 0 }} />
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
        // Outer side = bandPadX, the same side padding as the album card
        // (gabriel, 2026-10-01: the rail text sat on the card's edge).
        padding: d.mediaSide === 'left' ? `${d.padY}px ${d.bandPadX}px ${d.padY}px 26px` : `${d.padY}px 26px ${d.padY}px ${d.bandPadX}px`,
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
// Gap above the big post number on the live-set and album cards — the
// single card's numeralMargin top, so every number sits the same distance
// under the text above it (gabriel, 2026-10-02).
const NUMERAL_GAP = 4

// Width of a live-set card as a CSS length: its video's 16:9 width plus
// LIVE_PADX each side, where the video height is the full-size one or what
// fits the screen height. Shared so spotlights are exactly as wide as live
// sets at every screen size (gabriel, 2026-09-26).
function liveCardWidth() {
  const T = DESIGN_BASE
  // The paired live card: the info box (~345px) + gap + footer pill (~72px) under the video, PAIRED_PAD_Y above and below.
  const reserve = PAIRED_CARDS ? 2 * PAIRED_PAD_Y + 22 + 345 + 72 : 2 * (T.padY + LIVE_VIDEO_INSET_Y) + 330
  const videoH = `min(${Math.round((LIVE_W - 2 * LIVE_PADX) * 9 / 16)}px, calc(100vh - ${reserve}px))`
  return `calc(${videoH} * 16 / 9 + ${2 * LIVE_PADX}px)`
}

// A post is shown as a live set when it's typed as one, or its title reads
// like one ("Artist | Channel - Date", b2b, dj set, live at, session) —
// several older sets were saved as "album".
function isLiveSetPost(p) {
  // A stored type wins; the title guess is only for untyped old posts.
  if (p.post_type) return p.post_type === 'livemix'
  return detectType(p) === 'livemix' || /\|\s*.+\d{4}|\bb2b\b|dj set|live at|session/i.test(p.title || '')
}


function LiveSetCard({ post, cardBg, d, onEdit }) {
  const { registerPostRef, openD3 } = useLayout() || {}
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
  // ~3 description lines (beside the big post number) and the byline (~330px; was 270 before the number) are allowed for. The card
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


  const MONO = "'IBM Plex Mono', monospace", SANS = "'Barlow', sans-serif"
  const pill = { display: 'inline-block', fontFamily: SANS, fontWeight: 600, fontSize: 10, lineHeight: 1, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 8px', borderRadius: 3, textDecoration: 'none' }
  const discogsHref = post.discogs_url || (post.discogs_id ? `https://www.discogs.com/release/${post.discogs_id}` : null)

  if (PAIRED_CARDS) {
    const cap = { fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--lv-ter)' }
    const chip = { display: 'inline-block', margin: 0, fontFamily: SANS, fontWeight: 500, fontSize: 13, padding: '4px 11px', borderRadius: 99, border: '1px solid var(--lv-sec)', background: 'none', color: 'var(--lv-pri)', cursor: 'pointer', textDecoration: 'none' }
    const poster = post.user?.username || post.username
    const quoteText = (post.post_title || '').trim() || (note && note.length <= 300 && !post.post_title ? note : '')
    const showDesc = !!note && note !== quoteText
    return (
      <div ref={el => { registerPostRef?.(post.id, el); cardRef.current = el }}
        style={{ position: 'relative', flexShrink: 0, width: cardW, height: '100%', background: cardBg, padding: `${PAIRED_PAD_Y}px ${LIVE_PADX}px`, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'background 0.8s', color: 'var(--lv-pri)', boxSizing: 'border-box' }}>
        <style>{'@keyframes lnvShelfIn { from { transform: translateX(100%) } }'}</style>
        {/* the video, as wide as it always was */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', flexShrink: 0, overflow: 'hidden', borderRadius: T.artRadius }}>
          {playing && embedSrc ? (
            <TrackPlayer key={embedSrc} src={embedSrc} title={post.title} autoplay />
          ) : (
            <>
              {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => vid && setThumb(`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              <span style={{ ...pill, position: 'absolute', left: 18, top: 18, background: 'var(--theme-showcase)', color: '#fff' }}>● live set</span>
              {embedSrc && (
                <button onClick={() => setPlaying(true)} aria-label="Play set"
                  style={{ position: 'absolute', left: '50%', top: '50%', width: 92, height: 92, margin: '-46px 0 0 -46px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.92)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                  <span style={{ width: 0, height: 0, borderLeft: '26px solid #111', borderTop: '16px solid transparent', borderBottom: '16px solid transparent', marginLeft: 7 }} />
                </button>
              )}
              <span style={{ position: 'absolute', right: 14, top: 14, fontFamily: MONO, fontWeight: 500, fontSize: 11, letterSpacing: '0.08em', padding: '6px 9px', borderRadius: 99, background: 'var(--lv-pri)', color: cardBg }}>#{String(post.feedNumber ?? post.id).padStart(2, '0')}</span>
            </>
          )}
        </div>

        {/* under the video: ONE box (gabriel, 12 Oct) — the info on the left, the options on the right, the post along the bottom */}
        <div style={{ flex: '0 0 auto', marginTop: 22, border: `1px solid ${CARD_LINE}`, borderRadius: 28, background: 'color-mix(in srgb, var(--lv-pri) 9%, transparent)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 28, padding: '20px 26px 14px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                <span style={{ ...pill, fontSize: 10 * 0.82, background: 'var(--theme-showcase)', color: '#fff' }}>live set</span>
                {platform && <a href={streamUrl || undefined} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ ...pill, fontSize: 10 * 0.82, ...mutedPill(platform, 24) }}>{platform}</a>}
                {discogsHref && <a href={discogsHref} target="_blank" rel="noopener noreferrer" style={{ ...pill, fontSize: 10 * 0.82, background: 'color-mix(in srgb, var(--lv-pri) 8%, transparent)', color: 'var(--lv-sec)' }}>◈ discogs</a>}
              </div>
              <div style={{ fontFamily: T.artistFf, fontWeight: T.artistWeight, fontSize: Math.min(T.artistSize, 38), lineHeight: T.artistLh, letterSpacing: `${T.artistLs}em`, color: 'var(--lv-pri)', wordBreak: 'break-word' }}>{artist ? <DrawerLink kind="live" name={artist} quiet>{artist}</DrawerLink> : artist}</div>
              <div style={{ marginTop: 4, fontFamily: T.artistFf, fontStyle: 'italic', fontSize: Math.min(T.titleSize, 22), lineHeight: T.titleLh, color: 'var(--lv-sec)', wordBreak: 'break-word' }}>{subtitle}</div>
              {post.channel && (
                <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 13, color: 'var(--lv-sec)' }}>
                  <DrawerLink kind="live" name={post.channel}>{post.channel}</DrawerLink>{' '}
                  <FavHeart kind="channel" name={post.channel} size={15} style={{ color: 'var(--lv-sec)' }} />
                  {post.year ? <span style={{ fontFamily: MONO, fontSize: 11, marginLeft: 10, color: 'var(--lv-ter)' }}>{post.year}</span> : null}
                </div>
              )}
              {post.genres?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: T.pillGap, marginTop: 12 }}>
                  {post.genres.slice(0, 5).map(g => (
                    <button key={g} onClick={() => openD3?.('genres', { filter: g })} style={{ fontSize: T.pillSize, background: 'var(--theme-dark3)', color: 'var(--lv-sec)', padding: `${T.pillPy}px ${T.pillPx}px`, borderRadius: T.pillRadius, fontFamily: T.bodyFf, border: 'none', cursor: 'pointer' }}>{g}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...cap, margin: '2px 0 10px' }}>Options</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <AddToPlaylistButton post={post} style={{ ...chip, fontSize: 13 }} />
                <HeartButton post={post} style={{ ...chip, fontSize: 13 }} />
                {streamUrl && <a href={streamUrl} target="_blank" rel="noopener noreferrer" style={{ ...chip, fontSize: 13 }}>↗ Open on {SOURCE_NAME[platform] || platform || 'the site'}</a>}
                {streamUrl && <button onClick={() => { try { navigator.clipboard?.writeText(streamUrl) } catch { /* no clipboard */ } }} style={{ ...chip, fontSize: 13 }}>⎘ Copy link</button>}
                <FollowedTag post={post} />
              </div>
            </div>
          </div>
          <div style={{ height: 1, margin: '0 26px', background: CARD_LINE }} />
          <div style={{ padding: '12px 26px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, fontFamily: SANS, fontSize: 16 }}>
              <b style={{ fontWeight: 600, letterSpacing: '-0.01em' }}>The post</b>
              <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--lv-sec)' }}>{commentCount} repl{commentCount === 1 ? 'y' : 'ies'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 28 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 6px', fontFamily: SANS, fontWeight: 500, fontSize: 13 }}>
                  <span>{poster}</span><span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 11, color: 'var(--lv-ter)' }}>{stampOf(post.created_at)}</span>
                </div>
                {quoteText && <p style={{ margin: 0, fontFamily: SANS, fontStyle: 'italic', fontSize: 18, lineHeight: 1.3, color: 'var(--lv-pri)', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{quoteText}</p>}
                {showDesc && <p style={{ margin: quoteText ? '8px 0 0' : 0, fontFamily: SANS, fontSize: 14, lineHeight: 1.45, color: 'var(--lv-sec)', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{note}</p>}
                {!quoteText && !showDesc && <p style={{ margin: 0, fontFamily: SANS, fontSize: 14, color: 'var(--lv-ter)' }}>No post text.</p>}
              </div>
              <div style={{ minWidth: 0 }}>
                <CardReplies fill={false} size={14} posterName={poster} post={post} count={commentCount} onCount={setCommentCount} onOpen={() => setCommentsOpen(true)} d={T} />
              </div>
            </div>
          </div>
        </div>

        {/* one pill across the foot, above the compose button */}
        <div style={{ flexShrink: 0, margin: '28px 0 0', height: 44, padding: '0 20px 0 5px', border: `1px solid ${CARD_LINE}`, borderRadius: 99, display: 'flex', alignItems: 'center', gap: 14, fontFamily: MONO, fontSize: 12 }}>
          {poster && <UserChip name={poster} d={T} />}
          <MainNumber post={post} style={{ fontFamily: MONO, fontSize: T.stampSize, color: 'var(--lv-ter)' }} />
          <span title={stampOf(post.created_at)} style={{ marginLeft: 'auto', color: 'var(--lv-sec)', whiteSpace: 'nowrap' }}>{stampOf(post.created_at)}</span>
          {canModify && <>
            <button onClick={() => onEdit?.(post)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--lv-ter)' }}>edit</button>
            <button onClick={deletePost} disabled={deleting} style={{ background: 'none', border: 'none', padding: 0, cursor: deleting ? 'default' : 'pointer', font: 'inherit', color: 'var(--theme-accent)', opacity: deleting ? 0.5 : 1 }}>{deleting ? 'deleting…' : 'delete'}</button>
          </>}
        </div>
        {commentsOpen && (
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 360, zIndex: 20, background: cardBg, borderLeft: '1px solid var(--lv-line)', boxShadow: '-18px 0 40px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', animation: 'lnvShelfIn 0.28s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '26px 24px 6px 26px', flexShrink: 0 }}>
              <h3 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: SANS, fontWeight: 900, fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.02em', color: 'var(--lv-pri)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artist || post.title}</h3>
              <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--lv-ter)', whiteSpace: 'nowrap' }}>{commentCount} repl{commentCount === 1 ? 'y' : 'ies'}</span>
              <button onClick={() => setCommentsOpen(false)} aria-label="Close replies" style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--lv-line)', background: 'color-mix(in srgb, var(--lv-pri) 7%, transparent)', color: 'var(--lv-sec)', cursor: 'pointer', fontSize: 16, flexShrink: 0, alignSelf: 'center' }}>×</button>
            </div>
            <div data-inner-scroll="" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 24px 14px 26px', ...INNER_SCROLL_STYLE }}>
              {note && <div style={{ fontFamily: SANS, fontStyle: 'italic', fontWeight: 300, fontSize: 18, lineHeight: 1.4, color: 'var(--lv-pri)', paddingLeft: 12, borderLeft: '3px solid var(--theme-accent)', whiteSpace: 'pre-line', overflowWrap: 'anywhere', margin: '10px 0' }}>{note}</div>}
              <CommentThread postId={post.id} onCountChange={setCommentCount} d={T} maxH={9999} inputSize={13} drawer ownerName={poster} />
            </div>
          </div>
        )}
      </div>
    )
  }

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
            {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => vid && setThumb(`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`)}
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
          <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 11, letterSpacing: '0.08em', color: 'var(--lv-sec)' }}>00-{post.feedNumber ?? post.id}</div>
          <div style={{ fontFamily: T.artistFf, fontWeight: T.artistWeight, fontSize: T.artistSize, lineHeight: T.artistLh, letterSpacing: `${T.artistLs}em`, textTransform: T.artistCase, marginTop: 10, color: 'var(--lv-pri)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artist ? <DrawerLink kind="live" name={artist} quiet>{artist}</DrawerLink> : artist}</div>
          <div style={{ fontFamily: T.artistFf, fontStyle: 'italic', fontSize: T.titleSize, lineHeight: T.titleLh, letterSpacing: `${T.titleLs}em`, marginTop: 4, color: 'var(--lv-sec)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
          {/* The channel, with its ♥ (2026-10-05, gabriel) — as on phones. */}
          {post.channel && (
            <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 13, color: 'var(--lv-sec)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <DrawerLink kind="live" name={post.channel}>{post.channel}</DrawerLink>{' '}
              <FavHeart kind="channel" name={post.channel} size={15} style={{ color: 'var(--lv-sec)' }} />
            </div>
          )}
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

      {/* post description (same label, size and in-card scroll as the
          regular post card), then the big post number under it — same size,
          weight, fade and 4px gap as on the single and album cards — and its
          line at the bottom of the column (gabriel, 2026-10-02: moved from
          the right, under the badges and year, to this side). */}
      <div style={{ marginTop: 22, flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', maxWidth: 760 }}>
        <PostTitle post={post} labelStyle={{ fontFamily: T.labelFf, fontWeight: 600, fontSize: T.postLabelSize, letterSpacing: `${T.zlabelLs}em`, textTransform: 'uppercase', color: 'var(--lv-ter)', marginBottom: T.postLabelMb, flexShrink: 0 }} />
        {note ? (
          <p ref={descRef} data-inner-scroll={descFit.overflows ? '' : undefined} onScroll={descFit.onScroll}
            style={{ fontSize: T.descSize, lineHeight: T.descLh, fontFamily: T.bodyFf, color: 'var(--lv-sec)', margin: 0, minHeight: (note.length > 120 ? 3 : 1) * Math.round(T.descSize * T.descLh), flex: '0 1 auto', overflowWrap: 'anywhere', whiteSpace: 'pre-line', overflowY: descFit.overflows ? 'auto' : 'hidden', paddingRight: descFit.overflows ? 6 : 0, ...INNER_SCROLL_STYLE, ...fadeMask(descFit) }}>{note}</p>
        ) : (
          <p style={{ fontSize: T.descSize, fontFamily: T.bodyFf, fontStyle: 'italic', color: 'var(--lv-ter)', margin: 0 }}>No description</p>
        )}
        <div aria-hidden="true" style={{ pointerEvents: 'none' /* decoration: never swallow clicks on the text above */, flexShrink: 0, margin: T.numeralMargin, marginTop: NUMERAL_GAP, fontFamily: T.numeralFf, fontWeight: T.numeralWeight, fontSize: T.numeralSize, lineHeight: T.numeralLh, letterSpacing: `${T.numeralLs}em`, opacity: T.numeralOpacity, color: 'var(--lv-pri)' }}>
          {String(post.feedNumber ?? post.id).padStart(2, '0')}
        </div>
        {/* Line right under the number, as on the single and album cards
            (gabriel, 2026-10-02: no longer pinned to the bottom). */}
        <div style={{ flexShrink: 0, width: T.artSize, height: 1, background: 'var(--lv-line)', margin: `${T.ruleSolidMy}px 0` }} />
      </div>

      {/* Genre pills (2026-10-05, gabriel) — as on single cards. */}
      {post.genres?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: T.pillGap, flexShrink: 0 }}>
          {post.genres.slice(0, 6).map(g => (
            <button key={g} onClick={() => openD3?.('genres', { filter: g })}
              style={{ fontSize: T.pillSize, background: 'var(--theme-dark3)', color: 'var(--lv-sec)', padding: `${T.pillPy}px ${T.pillPx}px`, borderRadius: T.pillRadius, fontFamily: T.bodyFf, border: 'none', cursor: 'pointer' }}>{g}</button>
          ))}
        </div>
      )}

      {/* byline — kept quiet at the bottom. edit/delete on the left, replies
          on the right, clear of the number's line (gabriel, 2026-10-02). */}
      <div style={{ marginTop: 'auto', paddingTop: T.bylineMt, display: 'flex', gap: 14, alignItems: 'baseline', fontFamily: MONO, fontSize: 11, lineHeight: '15px' /* = the album byline's height, so the numbers sit level */, letterSpacing: '0.06em', color: 'var(--lv-ter)', flexShrink: 0 }}>
        {canModify && (
          <span style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => onEdit?.(post)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--lv-ter)' }}>edit</button>
            <button onClick={deletePost} disabled={deleting} style={{ background: 'none', border: 'none', padding: 0, cursor: deleting ? 'default' : 'pointer', font: 'inherit', color: 'var(--theme-accent)', opacity: deleting ? 0.5 : 1 }}>{deleting ? 'deleting…' : 'delete'}</button>
          </span>
        )}
        <HeartButton post={post} style={{ color: 'var(--lv-ter)' }} />
        <AddToPlaylistButton post={post} style={{ color: 'var(--lv-ter)' }} />
        <button onClick={() => setCommentsOpen(v => !v)} style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--lv-sec)' }}>
          <span style={{ color: 'var(--theme-accent)', fontWeight: 700 }}>{commentCount}</span> replies
        </button>
        <FollowedTag post={post} />
        <WallLink name={post.user?.username || post.username} style={{ color: 'var(--lv-sec)' }} />
        <AlsoPosted post={post} style={{ color: 'var(--lv-sec)' }} />
        <MainNumber post={post} />
        <span>{timeAgo(post.created_at)}</span>
      </div>
      {commentsOpen && (
        <div style={{ marginTop: 8, flexShrink: 0 }}>
          <CommentThread postId={post.id} onCountChange={setCommentCount} d={d} />
        </div>
      )}
    </div>
  )
}

// Under the track being played when the only thing we have is a 30-second
// preview (Spotify, Deezer, Apple): ask for a YouTube link. The link goes
// through the usual check (TrackLinkAdd / services/trackLinks.js) and, once
// live, replaces the preview on every post of the release — and costs no quota.
const FULL_SOURCES = new Set(['youtube', 'soundcloud', 'bandcamp'])
function PreviewPrompt({ post, track, linkKey, activeUrl, indent = 30 }) {
  const queryClient = useQueryClient()
  const playing = platformOf(activeUrl)
  const have = [platformOf(track.stream_url || track.youtube_url), ...(track.sources || []).map(s => s.platform)].filter(Boolean)
  if (!post.discogs_id || !linkKey || !playing || FULL_SOURCES.has(playing) || have.some(p => FULL_SOURCES.has(p))) return null
  return <AddLinkRow releaseId={post.discogs_id} linkKey={linkKey} title={track.title} artist={artistName(post)} indent={indent}
    prompt="＋ only a 30-second preview here — know the full track? add a YouTube link"
    signInText="only a 30-second preview here — sign in and help us find the full track"
    onDone={() => queryClient.invalidateQueries({ queryKey: ['posts'] })} />
}

// The places a track can be played, as small chips on its row (2026-10-07):
// click one to play it from there — and to make it your default where a track
// has it. Only shown when there's a choice (two or more sources).
// `always` (the shelf stack card, 2026-10-08): show the chip even when there is only one place — so every
// track says where it plays — falling back to the track's own link when no sources were stored.
function SourceChips({ track, activeUrl, pref, onPick, d, always = false }) {
  const own = track.stream_url || track.youtube_url
  let list = track.sources || []
  if (always && list.length === 0 && platformOf(own)) list = [{ platform: platformOf(own), url: own, full: FULL_SOURCES.has(platformOf(own)) }]
  if (list.length < (always ? 1 : 2)) return null
  const current = activeUrl ? platformOf(activeUrl) : (pref && list.some(s => s.platform === pref) ? pref : platformOf(own))
  return (
    <span style={{ display: 'inline-flex', gap: 3 }} onClick={e => e.stopPropagation()}>
      {list.map(s => {
        const on = s.platform === current
        return (
          <button key={s.platform} onClick={() => onPick(s)}
            title={`${SOURCE_NAME[s.platform] || s.platform}${s.full ? '' : ' — 30-second preview unless you are signed in there'}`}
            style={{ fontFamily: d.monoFf, fontSize: 8.5, lineHeight: 1, letterSpacing: '0.04em', padding: '2px 3px', borderRadius: 3, cursor: 'pointer', border: '1px solid var(--lv-line)', background: on ? 'var(--theme-showcase)' : 'transparent', color: on ? '#fff' : 'var(--lv-ter)', opacity: s.full ? 1 : 0.85 }}>{SOURCE_SHORT[s.platform] || s.platform}</button>
        )
      })}
    </span>
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
  const { registerPostRef, openD3 } = useLayout() || {}
  const { canModify, deleting, deletePost } = usePostActions(post)
  const [activeUrl, setActiveUrl] = useState(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(post.commentCount || post.comment_count || 0)
  const cardRef = useRef(null)

  const tracks = post.tracks || []
  // The listener's preferred source wins where a track has it (lib/sources.js).
  const [srcPref, setSrcPref] = useSourcePref()
  const urlOf = t => urlForTrack(t, srcPref)
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
  // The active track's own player (Bandcamp tracks carry one); the post's
  // own Bandcamp link plays its album player.
  // A track's own embed (Bandcamp) only applies to its own link, not to another source's.
  const activeTrack = activeUrl ? tracks.find(t => urlOf(t) === activeUrl) : null
  const ownLink = activeTrack && activeUrl === (activeTrack.stream_url || activeTrack.youtube_url)
  const playingSrc = !activeUrl ? null
    : trackEmbedSrc(ownLink ? activeTrack : { stream_url: activeUrl }, toEmbedSrc)
      || (activeUrl === post.stream_url && /bandcamp\.com\/EmbeddedPlayer/.test(post.embed_url || '') ? post.embed_url : toEmbedSrc(activeUrl))
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
  // artMtTop: the sleeve starts as far down as the single card's art
  // (gabriel, 2026-10-01), so that space comes out of the same budget.
  const stageH = `min(${d.artSize}px, calc(100vh - ${2 * (d.padY + FLOAT_INSET_Y) + d.artMtTop + 352}px))` // 352 (was 330): +21 for the line under the number (2026-10-02)
  // Both rows share one column split — sleeve / title block on the left,
  // description / tracklist on the right — with the divider centred in
  // the gap between them.
  const ALBUM_COL_GAP = 24
  const albumCols = `${d.artSize}px minmax(0, 1fr)`
  const badge = { display: 'inline-block', fontFamily: d.labelFf, fontWeight: d.badgeWeight, fontSize: d.badgeSize, lineHeight: 1, letterSpacing: `${d.badgeLs}em`, textTransform: 'uppercase', padding: `${d.badgePy}px ${d.badgePx}px`, borderRadius: d.badgeRadius, textDecoration: 'none' }
  const half = Math.ceil(tracks.length / 2)
  const indexed = tracks.map((t, i) => ({ t, i }))
  const linkKeyList = linkKeys(tracks)
  const trackCol = list => (
    <div style={{ minWidth: 0 }}>
      {list.map(({ t, i }) => {
        const u = urlOf(t)
        const active = !!activeUrl && u === activeUrl
        return (
          <div key={i}>
          <div onClick={() => { if (u) setActiveUrl(active ? null : u) }}
            style={{ display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr) auto', gap: 8, alignItems: 'baseline', padding: `${d.trackRowpad}px 0`, borderBottom: '1px solid var(--lv-line)', cursor: u ? 'pointer' : 'default', background: active ? 'color-mix(in srgb, var(--theme-accent) 14%, transparent)' : 'transparent' }}>
            <span style={{ fontFamily: d.monoFf, fontSize: d.tracknumSize, color: active ? 'var(--theme-accent)' : 'var(--lv-ter)' }}>{active ? '▶' : (t.position || i + 1)}</span>
            <span style={{ fontFamily: d.bodyFf, fontSize: d.trackSize, lineHeight: 1.3, color: active ? 'var(--lv-pri)' : 'var(--lv-sec)', fontWeight: active ? 600 : 400 }}>{t.title}</span>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline' }}>
              <SourceChips track={t} activeUrl={activeUrl} pref={srcPref} d={d} onPick={s => { setSrcPref(s.platform); setActiveUrl(s.url) }} />
              {u && <AddToPlaylistButton tracks={[trackFrom(post, t)]} label="+" align="right" style={{ fontFamily: d.monoFf, fontSize: d.trackSize, color: 'var(--lv-ter)' }} />}
            </span>
          </div>
          {active && <PreviewPrompt post={post} track={t} linkKey={linkKeyList[i]} activeUrl={activeUrl} indent={34} />}
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
      {/* Divider between the left column (sleeve, title block) and the
          right (description, tracklist), top to bottom edge like the single
          card's rail line (gabriel, 2026-10-01). */}
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: d.bandPadX + d.artSize + ALBUM_COL_GAP / 2, width: 1, background: 'var(--lv-line)' }} />

      {/* top row: sleeve (the player takes its place) | post description,
          the same height as the sleeve and scrolling inside it */}
      <div style={{ display: 'grid', gridTemplateColumns: albumCols, gap: ALBUM_COL_GAP, height: stageH, flexShrink: 0, marginTop: d.artMtTop }}>
        <div style={{ position: 'relative', height: '100%', aspectRatio: '1 / 1', flexShrink: 0, background: playingSrc ? '#000' : undefined, borderRadius: d.artRadius, overflow: 'hidden' /* same corners as post-card art */ }}>
          {playingSrc ? (
            <TrackPlayer key={playingSrc} src={playingSrc} title={post.title} autoplay onEnded={playNext} />
          ) : (
            // <img loading="lazy">, not a CSS background, so the sleeve only
            // downloads once its card nears the screen (feed lazy loading).
            <div onClick={() => firstUrl && setActiveUrl(firstUrl)}
              style={{ position: 'absolute', inset: 0, background: cover ? '#000' : 'var(--theme-dark3)', cursor: firstUrl ? 'pointer' : 'default' }}>
              {cover && <img src={cover} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <PostTitle post={post} labelStyle={{ fontFamily: d.labelFf, fontWeight: 600, fontSize: d.postLabelSize, letterSpacing: `${d.zlabelLs}em`, textTransform: 'uppercase', color: 'var(--lv-ter)', marginBottom: d.postLabelMb, flexShrink: 0 }} />
          {note ? (
            <p ref={descRef} data-inner-scroll={descFit.overflows ? '' : undefined} onScroll={descFit.onScroll}
              style={{ fontSize: d.descSize, lineHeight: d.descLh, fontFamily: d.bodyFf, color: 'var(--lv-sec)', margin: 0, minHeight: 0, flex: '0 1 auto', overflowWrap: 'anywhere', whiteSpace: 'pre-line', overflowY: descFit.overflows ? 'auto' : 'hidden', paddingRight: descFit.overflows ? 6 : 0, ...INNER_SCROLL_STYLE, ...fadeMask(descFit) }}>{note}</p>
          ) : (
            <p style={{ fontSize: d.descSize, fontFamily: d.bodyFf, fontStyle: 'italic', color: 'var(--lv-ter)', margin: 0 }}>No description</p>
          )}
        </div>
      </div>

      {/* bottom row: badges, artist/title, metaline and the big post number
          under them ("lower orientation" numeral) | tracklist. The badges
          get a grid row of their own so the tracklist starts level with the
          artist name, not the badges (gabriel, 2026-10-01). */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: albumCols, gridTemplateRows: 'auto minmax(0, 1fr)', columnGap: ALBUM_COL_GAP, marginTop: 24 }}>
          <div style={{ gridColumn: 1, gridRow: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            <span style={{ ...badge, background: 'var(--theme-showcase)', color: '#fff' }}>{post.post_type || 'album'}</span>
            {playingPlatform && <a href={playingHref || undefined} target="_blank" rel="noopener noreferrer" style={{ ...badge, background: PLATFORM_COLORS[playingPlatform] || '#444', color: playingPlatform === 'beatport' ? '#000' : '#fff' }}>{playingPlatform}</a>}
            <a href={discogsHref} target="_blank" rel="noopener noreferrer" title={discogsExact ? 'Open release on Discogs' : 'Search Discogs'} style={{ ...badge, border: PAIRED_CARDS ? 'none' : '1px solid var(--lv-line)', background: PAIRED_CARDS ? 'color-mix(in srgb, var(--lv-pri) 8%, transparent)' : undefined, color: 'var(--lv-sec)' }}>◈ discogs</a>
            {buyHref && <a href={buyHref} target="_blank" rel="noopener noreferrer" style={{ ...badge, border: PAIRED_CARDS ? 'none' : '1px solid var(--lv-line)', background: PAIRED_CARDS ? 'color-mix(in srgb, var(--lv-pri) 8%, transparent)' : undefined, color: 'var(--lv-sec)' }}>buy ↗</a>}
          </div>
        <div style={{ gridColumn: 1, gridRow: 2, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, fontFamily: d.artistFf, fontWeight: d.artistWeight, fontSize: d.artistSize, lineHeight: d.artistLh, letterSpacing: `${d.artistLs}em`, textTransform: d.artistCase, marginTop: d.artistMt, color: 'var(--lv-pri)', wordBreak: 'break-word' }}>{artist && !isVariousArtist(artist) ? <DrawerLink kind="artists" name={artist} quiet>{artist}</DrawerLink> : (artist || post.title)}</div>
          <div style={{ flexShrink: 0, fontFamily: d.artistFf, fontStyle: 'italic', fontSize: d.titleSize, lineHeight: d.titleLh, letterSpacing: `${d.titleLs}em`, color: 'var(--lv-sec)', wordBreak: 'break-word' }}>{post.title}</div>
          <div style={{ flexShrink: 0, fontFamily: d.monoFf, fontSize: d.metalineSize, lineHeight: d.metalineLh, letterSpacing: `${d.metalineLs}em`, textTransform: 'uppercase', color: 'var(--lv-sec)', marginTop: d.metalineMt }}>
            {/* The label opens the labels drawer, underlined like the single card's. */}
            {label && <DrawerLink kind="labels" name={label}>{label}</DrawerLink>}
            {label && (catNo || post.year) ? ' · ' : ''}
            {[catNo, post.year].filter(Boolean).join(' · ')}
          </div>
          {/* The number sits right under the metaline and its line right
              under the number, as on the single card (gabriel, 2026-10-02). */}
          <div aria-hidden="true" style={{ pointerEvents: 'none' /* its glyphs reach up over the metaline: clicks go to the label link */, flexShrink: 0, margin: d.numeralMargin, marginTop: NUMERAL_GAP, fontFamily: d.numeralFf, fontWeight: d.numeralWeight, fontSize: d.numeralSize, lineHeight: d.numeralLh, letterSpacing: `${d.numeralLs}em`, opacity: d.numeralOpacity, color: 'var(--lv-pri)' }}>
            {String(post.feedNumber ?? post.id).padStart(2, '0')}
          </div>
          {/* Line under the big number — the single card's solid rule under
              its plate, same height, colour and spacing (gabriel, 2026-10-01). */}
          <div style={{ height: 1, background: 'var(--lv-line)', margin: `${d.ruleSolidMy}px 0`, flexShrink: 0 }} />
        </div>

        <div ref={listRef} data-inner-scroll={listFit.overflows ? '' : undefined} onScroll={listFit.onScroll}
          style={{ gridColumn: 2, gridRow: 2, marginTop: d.artistMt /* same as the artist name's */, minHeight: 0, overflowY: listFit.overflows ? 'auto' : 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18, alignContent: 'start', ...INNER_SCROLL_STYLE, ...fadeMask(listFit) }}>
          {trackCol(indexed.slice(0, half))}
          {trackCol(indexed.slice(half))}
        </div>
      </div>

      {/* Genre pills (2026-10-05, gabriel) — as on single cards. */}
      {post.genres?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: d.pillGap, marginTop: 10, flexShrink: 0 }}>
          {post.genres.slice(0, 6).map(g => (
            <button key={g} onClick={() => openD3?.('genres', { filter: g })}
              style={{ fontSize: d.pillSize, background: 'var(--theme-dark3)', color: 'var(--lv-sec)', padding: `${d.pillPy}px ${d.pillPx}px`, borderRadius: d.pillRadius, fontFamily: d.bodyFf, border: 'none', cursor: 'pointer' }}>{g}</button>
          ))}
        </div>
      )}

      {/* byline — the regular card's byline sizes */}
      <div style={{ marginTop: d.bylineMt, display: 'flex', gap: 10, alignItems: 'baseline', flexShrink: 0 }}>
        <button onClick={() => setCommentsOpen(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: d.bodyFf, fontSize: d.metarowSize, color: 'var(--lv-ter)' }}>
          <span style={{ color: 'var(--theme-accent)', fontWeight: 700 }}>{commentCount}</span>&nbsp;replies
        </button>
        <AddToPlaylistButton post={post} style={{ fontFamily: d.bodyFf, fontSize: d.metarowSize, color: 'var(--lv-ter)' }} />
        <HeartButton post={post} style={{ fontFamily: d.bodyFf, fontSize: d.metarowSize, color: 'var(--lv-ter)' }} />
        <FollowedTag post={post} />
        <WallLink name={post.user?.username || post.username} style={{ fontFamily: d.bodyFf, fontSize: d.handleSize, fontWeight: d.handleWeight, color: 'var(--lv-pri)' }} />
        <AlsoPosted post={post} style={{ fontFamily: d.bodyFf, fontSize: d.handleSize, color: 'var(--lv-pri)' }} />
        <MainNumber post={post} style={{ fontFamily: d.monoFf, fontSize: d.stampSize, color: 'var(--lv-ter)' }} />
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

// ── Shelf stack card (2026-10-08, gabriel) ────────────────────────────────────
// One card for albums, singles and compilations (live sets, spotlights and
// introductions are unchanged). Designed in frontend/mockup4.html from record
// shops' release listings (Boomkat, Hard Wax, Bleep, Bandcamp), at the old
// cards' geometry: padY 90 / bandPadX 32, a 390px sleeve with the 40px art
// radius. Top to bottom: sleeve on the left; on the right the pills (type,
// every place it can be heard, Discogs, buy), artist, title, label line,
// genres and — for compilations — the contributing artists; under it the
// whole tracklist (track artists bold + linked, a chip per source), the post
// title and description, then the byline. Replies open as a panel that slides
// out of the card's right edge.
// The old cards are still in the file: `?cards=old` in the address brings
// them back (remembered until `?cards=new`). The commit before this card is
// tagged `pre-shelf-stack`.
const SHELF_CARDS = (() => {
  try {
    const q = new URLSearchParams(window.location.search).get('cards')
    if (q === 'old' || q === 'new') localStorage.setItem('lnv-cards', q)
    return localStorage.getItem('lnv-cards') !== 'old'
  } catch { return true }
})()

// Paired-boxes card (E, 12 Oct 2026) is the default feed card. `?cards=new` goes back to the shelf stack, `?cards=old` to the older cards, `?cards=paired` to this one again (all remembered).
const PAIRED_CARDS = (() => {
  try {
    const q = new URLSearchParams(window.location.search).get('cards')
    if (q === 'paired' || q === 'new' || q === 'old') localStorage.setItem('lnv-cards', q)
    const v = localStorage.getItem('lnv-cards')
    return v !== 'new' && v !== 'old' // the default card since 12 Oct 2026; ?cards=new = shelf stack, ?cards=old = the older cards
  } catch { return true }
})()

// "Artist - Title" as written on compilations (Bandcamp, YouTube): split it.
const splitTrackName = title => {
  const m = String(title || '').match(/^(.{2,70}?)\s[-–—]\s(.+)$/)
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: String(title || '') }
}
// "Walk A Mile In My Shoes (Henrik Schwarz Remix)" -> ['Henrik Schwarz']. Generic mixes ("Original Mix",
// "Long Instrumental Version") name nobody. (Same rule in backend/routes/posts.js /browse.)
const GENERIC_MIX = /^(original|extended|radio|club|album|single|vocal|instrumental|dub|long|short|main|full|clean|dirty|edit|lp|ep|7"|12"|remix|re-?edit|version|vip|acapella|a cappella|live|demo|mono|stereo)\b/i
function remixersOf(title) {
  const out = []
  for (const m of String(title || '').matchAll(/[(\[]([^()\[\]]{2,60}?)\s+(?:remix|rmx|rework|re-?edit|re-?work|mix|edit|dub|version)[)\]]/gi)) {
    let name = m[1].replace(/\s+(?:vocal|dub|instrumental|club|radio|extended)$/i, '').trim()
    name = name.replace(/['’]s$/i, '').trim() // "Babatunji's Dub Mix" -> Babatunji
    // "Timmy's Original Shelter Mix" names a version of the track, not a person
    if (name && !GENERIC_MIX.test(name) && !/\b(original|extended|radio|club|vocal|instrumental|dub|long|short|album|single|clean|dirty|acapella|a cappella|version|mix|remix|edit)\b/i.test(name) && /^[\p{L}\p{N}]/u.test(name)) out.push(name)
  }
  return [...new Set(out)]
}
// Artists shown on a spotlight / preview track row: the credited ones plus whoever the title says remixed it.
const rowArtists = t => {
  const have = (t.artists || []).filter(a => a?.name)
  const extra = remixersOf(t.title).filter(n => !have.some(a => a.name.toLowerCase() === n.toLowerCase())).map(name => ({ name }))
  return [...have, ...extra]
}
// A track for display: its own artist (post_tracks.artist) or the one its name carries, and the clean title.
function shelfTrack(t, comp) {
  let artist = (t.artist || '').trim(), title = t.title || ''
  if (artist && title.toLowerCase().startsWith(artist.toLowerCase() + ' - ')) title = title.slice(artist.length + 3).trim()
  else if (!artist && comp) { const sp = splitTrackName(title); artist = sp.artist; title = sp.title }
  // "Coldcut feat. Robert Owens" is two artists, each with their own page.
  const artists = artist ? artist.split(/\s*,\s+|\s+(?:feat\.?|ft\.?|featuring|vs\.?|b2b)\s+/i).map(s => s.trim()).filter(Boolean) : []
  // The remixer is on the track too: "(Henrik Schwarz Remix)" puts Henrik Schwarz in the artists row.
  const remixers = remixersOf(title).filter(n => !artists.some(a => a.toLowerCase() === n.toLowerCase()))
  return { artists, remixers, title }
}
function isCompilation(post, tracks) {
  if (isVariousArtist(artistName(post))) return true
  if (tracks.length < 5) return false
  const named = tracks.filter(t => (t.artist || '').trim() || splitTrackName(t.title).artist).length
  return named / tracks.length >= 0.6
}
// Every place this release can be heard: the posted link's platform plus whatever each track has found.
// A source pill in muted tones: the platform colour only as a tint (no border), the text in the card's ink.
const mutedPill = (p, tint) => ({ background: `color-mix(in srgb, ${shelfColor(p)} ${tint}%, transparent)`, border: 'none', color: 'var(--lv-pri)' })
const shelfColor = p => PLATFORM_COLORS[p === 'apple' ? 'applemusic' : p] || '#444'
function shelfLocations(post, tracks) {
  const m = new Map()
  tracks.forEach(t => {
    const set = new Set((t.sources || []).map(s => s.platform))
    const own = platformOf(t.stream_url || t.youtube_url); if (own) set.add(own)
    set.forEach(p => m.set(p, (m.get(p) || 0) + 1))
  })
  const posted = platformOf(post.stream_url)
  if (posted && !m.has(posted)) m.set(posted, 0)
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ p, n }))
}

// A compilation's card is this much wider than the others (2026-10-08, gabriel): every track line
// carries an artist, so two columns of 800px-card width got messy once the list was busy.
const SHELF_COMP_EXTRA = 280
// Space between the big post number and the line under it (it travels with the number).
const NUM_LINE_GAP = 14
// The shelf card's top and bottom padding (equal): enough at the top to clear the floating "my feed" + search bar, the same at the bottom for continuity (gabriel, 2026-10-10). The sleeve keeps its full size (390); the replies strip gives way first when the screen is short.
const SHELF_PAD_Y = 64
// The paired card's top and bottom padding (equal, gabriel 12 Oct): enough at the bottom for the footer pill to sit above the compose + button (48px, 16px up), the same at the top.
const PAIRED_PAD_Y = 84

// A person chip: their initial and name; opens their feed.
function UserChip({ name, d }) {
  return (
    <button onClick={e => { e.stopPropagation(); openWall(name) }} title={`Open ${name}’s feed`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, border: '1px solid var(--lv-line)', background: 'none', borderRadius: 99, padding: '2px 10px 2px 3px', cursor: 'pointer', fontFamily: d.bodyFf, fontWeight: 600, fontSize: 12, color: 'var(--lv-pri)', whiteSpace: 'nowrap' }}>
      <i style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--lv-sec)', color: 'var(--theme-bg)', font: '700 9px/18px sans-serif', fontStyle: 'normal', textAlign: 'center' }}>{name[0]?.toUpperCase()}</i>{name}
    </button>
  )
}

// "Playlists this has appeared on": public lists only, opened next to the click (Esc or a click elsewhere closes it).
function PlaylistsPop({ lists, at, cardBg, d, onClose }) {
  useEffect(() => {
    const off = e => { if (!e.target.closest?.('[data-pl-pop]')) onClose() }
    const esc = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [onClose])
  return (
    <div data-pl-pop="" style={{ position: 'absolute', zIndex: 30, left: at.x, bottom: at.bottom, width: 300, background: cardBg, border: '1px solid var(--lv-line)', borderRadius: 16, boxShadow: '0 18px 44px rgba(0,0,0,0.35)', padding: '14px 16px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: d.bodyFf, fontWeight: 600, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--lv-ter)', marginBottom: 6 }}><span>Playlists this has appeared on</span><span style={{ fontFamily: d.monoFf, fontWeight: 400, letterSpacing: '0.06em' }}>{lists.length}</span></div>
      {lists.map(pl => (
        <button key={pl.id} onClick={() => { openPlaylistFeed({ token: pl.token, id: pl.id, name: pl.name }); onClose() }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% + 16px)', margin: '0 -8px', padding: '8px', background: 'none', border: 'none', borderRadius: 10, cursor: 'pointer', textAlign: 'left', color: 'var(--lv-pri)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--theme-accent) 14%, transparent)' }} onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <b style={{ display: 'block', fontFamily: d.bodyFf, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</b>
            <small style={{ fontFamily: d.monoFf, fontSize: 11, color: 'var(--lv-ter)' }}>by {pl.owner} · {pl.track_count} track{pl.track_count === 1 ? '' : 's'}</small>
          </span>
          <span style={{ fontFamily: d.monoFf, fontSize: 11, color: 'var(--theme-accent)' }}>open →</span>
        </button>
      ))}
      <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--lv-line)', fontFamily: d.monoFf, fontSize: 11, color: 'var(--lv-ter)' }}>Public lists only.</div>
    </div>
  )
}

// The newest replies under the post, and a one-line reply box (the full list is the side panel).
function CardReplies({ post, count, onCount, onOpen, d, fill = true, size = d.titleSize, posterName = null }) {
  const [latest, setLatest] = useState(post.latestComments || [])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [priv, setPriv] = useState(false)
  const [sentNote, setSentNote] = useState('')
  const [ask, setAsk] = useState(null) // the delete pop-up: where it opens and which comment
  const me = getUserId()
  const meName = getUser()
  const regionRef = useRef(null)
  const listRef = useRef(null)
  useLayoutEffect(() => {
    const list = listRef.current, region = regionRef.current
    if (!list || !region) return undefined
    // Show as many replies as fit. If some don't, the reply text steps down in size (never below REPLY_MIN) until
    // one more reply fits cleanly; "The post" and everything else keep their size, so the post stays the emphasis.
    const REPLY_MIN = 12
    const fit = () => {
      const rows = [...list.children]
      const apply = sz => rows.forEach(r => { r.style.display = 'grid'; r.style.fontSize = `${sz}px` }) // the rows are grids (see `line`)
      const count = () => { const limit = list.getBoundingClientRect().bottom + 1; let n = 0; for (const r of rows) { if (r.getBoundingClientRect().bottom <= limit) n++; else break } return n }
      apply(size)
      const base = count()
      let use = size, shown = base
      if (base < rows.length) {
        for (let sz = size - 1; sz >= REPLY_MIN; sz--) {
          apply(sz)
          const n = count()
          if (n > base) { use = sz; shown = n; break }
        }
      }
      apply(use)
      rows.forEach((r, i) => { r.style.display = i < shown ? 'grid' : 'none' })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(region)
    return () => ro.disconnect()
  }, [latest.length, size, fill])
  async function remove(c) {
    try {
      const res = await fetch(`${API}/posts/${post.id}/comments/${c.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error(String(res.status))
      setLatest(prev => prev.filter(x => x.id !== c.id)); onCount(Math.max(0, count - 1))
    } catch { window.alert('Could not delete that comment — try again.') }
  }
  const canDelete = c => !!meName && (c.username === meName || posterName === meName || isAdmin())
  async function submit() {
    const content = text.trim()
    if (!content || busy || !me) return
    setBusy(true)
    try {
      const res = await fetch(`${API}/posts/${post.id}/comments`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ content: content.slice(0, 300), private: priv }) })
      if (!res.ok) throw new Error(String(res.status))
      const saved = await res.json()
      setText('')
      if (saved.private) { setSentNote(`Sent privately to ${posterName}`); setPriv(false); setTimeout(() => setSentNote(''), 5000) }
      else { setLatest(prev => [...prev, saved].slice(-6)); onCount(count + 1) }
    } catch { /* leave the text so it can be sent again */ } finally { setBusy(false) }
  }
  const line = { display: 'grid', gridTemplateColumns: '1.6em minmax(0, 1fr) auto', gap: '0.55em', alignItems: 'center', padding: '0.35em 0', borderTop: '1px solid var(--lv-line)', fontFamily: d.artistFf, fontWeight: 400, fontSize: size, lineHeight: 1.2, color: 'var(--lv-sec)' }
  // Under the post: the newest reply first, the older ones below it, and the reply box under the lot. It flows down from the post and grows with each reply; once the room is used up the box sits at the foot and the oldest replies drop off (the drawer has the full list).
  return (
    <div ref={regionRef} style={{ flex: fill ? '1 1 0' : '0 0 auto', minHeight: 0, maxHeight: fill ? undefined : 190, display: 'flex', flexDirection: 'column', marginTop: 16, paddingBottom: 14 }}>
      <div ref={listRef} style={{ flex: '0 1 auto', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {[...latest].reverse().map(c => (
          <div key={c.id} style={line}>
            <span style={{ width: '1.6em', height: '1.6em', borderRadius: '0.5em', border: '1px solid var(--lv-line)', display: 'grid', placeItems: 'center', font: '700 0.65em sans-serif', color: 'var(--lv-pri)', flexShrink: 0 }}>{c.username?.[0]?.toUpperCase()}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}><span style={{ color: 'var(--lv-pri)', marginRight: 10 }}>{c.username}</span>{c.content}</span>
            <span style={{ fontFamily: d.monoFf, fontSize: '0.55em', color: 'var(--lv-ter)', whiteSpace: 'nowrap', textAlign: 'right' }}>
              {stampShort(c.created_at)}
              {canDelete(c) && <><br /><button onClick={e => setAsk({ x: e.clientX, y: e.clientY, c })} title="Delete this comment" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--lv-ter)' }}>delete</button></>}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, paddingTop: 10, borderTop: latest.length ? '1px solid var(--lv-line)' : 'none', flexShrink: 0 }}>
        {me ? <>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} maxLength={300} placeholder={sentNote || (priv ? `Private to ${posterName}…` : 'Reply…')}
            style={{ flex: 1, minWidth: 0, background: 'color-mix(in srgb, var(--lv-pri) 7%, transparent)', border: '1px solid var(--lv-line)', borderRadius: 99, padding: '7px 16px', fontFamily: d.bodyFf, fontSize: size, color: 'var(--lv-pri)', outline: 'none' }} />
          {posterName && meName && posterName !== meName && (
            <button onClick={() => setPriv(v => !v)} aria-pressed={priv} title={priv ? `Private: only you and ${posterName} will see it. Click for a public reply.` : `Make this reply private to ${posterName}`}
              style={{ borderRadius: 99, border: `1px solid ${priv ? 'var(--theme-accent)' : 'var(--lv-line)'}`, background: priv ? 'color-mix(in srgb, var(--theme-accent) 18%, transparent)' : 'none', padding: '0 14px', cursor: 'pointer', fontSize: Math.max(14, Math.round(size * 0.7)), flexShrink: 0 }}>🔒</button>
          )}
          <button onClick={submit} disabled={!text.trim() || busy} style={{ border: 'none', borderRadius: 99, background: 'var(--lv-pri)', color: 'var(--theme-bg)', padding: '0 24px', display: 'flex', alignItems: 'center', fontFamily: d.bodyFf, fontWeight: 700, fontSize: Math.max(12, Math.round(size * 0.6)), letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', opacity: !text.trim() || busy ? 0.5 : 1 }}>{busy ? '···' : 'Reply'}</button>
        </> : <a href="/login" style={{ flex: 1, alignSelf: 'center', fontFamily: d.monoFf, fontSize: 11, color: 'var(--theme-accent)', textDecoration: 'none' }}>log in to reply →</a>}
        {count > 0 && <button onClick={onOpen} style={{ alignSelf: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: d.bodyFf, fontWeight: 600, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--theme-accent)' }}>View all {count} →</button>}
      </div>
      {ask && <ConfirmPop at={ask} message="Delete this comment?" detail={ask.c.content} onCancel={() => setAsk(null)} onConfirm={() => { const c = ask.c; setAsk(null); remove(c) }} />}
    </div>
  )
}

// One of the paired boxes: the open one is a tinted box that hugs its content (and scrolls if the column is short); the other is an outlined pill. Hover (or tap) the pill and it swaps with the open one.
// How a box opens: slow and weighted (gabriel, 12 Oct) — a short pause after the cursor arrives, then the two boxes of
// a pair trade places over PAIR_MS with a heavy ease (slow off the mark, settles gently). Bodies stay mounted so they can
// animate; a closed one has zero height.
const PAIR_MS = 750
const PAIR_EASE = 'cubic-bezier(0.65, 0, 0.25, 1)'
const PAIR_HOVER_DELAY = 160
const CARD_LINE = 'color-mix(in srgb, var(--lv-pri) 16%, transparent)' // the boxes' outlines: barely there
function PairBox({ name, sub, open, onOpen, children, d, bodyRef }) {
  const timer = useRef(null)
  const arm = () => { if (!open && !timer.current) timer.current = setTimeout(() => { timer.current = null; onOpen() }, PAIR_HOVER_DELAY) }
  const disarm = () => { clearTimeout(timer.current); timer.current = null }
  useEffect(() => disarm, [])
  const ease = `${PAIR_MS}ms ${PAIR_EASE}`
  return (
    <div onMouseEnter={arm} onMouseLeave={disarm} onClick={() => { disarm(); if (!open) onOpen() }}
      style={{ border: `1px solid ${CARD_LINE}`, borderRadius: 24, flex: open ? '0 1 auto' : '0 0 auto', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: open ? 'color-mix(in srgb, var(--lv-pri) 9%, transparent)' : 'transparent', cursor: open ? 'default' : 'pointer', transition: `background ${ease}` }}>
      <div style={{ display: 'flex', gap: 10, padding: '0 18px', height: open ? 38 : 44, flexShrink: 0, alignItems: 'center', fontFamily: d.bodyFf, color: 'var(--lv-pri)', transition: `height ${ease}` }}>
        <b style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em' }}>{name}</b>
        <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--lv-sec)' }}>{sub}</span>
      </div>
      <div aria-hidden={!open} style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', flex: open ? '0 1 auto' : '0 0 auto', minHeight: 0, opacity: open ? 1 : 0, transitionProperty: 'grid-template-rows, opacity', transitionDuration: `${PAIR_MS}ms, ${PAIR_MS * 0.6}ms`, transitionTimingFunction: PAIR_EASE }}>
        <div ref={bodyRef} data-inner-scroll={open ? '' : undefined} style={{ minHeight: 0, overflowY: open ? 'auto' : 'hidden', overflowX: 'hidden', padding: '0 18px', ...INNER_SCROLL_STYLE }}>
          <div style={{ paddingBottom: 12 }}>{children}</div>
        </div>
      </div>
    </div>
  )
}

// ── Notes card (default; ?cards=notes, 12 Oct 2026, gabriel) ──────────────────────────────────────────────────
// The default card since 12 Oct 2026 (`?cards=paired` goes back to the paired boxes). Built from the "Post card directions" canvas (FullPost board). The same header box as the paired card, then
// two columns: the cover, Plays from and Details on the left; Tracks (highlights on top, the full list under the
// big side letters) and the post on the right. Replies open in a small square pop-out over the card.
// Type everywhere matches the drawers: spaced capitals for labels, Barlow 700 17px for names, Plex Mono for numbers.
const NOTES_CARDS = (() => {
  try {
    const q = new URLSearchParams(window.location.search).get('cards')
    if (q === 'notes' || q === 'paired' || q === 'new' || q === 'old') localStorage.setItem('lnv-cards', q)
    const v = localStorage.getItem('lnv-cards')
    return v !== 'paired' && v !== 'new' && v !== 'old' // the default card since 12 Oct 2026; ?cards=paired = the paired boxes, ?cards=new / ?cards=old = the older cards
  } catch { return true }
})()
const NOTE_TINT = 'color-mix(in srgb, var(--lv-pri) 5%, transparent)'
const NOTE_HAIR = 'color-mix(in srgb, var(--lv-pri) 10%, transparent)'
const NOTE_HAIR2 = 'color-mix(in srgb, var(--lv-pri) 26%, transparent)'
const NOTE_BOX = { borderRadius: 30, background: NOTE_TINT, border: `1px solid ${NOTE_HAIR}` }
const NOTES_GAP = 8 // the one gap between every box on the notes card, across and down
const NOTES_PAD_TOP = 56 // below the search bar (its box ends at 48px) ...
const NOTES_PAD_BOTTOM = 72 // ... and above the New post button (it starts 64px up from the bottom)
const NOTE_FOLD_MS = 380
const NOTE_FOLD_EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)'
const noteLabel = (d, size = 10) => ({ fontFamily: d.bodyFf, fontWeight: 600, fontSize: size, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--lv-sec)' })
const noteName = d => ({ fontFamily: d.bodyFf, fontSize: 14, lineHeight: 1.2, fontWeight: 700 })
const noteMeta = (d, size = 11) => ({ fontFamily: d.monoFf, fontSize: size, fontVariantNumeric: 'tabular-nums', color: 'var(--lv-ter)' })
// The pills of the nav strip (Strip.jsx tabs, BrowseGrid's drawer pills), lying down.
const notePill = d => ({ fontFamily: d.bodyFf, fontWeight: 600, fontSize: 11.5, letterSpacing: '0.06em', lineHeight: 1, textTransform: 'lowercase', whiteSpace: 'nowrap', textDecoration: 'none', padding: '9px 15px', borderRadius: 999, border: '1px solid var(--theme-border)', color: 'var(--lv-ter)', background: 'transparent', cursor: 'pointer' })
const NOTE_CSS = '.lnv-np{transition:background .15s,border-color .15s,color .15s}.lnv-np:hover{background:var(--theme-dark3)!important;color:var(--lv-pri)!important}'
  + '.lnv-sp{transition:filter .15s}.lnv-sp:hover{filter:brightness(1.15)}'
  + '.lnv-nr:hover{background:color-mix(in srgb,var(--lv-pri) 7%,transparent)}'
  + '.lnv-nr .lnv-off{opacity:.35;transition:opacity .15s}.lnv-nr:hover .lnv-off{opacity:1}'
  + '@media (prefers-reduced-motion: reduce){.lnv-fold{transition:none!important}}'
// The short dash before every name.
function NoteDash() {
  return <span aria-hidden="true" style={{ display: 'inline-block', width: 4.5, height: 2, borderRadius: 1, background: 'var(--lv-ter)', transform: 'translateY(-5px)' }} />
}
// Sides from the positions as Discogs gives them: "A1", "B2", "C" -> A, B, C; "AA" (double A-side) -> AA; "1-1", "CD2-3", "2.4" -> disc 1, 2.
// Anything else ("1", "2", no position) is one group with no letter.
function noteSides(tracks) {
  const key = t => {
    const p = String(t.position || '').trim()
    let m = p.match(/^([A-Za-z]{1,2})\d*[a-z]?$/)
    if (m) return m[1].toUpperCase()
    m = p.match(/^[A-Za-z]*(\d+)[-.]\d+$/)
    return m ? m[1] : ''
  }
  const groups = []
  tracks.forEach((t, i) => {
    const k = key(t)
    const last = groups[groups.length - 1]
    if (last && last.key === k) last.items.push({ t, i })
    else groups.push({ key: k, items: [{ t, i }] })
  })
  return groups.length > 1 || (groups[0] && groups[0].key) ? groups : [{ key: '', items: tracks.map((t, i) => ({ t, i })) }]
}
// "50:06" from the tracks' durations (m:ss or h:mm:ss); '' if any is missing.
function noteRuntime(tracks) {
  let s = 0
  for (const t of tracks) {
    const parts = String(t.duration || '').split(':').map(Number)
    if (!t.duration || parts.some(isNaN)) return ''
    s += parts.reduce((a, v) => a * 60 + v, 0)
  }
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
// One fold: open = its content's height, closed = nothing; both ways animate.
function NoteFold({ open, children, shift = -14 }) {
  return (
    <div className="lnv-fold" aria-hidden={!open} style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0, transition: `grid-template-rows ${NOTE_FOLD_MS}ms ${NOTE_FOLD_EASE}, opacity ${NOTE_FOLD_MS * 0.8}ms ease` }}>
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
        <div className="lnv-fold" style={{ transform: `translateY(${open ? 0 : shift}px)`, transition: `transform ${NOTE_FOLD_MS}ms ${NOTE_FOLD_EASE}` }}>{children}</div>
      </div>
    </div>
  )
}
// Which post's replies pop-out is open (one at a time). It follows you along the feed: ShelfCard closes it after three posts.
let chatPostId = null
const chatSubs = new Set()
let chatAt = null // where the reply button was clicked: the pop-out opens there
const setChatPost = (id, at) => { if (at) chatAt = at; if (chatPostId !== id) { chatPostId = id; chatSubs.forEach(f => f()) } }
const useChatPost = () => useSyncExternalStore(f => { chatSubs.add(f); return () => { chatSubs.delete(f) } }, () => chatPostId)
const CHAT_POSTS_KEPT = 3 // how many posts the pop-out stays with you for
// The replies pop-out: a quiet square (three quarters of the cover), the replies, and a reply bar. Drag it by its top.
// Where the replies pop-out opens (2026-10-13): over the click that opened it, centred on the cursor and just above it (the reply
// button sits low on the card), kept inside the window. No click point (e.g. opened by keyboard): the old bottom-right corner.
function replyBoxSpot(at, size) {
  if (!at) return { right: 32, bottom: 96 }
  const m = 8, w = window.innerWidth, h = window.innerHeight
  const left = Math.min(Math.max(at.x - size / 2, m), Math.max(m, w - size - m))
  let top = at.y - size - 12
  if (top < m) top = Math.min(at.y + 12, Math.max(m, h - size - m))
  return { left, top: Math.max(m, top) }
}

function NoteReplies({ post, posterName, size, d, cardBg, onClose, onCount, fun = false, sheet = false }) {
  const [comments, setComments] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [priv, setPriv] = useState(false)
  const [ask, setAsk] = useState(null)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const drag = useRef(null)
  const listRef = useRef(null)
  const me = getUserId(), meName = getUser()
  useEffect(() => {
    let dead = false
    fetch(`${API}/posts/${post.id}/comments`).then(r => r.ok ? r.json() : []).then(x => { if (!dead) setComments(Array.isArray(x) ? x : []) }).catch(() => { if (!dead) setComments([]) })
    return () => { dead = true }
  }, [post.id])
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight }, [comments])
  useEffect(() => {
    const move = e => { if (drag.current) setOff({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }) }
    const up = () => { drag.current = null }
    const esc = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('keydown', esc) }
  }, [onClose])
  const shown = (comments || [])
  const funCard = () => ({ background: 'color-mix(in srgb, currentColor 10%, transparent)', borderRadius: 20, padding: '10px 14px', flexShrink: 0 })
  const funRoot = { background: 'var(--theme-sidebar)', ...(inkOnHex(themeHex('--theme-sidebar')) === '#fff' ? INK_DARK_BG : INK_LIGHT_BG), color: 'var(--lv-pri)', border: 'none', borderRadius: 30, clipPath: 'polygon(38px 0, 100% 0, 100% 100%, 0 100%, 0 38px)', boxShadow: '0 20px 50px rgba(0,0,0,0.35)', animation: 'lnvPop .5s cubic-bezier(.2,1.2,.3,1)' }
  const canDelete = c => !!meName && (c.username === meName || posterName === meName || isAdmin())
  async function submit() {
    const content = text.trim()
    if (!content || busy || !me) return
    setBusy(true)
    try {
      const res = await fetch(`${API}/posts/${post.id}/comments`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ content: content.slice(0, 300), private: priv }) })
      if (!res.ok) throw new Error(String(res.status))
      const saved = await res.json()
      setComments(prev => [...(prev || []), saved]); setText(''); setPriv(false)
      if (!saved.private) onCount(shown.filter(c => !c.private).length + 1)
    } catch { window.alert('Could not post that reply — try again.') } finally { setBusy(false) }
  }
  async function remove(c) {
    try {
      const res = await fetch(`${API}/posts/${post.id}/comments/${c.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error(String(res.status))
      const rest = shown.filter(x => x.id !== c.id)
      setComments(rest)
      if (!c.private) onCount(rest.filter(x => !x.private).length)
    } catch { window.alert('Could not delete that reply — try again.') }
  }
  return (
    <div role="dialog" aria-label={`Replies to ${posterName || 'this post'}`} onClick={e => e.stopPropagation()}
      style={{ position: 'fixed', ...replyBoxSpot(chatAt, size), zIndex: 60, width: size, height: size, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', padding: '14px 14px 12px', borderRadius: Math.round(size * d.artRadius / d.artSize), background: cardBg, border: `1px solid ${NOTE_HAIR2}`, boxShadow: '0 12px 32px rgba(0,0,0,0.35)', transform: `translate(${off.x}px, ${off.y}px)`, color: 'var(--lv-pri)', ...(fun ? funRoot : null), ...(sheet ? { left: 0, right: 0, bottom: 0, top: 'auto', width: 'auto', height: '72vh', borderRadius: '30px 30px 0 0', transform: 'none' } : null) }}>
      {fun && <style>{BLOCK_CSS}</style>}
      <div onMouseDown={e => { drag.current = { x: e.clientX - off.x, y: e.clientY - off.y } }} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 8px 8px', cursor: 'grab', userSelect: 'none' }}>
        <span style={noteLabel(d, 11)}>Replies</span><span style={noteLabel(d, 11)}>{shown.filter(c => !c.private).length}</span>
        <button onClick={onClose} aria-label="Close replies" style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'none', color: 'var(--lv-sec)', fontSize: 16, cursor: 'pointer' }}>×</button>
      </div>
      <div ref={listRef} data-inner-scroll="" style={{ flex: 1, minHeight: 0, overflowY: fun ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', justifyContent: fun ? 'flex-end' : undefined, gap: fun ? 8 : 12, padding: '2px 8px', ...(fun ? null : INNER_SCROLL_STYLE) }}>
        {comments && !shown.length && <div style={{ margin: 'auto 0', textAlign: 'center', fontFamily: d.bodyFf, fontSize: 14, color: 'var(--lv-sec)' }}>No replies yet.</div>}
        {shown.map(c => (
          <div key={c.id} className={fun ? 'lnv-rc' : undefined} style={fun ? funCard() : undefined}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b style={{ fontFamily: d.bodyFf, fontSize: 15, fontWeight: 700 }}><CommentAuthor name={c.username} /></b>
              <span style={noteMeta(d, 12.5)}>{stampShort(c.created_at)}</span>
              {c.private && <span style={{ ...noteMeta(d, 12.5), color: 'var(--theme-accent)' }}>private</span>}
              {canDelete(c) && <button onClick={e => setAsk({ x: e.clientX, y: e.clientY, c })} style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', ...noteMeta(d, 12.5) }}>delete</button>}
            </div>
            <div style={{ marginTop: 2, fontFamily: d.bodyFf, fontSize: 15, lineHeight: 1.35, color: 'var(--lv-sec)', overflowWrap: 'anywhere' }}>{c.content}</div>
          </div>
        ))}
      </div>
      {me ? (
        <div style={{ flexShrink: 0, marginTop: 8, height: 44, display: 'flex', alignItems: 'center', gap: 4, padding: '0 5px 0 16px', borderRadius: 99, background: NOTE_TINT, border: `1px solid ${NOTE_HAIR}` }}>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} maxLength={300} aria-label="Reply"
            placeholder={priv ? `Private to ${posterName}…` : 'Reply…'}
            style={{ flex: 1, minWidth: 0, height: '100%', border: 'none', background: 'transparent', color: 'var(--lv-pri)', fontFamily: d.bodyFf, fontSize: 15, outline: 'none' }} />
          {posterName && meName && posterName !== meName && (
            <button onClick={() => setPriv(v => !v)} aria-pressed={priv} title={priv ? `Private: only you and ${posterName} will see it` : `Make this reply private to ${posterName}`}
              style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', border: 'none', background: priv ? 'color-mix(in srgb, var(--theme-accent) 22%, transparent)' : 'none', cursor: 'pointer', fontSize: 13 }}>🔒</button>
          )}
          <button onClick={submit} disabled={!text.trim() || busy} aria-label="Send reply"
            style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--lv-pri)', color: cardBg, fontSize: 14, cursor: 'pointer', opacity: !text.trim() || busy ? 0.5 : 1 }}>↑</button>
        </div>
      ) : <a href="/login" style={{ flexShrink: 0, marginTop: 8, ...noteLabel(d, 11), color: 'var(--theme-accent)', textDecoration: 'none', padding: '0 8px' }}>Log in to reply →</a>}
      {ask && <ConfirmPop at={ask} message="Delete this reply?" detail={ask.c.content} onCancel={() => setAsk(null)} onConfirm={() => { const c = ask.c; setAsk(null); remove(c) }} />}
    </div>
  )
}

// ── Blocks card (?cards=blocks, 13 Oct 2026, gabriel) ─────────────────────────────────────────────────────────
// Concept G of mockup26: no card behind the post, just blocks on the feed surface, each filled from the time-of-day palette.
// Rounded blocks with one chamfered corner, a dock of round pills that overlaps the post block, a replies pop-out that springs
// from the click, and the playlist wheel (add this release to one of your playlists). ?cards=notes goes back to the notes card.
const BLOCKS_CARDS = (() => {
  try {
    const q = new URLSearchParams(window.location.search).get('cards')
    if (q === 'blocks' || q === 'module') localStorage.setItem('lnv-cards', q)
    const v = localStorage.getItem('lnv-cards')
    return v === 'blocks' || v === 'module' || v === null // the default while it is being tried; ?cards=notes / paired / new / old go back (remembered)
  } catch { return true }
})()
// Colourways (gabriel, 13 Oct): the blocks do not keep one set of colours; each post takes the next "format" as you scroll, so the feed stays fresh.
// Every entry is a CSS background for one block (a palette token, a mix of two, a gradient); [bg, base] where `base` is the plain colour the ink is judged against.
const TK = k => `var(--theme-${k})`
const MX = (a, pa, b) => `color-mix(in srgb, ${TK(a)} ${pa}%, ${TK(b)})`
const RAMP = t => `color-mix(in srgb, ${TK('dark1')} ${Math.round((1 - Math.min(1, Math.max(0, t))) * 100)}%, ${TK('light2')})`
const GRAD = (a, b, deg = 135) => [`linear-gradient(${deg}deg, ${a}, ${b})`, a]
const tri = t => { const x = ((t % 1) + 1) % 1; return x < 0.5 ? x * 2 : (1 - x) * 2 }
const BLOCK_WAYS = [
  { name: 'settled', f: () => ({ hero: TK('light2'), tracks: TK('showcase'), plays: TK('accent'), details: TK('light1'), post: TK('dark3'), dock: TK('dark1') }) },
  { name: 'inverse', f: () => ({ hero: TK('showcase'), tracks: TK('light2'), plays: TK('dark3'), details: TK('accent'), post: TK('light1'), dock: TK('accent') }) },
  { name: 'gradient', f: () => ({ hero: GRAD(TK('light2'), TK('light1')), tracks: GRAD(TK('showcase'), TK('dark1'), 160), plays: GRAD(TK('accent'), TK('showcase')), details: GRAD(TK('light1'), TK('light2'), 200), post: GRAD(TK('dark3'), TK('light1'), 120), dock: TK('dark1') }) },
  { name: 'ramp', f: i => { const t = tri(i / 8) * 0.3; return { hero: RAMP(0.92 - t), tracks: RAMP(0.1 + t), plays: TK('accent'), details: RAMP(0.7 - t / 2), post: RAMP(0.42), dock: TK('dark1') } } },
  { name: 'split', f: () => ({ hero: TK('accent'), tracks: TK('dark1'), plays: TK('showcase'), details: TK('light2'), post: MX('accent', 40, 'light1'), dock: TK('light2') }) },
  { name: 'tint', f: () => ({ hero: MX('accent', 10, 'light2'), tracks: MX('accent', 85, 'dark1'), plays: TK('accent'), details: MX('accent', 22, 'light2'), post: MX('accent', 45, 'light1'), dock: MX('accent', 60, 'dark1') }) },
  { name: 'duo', f: () => ({ hero: TK('light1'), tracks: TK('accent'), plays: TK('light2'), details: TK('showcase'), post: TK('dark1'), dock: TK('showcase') }) },
]
// gabriel's hand-coloured spectrum (services/blockSpectrum.js, made in palette-tool.html): 8 looks per palette, taken in order as the feed
// scrolls; when a palette has one it replaces the colourways above. A spectrum saved by the palette tool in this browser ("Apply to my feed",
// localStorage 'lnv-post-spectrum') is laid over the shipped one, palette by palette, so new looks can be tried without a rebuild.
// Shape: { mode: 'wrap' | 'pingpong', pals: { Evening: [{ hero, tracks, plays, details, post } x8] } }
let handRaw = null, handVal = BLOCK_SPECTRUM
const handSpectrum = () => {
  try {
    const raw = localStorage.getItem('lnv-post-spectrum')
    if (raw !== handRaw) {
      handRaw = raw
      const local = raw ? JSON.parse(raw) : null
      handVal = local?.pals ? { mode: local.mode || BLOCK_SPECTRUM.mode, order: local.order || BLOCK_SPECTRUM.order, pals: { ...BLOCK_SPECTRUM.pals, ...local.pals } } : BLOCK_SPECTRUM
    }
  } catch { handVal = BLOCK_SPECTRUM }
  return handVal
}
// How the 8 looks are arranged along the feed (gabriel, 13 Oct): by tone, light to dark, following the colour of the profile card (the
// showcase-coloured card the feed opens with). Each look gets a tone (the area-weighted lightness of its five blocks); the looks are sorted
// by it and the feed starts at the end nearest the profile card (a dark card -> darkest look first, getting lighter; a light card -> lightest
// first, getting darker) and walks there and back (ping-pong) so there is never a jump. `order: 'hand'` keeps them exactly as set in the tool.
const hexLum = h => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim())
  if (!m) return 0
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const n = parseInt(m[1], 16)
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
}
const LOOK_WEIGHT = { hero: 0.3, tracks: 0.25, plays: 0.15, details: 0.15, post: 0.15 }
let toneKey = '', toneOrder = null
function toneSorted(looks) {
  const tokens = ['bg', 'sidebar', 'dark1', 'dark2', 'dark3', 'light1', 'light2', 'showcase', 'accent'].map(k => themeHex(`--theme-${k}`))
  const key = getActivePaletteName() + '|' + tokens.join(',') + '|' + JSON.stringify(looks)
  if (key === toneKey && toneOrder) return toneOrder
  const hex = v => (/^#/.test(v) ? v : themeHex(`--theme-${v}`))
  const tone = l => Object.entries(LOOK_WEIGHT).reduce((s, [k, w]) => s + w * hexLum(hex(l[k])), 0)
  const sorted = [...looks].sort((a, b) => tone(a) - tone(b)) // darkest first
  if (hexLum(themeHex('--theme-showcase')) >= 0.35) sorted.reverse() // a light profile card: start light and go dark
  toneKey = key; toneOrder = sorted
  return sorted
}
const handLook = idx => {
  const sp = handSpectrum(), raw = sp?.pals?.[getActivePaletteName()]
  if (!raw?.length) return null
  const byTone = (sp.order || 'tone') === 'tone'
  const looks = byTone ? toneSorted(raw) : raw
  const n = looks.length, i = Math.max(0, idx || 0)
  const k = (byTone || sp.mode === 'pingpong') && n > 1 ? (() => { const m = i % (2 * (n - 1)); return m < n ? m : 2 * (n - 1) - m })() : i % n
  const l = looks[k] || looks[0]
  // a look names palette colours ('accent', 'light2'...) so it follows the palette; plain hex still works
  const col = v => (/^#/.test(v) ? v : `var(--theme-${v})`)
  return Object.fromEntries(['hero', 'tracks', 'plays', 'details', 'post'].map(key => [key, [col(l[key]), col(l[key])]]))
}
const blockWay = idx => { const hand = handLook(idx); if (hand) return hand; const w = BLOCK_WAYS[((idx || 0) % BLOCK_WAYS.length + BLOCK_WAYS.length) % BLOCK_WAYS.length]; const m = w.f(idx || 0); return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Array.isArray(v) ? v : [v, v]])) }


// A wedge of the playlist wheel, between radii r0 and r1 and angles a0..a1 (SVG path).
function wedgePath(cx, cy, r0, r1, a0, a1) {
  const P = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const [x0, y0] = P(r1, a0), [x1, y1] = P(r1, a1), [x2, y2] = P(r0, a1), [x3, y3] = P(r0, a0)
  const L = a1 - a0 > Math.PI ? 1 : 0
  const f = v => v.toFixed(1)
  return `M${f(x0)} ${f(y0)}A${r1} ${r1} 0 ${L} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r0} ${r0} 0 ${L} 0 ${f(x3)} ${f(y3)}Z`
}
// Playlists as petals: the dark outer petal is the room, the lighter inner one grows with the number of tracks in it, and it lights up
// (accent) when it holds the thing being added. `mini` is the little wheel in Details (no names); `onPick(p)` is the big one's click.
// `p.sub` is an extra small line under a petal's name (the owner, on the wheel of other people's playlists).
function PlaylistWheel({ lists, inIds, size, mini, onPick, pulse, withNew }) {
  const items = withNew ? [...lists, { id: 'new', name: 'New playlist', track_count: 0, isNew: true }] : lists
  const n = Math.max(items.length, 2)
  const cx = size / 2, cy = size / 2, R = size / 2 - (mini ? 3 : 18), r0 = size * (mini ? 0.16 : 0.1), th = (2 * Math.PI) / n
  const mx = Math.max(1, ...lists.map(p => p.track_count || 0)), sw = mini ? 2 : 12
  const memberInk = '#fff', plainInk = inkOnHex(themeHex('--theme-light2'))
  const room = 'color-mix(in srgb, var(--theme-dark1) 55%, #000)'
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      {items.map((p, i) => {
        const a0 = -Math.PI / 2 - th / 2 + i * th + 0.04, a1 = a0 + th - 0.08, am = (a0 + a1) / 2, inn = inIds.has(p.id)
        const fr = 0.4 + 0.6 * ((p.track_count || 0) / mx), ri = r0 + (R - r0) * fr
        const outer = wedgePath(cx, cy, r0 + sw / 2, R - sw / 2, a0 + sw / 2 / R, a1 - sw / 2 / R)
        const inner = wedgePath(cx, cy, r0 + sw / 2 + 2 + sw / 2, ri - sw / 2 - 4, a0 + (sw + 14) / 2 / ri, a1 - (sw + 14) / 2 / ri)
        const lr = (r0 + ri) / 2 + 2, tx = cx + lr * Math.cos(am), ty = cy + lr * Math.sin(am)
        const fillIn = inn ? 'var(--theme-accent)' : 'var(--theme-light2)'
        const ink = inn ? memberInk : plainInk
        if (mini) return <g key={p.id}><path d={outer} stroke={room} strokeWidth={sw} strokeLinejoin="round" fill={room} /><path d={inner} stroke={fillIn} strokeWidth={sw} strokeLinejoin="round" fill={fillIn} /></g>
        const nm = String(p.name || '')
        return (
          <g key={p.id} className={`lnv-pt${pulse === p.id ? ' pulse' : ''}`} style={{ '--i': i }} onClick={() => onPick(p)} role="button" aria-label={p.isNew ? 'New playlist' : p.sub ? `Open ${nm}` : `${inn ? 'Added to' : 'Add to'} ${nm}`}>
            <path className="o" d={outer} stroke={room} strokeWidth={sw} strokeLinejoin="round" fill={room} />
            <path className="n" d={inner} stroke={p.isNew ? 'none' : fillIn} strokeWidth={sw} strokeLinejoin="round" fill={p.isNew ? 'none' : fillIn} strokeDasharray={p.isNew ? '6 6' : undefined} />
            {p.isNew
              ? <text x={tx} y={ty + 8} textAnchor="middle" fontSize="28" fontWeight="700" style={{ fontFamily: BLOCK_CP, fill: '#fff', pointerEvents: 'none' }}>＋</text>
              : <>
                <text x={tx} y={ty - (p.sub ? 10 : 4)} textAnchor="middle" fontSize="22" fontWeight="700" style={{ fontFamily: BLOCK_CP, fill: ink, pointerEvents: 'none' }}>{inn ? '✓ ' : ''}{p.track_count || 0}</text>
                <text x={tx} y={ty + (p.sub ? 7 : 14)} textAnchor="middle" fontSize="12.5" style={{ fontFamily: BLOCK_CP, fill: ink, pointerEvents: 'none' }}>{nm.length > 14 ? `${nm.slice(0, 13)}…` : nm}</text>
                {p.sub && <text x={tx} y={ty + 21} textAnchor="middle" fontSize="10.5" style={{ fontFamily: BLOCK_CP, fill: ink, opacity: 0.75, pointerEvents: 'none' }}>{String(p.sub).length > 16 ? `${String(p.sub).slice(0, 15)}…` : p.sub}</text>}
              </>}
          </g>
        )
      })}
    </svg>
  )
}
// Where the wheel opens: centred on the cursor (kept on screen), springing out from it. A click anywhere else closes it.
function WheelShell({ at, onClose, children }) {
  const vw = window.innerWidth, vh = window.innerHeight
  const w = Math.min(380, vw - 24, vh - 130), h = w + 64
  const cx = at ? at.x : vw / 2, cy = at ? at.y : vh / 2 - 32
  const left = Math.min(Math.max(12, cx - w / 2), Math.max(12, vw - w - 12)), top = Math.min(Math.max(12, cy - w / 2), Math.max(12, vh - h - 12))
  return createPortal(
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'color-mix(in srgb, var(--theme-dark1) 38%, transparent)', animation: 'lnvFade .2s' }}>
      <style>{BLOCK_CSS}</style>
      <div onMouseDown={e => e.stopPropagation()} style={{ position: 'absolute', left, top, width: w, textAlign: 'center', transformOrigin: `${cx - left}px ${cy - top}px`, animation: 'lnvPop .45s cubic-bezier(.2,1.2,.3,1)', filter: 'drop-shadow(0 18px 28px rgba(0,0,0,0.35))' }}>
        {children}
      </div>
    </div>,
    document.body
  )
}
const WHEEL_PILL = { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--theme-light2)', padding: '7px 8px 7px 16px', borderRadius: 999, fontFamily: BLOCK_CP, fontWeight: 700, fontSize: 11.5, letterSpacing: '0.05em', textTransform: 'uppercase', boxShadow: '0 10px 24px rgba(0,0,0,0.25)' }
function WheelCaption({ children, onClose, extra }) {
  return (
    <div style={{ marginTop: 8 }}>
      {extra}
      <div style={{ ...WHEEL_PILL, color: inkOnHex(themeHex('--theme-light2')) }}>
        <span>{children}</span>
        <button onClick={onClose} aria-label="Close" style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--theme-accent)', color: '#fff', cursor: 'pointer', fontSize: 12 }}>✕</button>
      </div>
    </div>
  )
}
// What has been added in this session, so a slice stays lit: track url (or "p:<post>") -> playlist ids.
const addedMemo = new Map()
// The "+" on a track opens this at the cursor: your playlists as petals; tap one to add that track (or, with the switch, the whole release).
function PlaylistWheelPop({ post, tracks: given, title, at, onClose }) {
  const { playlists } = usePlaylists()
  const qc = useQueryClient()
  const signedIn = isLoggedIn()
  const lists = playlists.filter(p => p.role && p.release_count == null)
  const all = playableTracks(post).filter(t => t.url && t.title)
  const mine = (given || []).filter(t => t.url && t.title)
  const [scope, setScope] = useState(mine.length ? 'track' : 'all')
  const tracks = scope === 'track' && mine.length ? mine : all
  const key = scope === 'track' && mine.length ? `t:${mine[0].url}` : `p:${post.id}`
  const [, bump] = useState(0)
  const inIds = new Set(addedMemo.get(key) || [])
  const [note, setNote] = useState('')
  const [pulse, setPulse] = useState(null)
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  const what = scope === 'track' && mine.length ? `“${title || mine[0].title}”` : `all ${all.length} tracks`
  async function pick(p) {
    if (p.isNew) {
      const name = await askText({ title: 'Name the new playlist', placeholder: 'e.g. Techno, Sunday mornings', ok: 'Create', maxLength: 60 })
      if (!name || !name.trim()) return
      try { const created = await playlistsApi.create(name); await addTo(created) } catch (err) { setNote(err.message) }
      return
    }
    if (inIds.has(p.id)) { setNote(`Already in ${p.name}`); return }
    await addTo(p)
  }
  async function addTo(p) {
    if (!tracks.length) return setNote('Nothing playable to add yet.')
    try {
      const r = await playlistsApi.addTracks(p.id, tracks)
      addedMemo.set(key, new Set([...(addedMemo.get(key) || []), p.id])); bump(x => x + 1)
      setPulse(p.id); setTimeout(() => setPulse(null), 600)
      setNote(r.added ? `Added to ${p.name}` : `Already in ${p.name}`)
      qc.invalidateQueries({ queryKey: ['playlists'] }); qc.invalidateQueries({ queryKey: ['playlist', p.id] })
    } catch (err) { setNote(err.message) }
  }
  const scopePill = on => ({ border: '1.5px solid currentColor', background: on ? 'var(--theme-light2)' : 'transparent', color: on ? inkOnHex(themeHex('--theme-light2')) : '#fff', borderRadius: 999, padding: '4px 11px', fontFamily: BLOCK_CP, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' })
  return (
    <WheelShell at={at} onClose={onClose}>
      {!signedIn
        ? <div style={{ ...INK_DARK_BG, background: 'var(--theme-dark1)', borderRadius: 26, color: '#fff', padding: 26, fontFamily: BLOCK_CP, fontWeight: 700, fontSize: 16, letterSpacing: '0.05em', textTransform: 'uppercase' }}><a href="/login" style={{ color: 'var(--theme-light2)' }}>Sign in</a> to make playlists</div>
        : <PlaylistWheel lists={lists} inIds={inIds} size={520} onPick={pick} pulse={pulse} withNew />}
      <WheelCaption onClose={onClose}
        extra={mine.length > 0 && all.length > 1 ? <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 6 }}><button onClick={() => { setScope('track'); setNote('') }} style={scopePill(scope === 'track')}>this track</button><button onClick={() => { setScope('all'); setNote('') }} style={scopePill(scope === 'all')}>all {all.length} tracks</button></div> : null}>
        {note || (lists.length ? `Tap a slice to add ${what}` : 'No playlists yet: make one')}
      </WheelCaption>
    </WheelShell>
  )
}
// Other people's playlists that carry a track of this record (public lists on a profile, as the post data gives them).
const othersPlaylists = post => (post.playlists || []).filter(p => p.owner !== getUser())
// The wheel in Details opens this at the cursor: those playlists as petals (count, name, who made it); tap one to open it as a feed.
function OthersWheelPop({ post, at, onClose }) {
  const lists = othersPlaylists(post).map(p => ({ id: p.id, name: p.name, track_count: p.track_count || 0, sub: `by ${p.owner}`, token: p.token }))
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <WheelShell at={at} onClose={onClose}>
      {lists.length
        ? <PlaylistWheel lists={lists} inIds={new Set()} size={520} onPick={p => { onClose(); openPlaylistFeed({ token: p.token, id: p.id, name: p.name }) }} />
        : <div style={{ ...INK_DARK_BG, background: 'var(--theme-dark1)', borderRadius: 26, color: '#fff', padding: 26, fontFamily: BLOCK_CP, fontWeight: 700, fontSize: 15, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.4 }}>Nobody else has put this record in a public playlist yet</div>}
      <WheelCaption onClose={onClose}>{lists.length ? 'Playlists with this record · tap one to open' : 'Check back later'}</WheelCaption>
    </WheelShell>
  )
}
// The little wheel in Details: other people's playlists with this record at a glance; click opens the big one at the cursor.
function PlaylistMiniWheel({ post, onOpen }) {
  const lists = othersPlaylists(post).map(p => ({ ...p, track_count: p.track_count || 1 }))
  if (!lists.length) return <button onClick={e => onOpen({ x: e.clientX, y: e.clientY })} className="lnv-wheel" title="Nobody else has put this record in a public playlist yet" aria-label="Other people's playlists with this record" style={{ width: 96, height: 96, borderRadius: '50%', border: '2px dashed currentColor', background: 'none', color: 'inherit', fontFamily: BLOCK_CP, fontWeight: 700, fontSize: 24, cursor: 'pointer', opacity: 0.7 }}>0</button>
  return (
    <button onClick={e => onOpen({ x: e.clientX, y: e.clientY })} className="lnv-wheel" title="Other people's playlists with this record" aria-label="Other people's playlists with this record" style={{ position: 'relative', width: 112, height: 112, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
      <PlaylistWheel lists={lists} inIds={new Set(lists.map(p => p.id))} size={112} mini />
      <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: BLOCK_CP, fontWeight: 700, fontSize: 15, color: 'var(--lv-pri)' }}>{lists.length}</span>
    </button>
  )
}

function ShelfCard({ post, cardBg, d, onEdit, idx = 0, phone = false }) {
  useThemeTick() // the blocks' hand-coloured spectrum is per palette: look again when the palette changes
  const { registerPostRef, openD3 } = useLayout() || {}
  const { canModify, deleting, deletePost } = usePostActions(post)
  const [activeUrl, setActiveUrl] = useState(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(post.commentCount || post.comment_count || 0)
  const [plPop, setPlPop] = useState(null)
  const [wheel, setWheel] = useState(null) // blocks card: the playlist wheels ({ kind: 'add', at, tracks, title } from a track's +, { kind: 'others', at } from the wheel in Details)
  const [wash, setWash] = useState(null) // blocks card: the source colour flooding Plays from
  const chatId = useChatPost() // the notes card's replies pop-out: one open at a time, it stays with you for a few posts
  const notesReply = chatId === post.id
  const setNotesReply = (v, at) => setChatPost((typeof v === 'function' ? v(notesReply) : v) ? post.id : null, at)
  const [pairL, setPairL] = useState('p') // which of Plays from / The post is open
  const [pairR, setPairR] = useState('auto') // 'auto': Tracks and Details both open if the column has room (Details folds when the tracklist is long); 't' / 'd': the person swapped them by hand
  const [autoD, setAutoD] = useState(true)
  const colR = useRef(null), hdrR = useRef(null), trkBody = useRef(null), detBody = useRef(null), detH = useRef(260)
  const tracksOpen = pairR !== 'd'
  const detailsOpen = pairR === 'd' || (pairR === 'auto' && autoD)
  // Is this record on the listener's own Discogs lists? (the imported collection / wantlist; read-only)
  const { data: dAcct } = useDiscogsAccount()
  const { data: dRecs } = useDiscogsRecords()
  const dMine = post.discogs_id ? (dRecs?.records || []).find(r => String(r.discogs_id) === String(post.discogs_id)) : null
  const inColl = !!dMine?.lists.includes('collection'), inWant = !!dMine?.lists.includes('wantlist') // which of Tracks / Details is open
  const cardEl = useRef(null)
  // The replies pop-out follows you along the feed, back or forward, and closes once you are CHAT_POSTS_KEPT posts away from the one it was opened on.
  useEffect(() => {
    if (!notesReply) return
    const start = cardEl.current ? cardEl.current.getBoundingClientRect().left : 0 // where the post sat when it was opened
    const check = () => {
      const el = cardEl.current
      if (!el) return
      const away = Math.abs(el.getBoundingClientRect().left - start) / ((el.offsetWidth || 800) + 28) // posts away, a post being its card plus the gap
      if (away >= CHAT_POSTS_KEPT + 0.5) setChatPost(null)
    }
    document.addEventListener('scroll', check, true)
    return () => document.removeEventListener('scroll', check, true)
  }, [notesReply])
  useEffect(() => () => { if (chatPostId === post.id) setChatPost(null) }, [post.id])
  const feedMode = useFeedMode()
  const qcPriv = useQueryClient()

  const tracks = post.tracks || []
  const [srcPref, setSrcPref] = useSourcePref()
  // The listener's own services first (lib/listening.js), then a source they picked by hand.
  const [listening] = useListening()
  const urlOf = t => pickUrl(t, listening, srcPref)
  const artist = artistName(post)
  const label = labelName(post)
  const catNo = post.labels?.[0]?.catalogue_number || post.labels?.[0]?.catno || ''
  const note = cleanNote(post.notes || post.body)
  // A short post (no title, one line of up to 300 characters) reads as a quote, not as a description.
  const isShortPost = !!note && !post.post_title && note.length <= 300
  // Old and new posts alike: the post title (or a short note) reads as the quote, and a description sits under it.
  const quoteText = (post.post_title || '').trim() || (isShortPost ? note : '')
  const showDesc = !!note && !isShortPost
  const cover = coverSrc(post)
  const comp = isCompilation(post, tracks)
  const single = tracks.length <= 2 && !/album|lp|ep/i.test(post.post_type || '')
  const kind = comp ? 'compilation' : (single ? 'single' : (post.post_type || 'album'))
  const locations = shelfLocations(post, tracks)
  const contributors = comp ? [...new Set(tracks.flatMap(t => { const v = shelfTrack(t, true); return [...v.artists, ...v.remixers] }))] : []
  const descRef = useRef(null)
  const descFit = useScrollFit(descRef, [post.notes, post.body])
  const listRef = useRef(null)
  const listFit = useScrollFit(listRef, [tracks.length])
  // Genres show on two rows at most; what doesn't fit collapses into a "+N" pill.
  const genreBox = useRef(null)
  useEffect(() => {
    const el = genreBox.current
    if (!el) return undefined
    const fit = () => {
      const pills = [...el.querySelectorAll('[data-g]')]
      const more = el.querySelector('[data-more]')
      pills.forEach(p => { p.style.display = '' })
      more.style.display = 'none'
      const rows = list => new Set(list.map(p => p.offsetTop)).size
      if (rows(pills) <= 2) return
      more.style.display = ''
      let hidden = 0
      while (hidden < pills.length) {
        hidden++
        pills[pills.length - hidden].style.display = 'none'
        more.textContent = `+${hidden}`
        more.title = `${hidden} more genre${hidden === 1 ? '' : 's'}`
        if (rows([...pills.filter(p => p.style.display !== 'none'), more]) <= 2) break
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [post.genres])
  // The big post number's size follows the room left in the right-hand column.
  const numBox = useRef(null)
  const [numSize, setNumSize] = useState(d.numeralSize)
  useEffect(() => {
    const el = numBox.current
    if (!el) return undefined
    const digits = Math.max(2, String(post.feedNumber ?? post.id).length)
    const fit = () => setNumSize(Math.max(0, Math.min(d.numeralSize, Math.floor((el.clientHeight - NUM_LINE_GAP - 1 - 4) / d.numeralLh), Math.floor(el.clientWidth / (0.62 * digits)))))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [d.numeralSize, d.numeralLh, post.feedNumber, post.id])

  // Paired card: Details stays open beside Tracks only while both fit under the header; a long tracklist folds it.
  useEffect(() => {
    if (!PAIRED_CARDS) return undefined
    const col = colR.current
    if (!col) return undefined
    const check = () => {
      if (detBody.current) detH.current = detBody.current.scrollHeight + 50
      const trk = (trkBody.current ? trkBody.current.scrollHeight : tracks.length * 38) + 50
      const need = 12 + trk + detH.current + 3 * 9
      setAutoD(need <= col.clientHeight)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(col)
    return () => ro.disconnect()
  }, [tracks.length, pairR, post.playlists, post.alsoPostedBy]) // eslint-disable-line react-hooks/exhaustive-deps

  // Playback — the same rules as AlbumCard: a track's own player, else the post's own Bandcamp player, else the URL's embed.
  const firstUrl = tracks.map(urlOf).find(Boolean) || post.stream_url || null
  const activeTrack = activeUrl ? tracks.find(t => urlOf(t) === activeUrl) : null
  const ownLink = activeTrack && activeUrl === (activeTrack.stream_url || activeTrack.youtube_url)
  const playingSrc = !activeUrl ? null
    : trackEmbedSrc(ownLink ? activeTrack : { stream_url: activeUrl }, toEmbedSrc)
      || (activeUrl === post.stream_url && /bandcamp\.com\/EmbeddedPlayer/.test(post.embed_url || '') ? post.embed_url : toEmbedSrc(activeUrl))
  function playNext() {
    const urls = tracks.map(urlOf)
    const i = urls.indexOf(activeUrl)
    const next = i >= 0 ? urls.slice(i + 1).find(Boolean) : null
    if (next) setActiveUrl(next)
  }
  // A pill plays the release from that place and makes it the listener's choice.
  function playFrom(p) {
    const t = tracks.find(x => (x.sources || []).some(s => s.platform === p) || platformOf(x.stream_url || x.youtube_url) === p)
    const u = t ? ((t.sources || []).find(s => s.platform === p)?.url || t.stream_url || t.youtube_url) : null
    if (u) { setSrcPref(p); setActiveUrl(u) }
  }

  const discogsExact = post.discogs_url || (post.discogs_id ? `https://www.discogs.com/release/${post.discogs_id}` : null)
  const discogsHref = discogsExact || `https://www.discogs.com/search/?${new URLSearchParams({ q: [artist, post.title].filter(Boolean).join(' '), type: 'all' })}`
  const buyHref = post.discogs_id ? `https://www.discogs.com/sell/release/${post.discogs_id}` : (platformOfUrl(post.stream_url) === 'bandcamp' ? post.stream_url : null)
  const PILL = 0.82 // the pills run a tenth smaller than the old cards' badges, to sit with the title (gabriel, 2026-10-08; 0.8 was too small)
  const badge = { display: 'inline-block', fontFamily: d.labelFf, fontWeight: d.badgeWeight, fontSize: d.badgeSize * PILL, lineHeight: 1, letterSpacing: `${d.badgeLs}em`, textTransform: 'uppercase', padding: `${d.badgePy * PILL}px ${d.badgePx * PILL}px`, borderRadius: d.badgeRadius, textDecoration: 'none', whiteSpace: 'nowrap' }
  const linkKeyList = linkKeys(tracks)
  const num = String(post.feedNumber ?? post.id).padStart(2, '0')
  const stageH = `min(${d.artSize}px, calc(100vh - ${2 * (SHELF_PAD_Y + FLOAT_INSET_Y) + 300}px))`
  const COL_GAP = 28
  const artistLink = n => <DrawerLink key={n} kind="artists" name={n} quiet style={{ fontWeight: 700, color: 'var(--lv-pri)' }}>{n}</DrawerLink>

  // Highlights (2026-10-10): a signed-in person stars a track; the poster's own stars are the post's picks.
  const me = getUser()
  const [hl, setHl] = useState({})
  const hlOf = t => hl[t.id] || { by: t.highlightedBy || [], n: t.highlightCount || 0 }
  const posterName = post.user?.username || post.username
  async function toggleHighlight(t) {
    if (!me || !t.id) return
    const before = hlOf(t), was = before.by.includes(me)
    const next = was ? { by: before.by.filter(n => n !== me), n: Math.max(0, before.n - 1) } : { by: [...before.by, me], n: before.n + 1 }
    setHl(prev => ({ ...prev, [t.id]: next })) // answer at once
    try {
      const res = await fetch(`${API}/posts/${post.id}/tracks/${t.id}/highlight`, { method: was ? 'DELETE' : 'PUT', headers: authHeaders() })
      if (!res.ok) throw new Error(res.status === 404 ? 'The site needs updating before highlights can be saved.' : 'Could not save that highlight — try again.')
      const s = await res.json()
      setHl(prev => ({ ...prev, [t.id]: { by: s.highlightedBy, n: s.highlightCount } }))
    } catch (err) {
      setHl(prev => ({ ...prev, [t.id]: before }))
      window.alert(err.message || 'Could not save that highlight — try again.')
    }
  }
  const highlighted = tracks.filter(t => hlOf(t).n > 0).length
  // Text sizes: the track names, and the comments + reply box (the record title's size). Change these two lines to resize them.
  const trackText = 13
  const textSize = 20
  // Highlight colours: yours, and the wall owner's (or, off a wall, the poster's).
  const MINE_HL = 'var(--theme-accent)', OWNER_HL = 'var(--theme-showcase)'
  const ownerName = feedMode.type === 'wall' ? feedMode.username : posterName
  // Private replies waiting for the post's owner (only asked for on your own posts).
  const { data: privData } = useQuery({
    queryKey: ['private-count', post.id],
    queryFn: async () => { const r = await fetch(`${API}/posts/${post.id}/comments/private-count`, { headers: authHeaders() }); return r.ok ? r.json() : { private: 0 } },
    enabled: !!me && posterName === me,
    staleTime: 30_000,
  })
  const privateWaiting = privData?.private || 0

  const row = (t, i) => {
    const u = urlOf(t)
    const active = !!activeUrl && u === activeUrl
    const v = shelfTrack(t, comp)
    const h = hlOf(t)
    const mine = !!me && h.by.includes(me)
    const byOwner = !!ownerName && ownerName !== me && h.by.includes(ownerName)
    const mix = (c, n) => `color-mix(in srgb, ${c} ${n}%, transparent)`
    const grad = c => `linear-gradient(90deg, ${mix(c, 30)}, ${mix(c, 6)})`
    const tint = byOwner && mine ? `linear-gradient(90deg, ${mix(OWNER_HL, 30)}, ${mix(MINE_HL, 30)})` : byOwner ? grad(OWNER_HL) : mine ? grad(MINE_HL) : mix('var(--lv-pri)', 7)
    const pick = byOwner // kept for the star colour below
    return (
      <div key={i}>
        <div onClick={() => { if (u) setActiveUrl(active ? null : u) }}
          style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto auto', gap: 8, alignItems: 'center', margin: '0 0 5px', padding: `${Math.max(4, d.trackRowpad - 2)}px 11px`, borderRadius: 12, border: `1px solid ${byOwner ? mix(OWNER_HL, 55) : mine ? mix(MINE_HL, 55) : 'transparent'}`, cursor: u ? 'pointer' : 'default', background: active ? 'color-mix(in srgb, var(--theme-accent) 22%, transparent)' : tint }}>
          <span style={{ fontFamily: d.monoFf, fontSize: d.tracknumSize, color: active ? 'var(--theme-accent)' : 'var(--lv-ter)' }}>{active ? '▶' : (t.position || i + 1)}</span>
          <span style={{ fontFamily: d.bodyFf, fontSize: trackText, lineHeight: 1.2, color: 'var(--lv-pri)', fontWeight: PAIRED_CARDS ? 400 : 600, minWidth: 0, overflowWrap: 'anywhere' }}>
            {v.title}
            {(v.artists.length > 0 || v.remixers.length > 0) && <span><span style={{ margin: '0 7px', color: 'var(--lv-ter)', fontWeight: 400 }}>–</span>{[...v.artists, ...v.remixers].map((n, k) => <span key={n}>{k > 0 && ', '}{artistLink(n)}</span>)}</span>}
          </span>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {PAIRED_CARDS && t.duration && <span style={{ fontFamily: d.monoFf, fontSize: 10.5, color: 'var(--lv-ter)' }}>{t.duration}</span>}
            {!PAIRED_CARDS && <SourceChips always track={t} activeUrl={activeUrl} pref={platformOf(urlOf(t))} d={d} onPick={s => { setSrcPref(s.platform); setActiveUrl(s.url) }} />}
            {u && <AddToPlaylistButton tracks={[trackFrom(post, t)]} label="+" align="right" style={{ fontFamily: d.monoFf, fontSize: d.trackSize, color: 'var(--lv-ter)' }} />}
          </span>
          <button onClick={e => { e.stopPropagation(); toggleHighlight(t) }} title={h.n ? `Highlighted by ${h.by.join(', ')}${h.n > h.by.length ? ` +${h.n - h.by.length}` : ''}` : (me ? 'Highlight this track' : 'Sign in to highlight tracks')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: me ? 'pointer' : 'default', fontFamily: d.monoFf, fontSize: 11.5, color: 'var(--lv-ter)' }}>
            {h.n > 0 && <span style={{ display: 'inline-flex' }}>{h.by.slice(0, 3).map((n, k) => <i key={n} style={{ width: 16, height: 16, borderRadius: '50%', marginLeft: k ? -5 : 0, border: `2px solid ${cardBg}`, background: 'var(--lv-sec)', color: cardBg, font: '700 8px/12px sans-serif', fontStyle: 'normal', textAlign: 'center' }}>{n[0]?.toUpperCase()}</i>)}</span>}
            {h.n > 0 && <span>{h.n}</span>}
            <span style={{ fontSize: 15, lineHeight: 1, color: mine ? MINE_HL : pick ? OWNER_HL : 'var(--lv-ter)' }}>{mine || h.n ? '★' : '☆'}</span>
          </button>
        </div>
        {active && <PreviewPrompt post={post} track={t} linkKey={linkKeyList[i]} activeUrl={activeUrl} indent={34} />}
      </div>
    )
  }

  if (MODULE_CARDS) {
    const ph = phone // on a phone the same boxes stack down the slide
    const runtime = noteRuntime(tracks)
    const keptBy = [posterName, ...(post.alsoPostedBy || [])].filter(Boolean)
    const nowP = srcPref || platformOf(activeUrl || firstUrl)
    const dotsOf = t => { const s = new Set((t.sources || []).map(x => x.platform)); const own = platformOf(t.stream_url || t.youtube_url); if (own) s.add(own); return [...s] }
    const playing = !!playingSrc
    const activeIdx = activeUrl ? tracks.findIndex(t => urlOf(t) === activeUrl) : -1
    const ML = moduleLook(idx) // this post's place on the spectrum: one solid colour, plus two accent colours from the same palette
    const BASE = solid(ML.base), A1 = solid(ML.a1), A2 = solid(ML.a2), DARK = solid(ML.cover)
    const mono = { fontFamily: d.monoFf, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10.5 }
    const chip = { fontFamily: d.bodyFf, fontWeight: 500, fontSize: 12, padding: '7px 13px', borderRadius: 99, border: '1px solid color-mix(in srgb, var(--lv-pri) 42%, transparent)', background: 'none', color: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none', display: 'block', textAlign: 'center' }
    const chipFill = { ...chip, background: 'var(--lv-pri)', color: 'var(--blk-bg)', borderColor: 'var(--lv-pri)' }
    const nm = (artist || post.title || '').length
    const wordSize = ph ? (nm <= 10 ? 38 : nm <= 16 ? 30 : nm <= 26 ? 25 : 21) : (nm <= 8 ? 60 : nm <= 12 ? 48 : nm <= 18 ? 38 : nm <= 28 ? 30 : 24)
    const numSz = ph ? (num.length <= 2 ? 44 : num.length === 3 ? 36 : num.length === 4 ? 30 : 24) : (num.length <= 2 ? 58 : num.length === 3 ? 46 : num.length === 4 ? 36 : 28)
    const R = ph ? 30 : 40 // the corner curve (the strip's 40 on a desktop)
    const nPl = (post.playlists || []).length
    const badge = { width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--lv-pri)', color: 'var(--blk-bg)', display: 'grid', placeItems: 'center', fontSize: 14, cursor: 'pointer', padding: 0, fontFamily: d.monoFf }
    const at = e => ({ x: e.clientX, y: e.clientY })
    const quote = quoteText || note
    const dt = { ...mono, fontSize: 9.5, opacity: 0.7 }
    const dd = { margin: '2px 0 0', fontFamily: d.bodyFf, fontWeight: 500, fontSize: 14, lineHeight: 1.25, overflowWrap: 'anywhere' }
    const mrow = (t, i) => {
      const u = urlOf(t)
      const active = !!activeUrl && u === activeUrl
      const v = shelfTrack(t, comp)
      const h = hlOf(t)
      const mine = !!me && h.by.includes(me)
      return (
        <div key={i}>
          <div className="mod-tr" onClick={() => { if (u) setActiveUrl(active ? null : u) }}
            style={{ display: 'grid', gridTemplateColumns: ph ? '24px minmax(0, 1fr) auto 22px 24px' : '30px minmax(0, 1fr) auto 46px 22px 24px', gap: 10, alignItems: 'center', minHeight: 40, borderBottom: '1px solid color-mix(in srgb, var(--lv-pri) 14%, transparent)', cursor: u ? 'pointer' : 'default', opacity: u ? 1 : 0.5, color: undefined, background: active ? 'color-mix(in srgb, var(--theme-accent) 30%, transparent)' : undefined, fontFamily: d.bodyFf, fontSize: 14.5, lineHeight: 1.2 }}>
            <span style={{ ...mono, fontSize: 10.5, opacity: 0.65 }}>{active ? '▶' : (t.position || i + 1)}</span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontWeight: 500 }}>
              {v.title}
              {(v.artists.length > 0 || v.remixers.length > 0) && <span style={{ fontWeight: 400, opacity: 0.6 }}> – {[...v.artists, ...v.remixers].map((n, k) => <span key={n}>{k > 0 && ', '}{artistLink(n)}</span>)}</span>}
            </span>
            <span style={{ display: 'inline-flex', gap: 3 }}>{dotsOf(t).map(p => <i key={p} title={SOURCE_NAME[p] || p} style={{ width: 8, height: 8, borderRadius: '50%', background: shelfColor(p), display: 'inline-block' }} />)}</span>
            {!ph && <span style={{ ...mono, fontSize: 11, textAlign: 'right', opacity: 0.6 }}>{t.duration || ''}</span>}
            <span style={{ display: 'grid', placeItems: 'center' }}>{u ? <button onClick={e => { e.stopPropagation(); setWheel({ kind: 'add', at: at(e), tracks: [trackFrom(post, t)], title: v.title }) }} title="Add to one of your playlists" aria-label={`Add ${t.title} to a playlist`} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.45, fontFamily: d.monoFf, fontSize: 16, lineHeight: 1 }}>+</button> : null}</span>
            <button onClick={e => { e.stopPropagation(); toggleHighlight(t) }} aria-pressed={mine}
              aria-label={me ? `${mine ? 'Remove your highlight from' : 'Highlight'} ${t.title}` : 'Sign in to highlight tracks'}
              title={h.n ? `Highlighted by ${h.by.join(', ')}${h.n > h.by.length ? ` +${h.n - h.by.length}` : ''}` : (me ? 'Highlight this track' : 'Sign in to highlight tracks')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: me ? 'pointer' : 'default', fontSize: 15, color: mine ? 'var(--theme-accent)' : 'inherit', opacity: mine || h.n ? 1 : 0.4 }}>{mine || h.n ? '★' : '☆'}</button>
          </div>
          {active && <PreviewPrompt post={post} track={t} linkKey={linkKeyList[i]} activeUrl={activeUrl} indent={34} />}
        </div>
      )
    }
    return (
      <div ref={el => { cardEl.current = el; registerPostRef?.(post.id, el) }} className="lnv-blocks"
        style={ph ? { position: 'relative', width: '100%', padding: '0 0 16px', boxSizing: 'border-box' } : { position: 'relative', flexShrink: 0, width: d.cardW, height: '100%', padding: '14px 0', boxSizing: 'border-box' /* the full page height: the search and the compose button moved to the strip (14 Oct) */ }}>
        <style>{BLOCK_CSS}{MODULE_CSS}</style>
        <div className={`lnv-mod${ph ? ' lnv-modp' : ''}`} style={{ position: 'relative', width: '100%', ...(ph ? { display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) 108px', gridTemplateAreas: '"word disc" "cover cover" "det det" "src src" "post post" "stats stats" "trk trk"', color: 'var(--lv-pri)' } : { height: '100%', display: 'grid', gap: 8, gridTemplateColumns: '200px 330px minmax(240px, 1fr)', gridTemplateRows: 'minmax(84px, 112px) minmax(220px, 330px) minmax(120px, 150px) minmax(150px, 1fr)', gridTemplateAreas: '"word word disc" "det cover src" "det post stats" "trk trk trk"', color: 'var(--lv-pri)' }) }}>

        {/* top left: the artist wordmark, with the release title under it */}
        <Blk bg={BASE} className="lnv-still" style={{ gridArea: 'word', borderRadius: R, padding: ph ? '16px 18px' : '14px 26px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
          <h2 ref={hdrR} style={{ margin: 0, fontFamily: d.bodyFf, fontWeight: 600, fontSize: wordSize, letterSpacing: '-0.045em', lineHeight: 0.95, color: 'var(--lv-pri)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
            {artist && !isVariousArtist(artist) ? <DrawerLink kind="artists" name={artist} quiet style={{ color: 'inherit', fontWeight: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit' }}>{artist}</DrawerLink> : (artist || post.title)}<span style={{ color: 'var(--lv-sec)' }}>.</span>
          </h2>
          <div style={{ marginTop: 6, fontFamily: d.bodyFf, fontStyle: 'italic', fontWeight: 300, fontSize: 19, color: 'var(--lv-sec)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.title}</div>
        </Blk>

        {/* top right: the post number, and a play / stop button (click the box to play or stop) */}
        <Blk bg={BASE} className="lnv-still" style={{ gridArea: 'disc', borderRadius: R, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: ph ? '12px 14px' : '0 20px 0 22px', minWidth: 0, cursor: 'pointer' }} onClick={() => { if (playing) setActiveUrl(null); else if (firstUrl) setActiveUrl(firstUrl) }} title={playing ? 'Stop' : 'Play'}>
          <div aria-label={`Post ${num}`} style={{ position: 'relative', zIndex: 2, flex: 'none', minWidth: ph ? 0 : 96, lineHeight: 1.2 }}>
            <span style={{ ...mono, display: 'block', fontSize: 9.5, opacity: 0.6 }}>№ post</span>
            <b style={{ display: 'block', fontFamily: d.bodyFf, fontWeight: 200, fontSize: numSz, lineHeight: 0.95, letterSpacing: '-0.05em', margin: '2px 0 4px' }}>{num}</b>
            {!ph && <span style={{ ...mono, display: 'block', fontSize: 9.5, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 128 }}>{playing ? `Now${activeIdx >= 0 ? ` · ${tracks[activeIdx].position || activeIdx + 1}` : ''}` : `${kind} · ${tracks.length} track${tracks.length === 1 ? '' : 's'}`}</span>}
          </div>
          {!ph && <span style={{ position: 'relative', zIndex: 2, width: 50, height: 50, borderRadius: '50%', background: 'var(--lv-pri)', color: 'var(--blk-bg)', display: 'grid', placeItems: 'center', fontSize: 16, paddingLeft: playing ? 0 : 2 }}>{playing ? '❚❚' : '▶'}</span>}
        </Blk>

        {/* left of the media: the details, with the add-to buttons */}
        <Blk bg={A1} className="lnv-still" style={{ gridArea: 'det', borderRadius: R, padding: 14, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className={`mod-hatch${playing ? ' on' : ''}`} style={{ flex: '0 0 46px' }}>
            <span style={{ ...mono, position: 'absolute', left: 10, top: 12, fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--lv-pri)', color: 'var(--blk-bg)', zIndex: 2 }}>Details</span>
          </div>
          <div data-inner-scroll="" style={{ flex: ph ? 'none' : '1 1 0', minHeight: 0, overflowY: ph ? 'visible' : 'auto', marginTop: 12, ...INNER_SCROLL_STYLE }}>
            <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
              {label && <div><dt style={dt}>Label</dt><dd style={dd}><DrawerLink kind="labels" name={label}>{label}</DrawerLink></dd></div>}
              {(catNo || post.year) && <div><dt style={dt}>{catNo && post.year ? 'Cat. no. · Year' : catNo ? 'Cat. no.' : 'Year'}</dt><dd style={dd}>{[catNo, post.year].filter(Boolean).join(' · ')}</dd></div>}
              {post.genres?.length > 0 && <div><dt style={dt}>Genres</dt><dd style={{ ...dd, fontWeight: 400, opacity: 0.9 }}>{post.genres.join(', ')}</dd></div>}
              {contributors.length > 0 && <div><dt style={dt}>Artists</dt><dd style={{ ...dd, fontWeight: 400, fontSize: 12.5 }}>{contributors.slice(0, 8).map((n, k) => <span key={n}>{k > 0 && ' · '}{artistLink(n)}</span>)}{contributors.length > 8 && <span style={{ opacity: 0.6 }}> +{contributors.length - 8}</span>}</dd></div>}
            </dl>
          </div>
          <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: ph ? '1fr 1fr' : '1fr', gap: 6, marginTop: 12 }}>
            <HeartButton post={post} text={on => on ? '♥ In your feed' : '♡ Add to feed'} style={{ ...chip, width: '100%', background: 'var(--lv-pri)', color: 'var(--blk-bg)', borderColor: 'var(--lv-pri)' }} onStyle={{ background: 'transparent', color: 'var(--lv-pri)', borderColor: 'var(--lv-pri)' }} />
            <AddToPlaylistButton post={post} label="＋ Add to playlist" style={{ ...chip, width: '100%', fontSize: 12 }} />
            {dAcct?.linked && [['collection', inColl, 'collection', 'in your collection'], ['wantlist', inWant, 'wantlist', 'on your wantlist']].map(([k, on, add, yes]) => (
              on ? <span key={k} style={{ ...chip, cursor: 'default', opacity: 0.85 }}>✓ {yes}</span>
                : discogsExact ? <a key={k} href={discogsExact} target="_blank" rel="noopener noreferrer" title="Opens the release on Discogs, where you add it to your list" style={chip}>＋ {add} ↗</a> : null
            ))}
            <div style={{ display: 'flex', gap: 6 }}>
              <a href={discogsHref} target="_blank" rel="noopener noreferrer" title={discogsExact ? 'Open release on Discogs' : 'Search Discogs'} style={{ ...chip, flex: 1, padding: '7px 6px' }}>Discogs ↗</a>
              {buyHref && <a href={buyHref} target="_blank" rel="noopener noreferrer" style={{ ...chip, flex: 1, padding: '7px 6px' }}>Buy ↗</a>}
            </div>
          </div>
        </Blk>

        {/* the cover; the player takes its place */}
        <Blk bg={DARK} className="lnv-still" style={{ gridArea: 'cover', borderRadius: R, padding: 0, ...(ph ? { aspectRatio: '1 / 1' } : null) }}>
          {playingSrc ? (
            <div style={{ position: 'absolute', inset: 0, background: '#000' }}><TrackPlayer key={playingSrc} src={playingSrc} title={post.title} autoplay onEnded={playNext} /></div>
          ) : (
            <div onClick={() => firstUrl && setActiveUrl(firstUrl)} style={{ position: 'absolute', inset: 0, background: cover ? '#000' : 'var(--theme-dark3)', cursor: firstUrl ? 'pointer' : 'default' }}>
              {cover && <img src={cover} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              {firstUrl && <span className="mod-cplay" aria-hidden="true">▶</span>}
            </div>
          )}
        </Blk>

        {/* the big box beside the cover: the playlists this record is in (the sources moved to the small box, 14 Oct) */}
        <Blk bg={BASE} className="lnv-still" style={{ gridArea: 'src', borderRadius: R, padding: '16px 18px 14px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...mono, display: 'flex', justifyContent: 'space-between', opacity: 0.7, marginBottom: 8 }}><span>playlists</span><span>{nPl}</span></div>
          <div style={{ flex: ph ? 'none' : '1 1 0', minHeight: 0, overflowY: ph ? 'visible' : 'auto', ...INNER_SCROLL_STYLE }}>
            {nPl === 0 ? <div style={{ fontFamily: d.bodyFf, fontSize: 14, lineHeight: 1.4, opacity: 0.65 }}>Not in anyone's playlists yet.</div>
              : post.playlists.map(pl => (
                <div key={pl.id} className="mod-sr" onClick={() => openPlaylistFeed({ token: pl.token, id: pl.id, name: pl.name })} title={`${pl.name}${pl.owner ? ` · by ${pl.owner}` : ''}`}
                  style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', gap: 10, alignItems: 'center', padding: '10px 12px', margin: '0 -12px', borderRadius: 14, cursor: 'pointer', fontFamily: d.bodyFf, fontWeight: 500, fontSize: 15 }}>
                  <span aria-hidden="true" style={{ opacity: 0.6 }}>♫</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</span>
                    {pl.owner && <span style={{ ...mono, display: 'block', fontSize: 9.5, opacity: 0.6, marginTop: 2 }}>by {pl.owner}</span>}
                  </span>
                </div>
              ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <AddToPlaylistButton post={post} label="＋ Add to playlist" style={chip} />
            {nPl > 0 && <button onClick={e => setWheel({ kind: 'others', at: at(e) })} title="Other people's playlists with this record" style={chipFill}>See all</button>}
          </div>
        </Blk>

        {/* under the media: the post, and only the post */}
        <Blk bg={BASE} className="lnv-still" style={{ gridArea: 'post', borderRadius: R, padding: '14px 20px 12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...mono, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', opacity: 0.7 }}><span>the post</span><span>{commentCount} repl{commentCount === 1 ? 'y' : 'ies'}</span></div>
          <div style={{ flex: ph ? 'none' : '1 1 0', minHeight: 0, marginTop: 6, overflow: 'hidden' }}>
            {quote ? <p title={quote} style={{ margin: 0, fontFamily: d.bodyFf, fontStyle: 'italic', fontWeight: 400, fontSize: 17, lineHeight: 1.28, letterSpacing: '-0.01em', whiteSpace: 'pre-line', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: ph ? 12 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{quote}</p>
              : <p style={{ margin: 0, fontFamily: d.bodyFf, fontSize: 14, color: 'var(--lv-ter)' }}>No post text.</p>}
          </div>
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontFamily: d.monoFf, fontSize: 11 }}>
            {posterName && <UserChip name={posterName} d={d} />}
            <span style={{ color: 'var(--lv-ter)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }} title={stampOf(post.created_at)}>{stampOf(post.created_at).split(' · ')[0]}</span>
            {privateWaiting > 0 && <button onClick={e => { setNotesReply(true, at(e)); qcPriv.invalidateQueries({ queryKey: ['private-count', post.id] }) }} title="Private replies, only you can see them" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: d.bodyFf, fontSize: 12, color: 'var(--theme-accent)' }}>🔒 {privateWaiting}</button>}
            <button onClick={e => setNotesReply(v => !v, at(e))} aria-expanded={notesReply} style={{ ...chipFill, marginLeft: 'auto', padding: '6px 14px' }}>↩ Reply{commentCount > 0 ? ` · ${commentCount}` : ''}</button>
            {canModify && <>
              <button onClick={() => onEdit?.(post)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--lv-sec)' }}>edit</button>
              <button onClick={deletePost} disabled={deleting} style={{ background: 'none', border: 'none', padding: 0, cursor: deleting ? 'default' : 'pointer', font: 'inherit', color: 'var(--lv-ter)', opacity: deleting ? 0.5 : 1 }}>{deleting ? '…' : 'delete'}</button>
            </>}
          </div>
        </Blk>

        {/* kept by, playlists */}
        <div style={{ gridArea: 'stats', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, minHeight: 0 }}>
          <Blk bg={A2} className="lnv-still" style={{ borderRadius: R, padding: '14px 16px', display: 'flex', flexDirection: 'column', minHeight: ph ? 150 : undefined }}>
            <span style={{ ...mono, opacity: 0.6 }}>kept by</span>
            <div style={{ marginTop: 'auto', fontFamily: d.bodyFf, fontWeight: 200, fontSize: 68, lineHeight: 0.9, letterSpacing: '-0.05em', color: 'var(--lv-pri)' }}>{String(keptBy.length).padStart(2, '0')}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ ...mono, opacity: 0.6 }}>people</span>
              <button onClick={() => openD3?.('postlist', { kind: 'people', people: keptBy, title: 'Kept by', post: [artist, post.title].filter(Boolean).join(' – ') })} title="See who kept this" aria-label="See who kept this" style={badge}>›</button>
            </div>
          </Blk>
          <Blk bg={BASE} className="lnv-still" style={{ borderRadius: R, padding: '14px 12px 10px 14px', display: 'flex', flexDirection: 'column', minHeight: ph ? 150 : undefined }}>
            <div style={{ ...mono, display: 'flex', justifyContent: 'space-between', fontSize: 9.5, opacity: 0.6, marginBottom: 6, paddingRight: 4 }}><span>listen on</span><span>{locations.length}</span></div>
            <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', ...INNER_SCROLL_STYLE }}>
              {locations.length === 0 && <div style={{ fontFamily: d.bodyFf, fontSize: 12.5, opacity: 0.6 }}>No links yet.</div>}
              {locations.map(({ p, n }) => {
                const on = nowP === p
                return (
                  <div key={p} className="mod-sr" onClick={() => playFrom(p)} title={`Play from ${SOURCE_NAME[p] || p}`}
                    style={{ display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr) auto', gap: 7, alignItems: 'center', padding: '5px 8px', margin: '0 -8px', borderRadius: 10, cursor: 'pointer', fontFamily: d.bodyFf, fontWeight: 500, fontSize: 12.5, background: on ? 'var(--lv-pri)' : undefined, color: on ? 'var(--blk-bg)' : undefined }}>
                    <i style={{ width: 8, height: 8, borderRadius: '50%', background: shelfColor(p) }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(SOURCE_NAME[p] || p).split(' ')[0]}</span>
                    <em style={{ ...mono, fontStyle: 'normal', fontSize: 9.5, opacity: 0.7 }}>{tracks.length > 1 ? `${n}/${tracks.length}` : ''}</em>
                  </div>
                )
              })}
            </div>
          </Blk>
        </div>

        {/* the tracks */}
        <Blk bg={BASE} className="lnv-still" style={{ gridArea: 'trk', borderRadius: R, padding: ph ? '14px 16px 6px' : '14px 24px 0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 8, borderBottom: '1px solid var(--lv-pri)', flexShrink: 0 }}>
            <b style={{ fontFamily: d.bodyFf, fontWeight: 600, fontSize: 17 }}>Tracks</b>
            <span style={{ ...mono, marginLeft: 'auto', opacity: 0.6 }}>{tracks.length}{runtime ? ` · ${runtime}` : ''}{highlighted ? ` · ${highlighted} ★` : ''}</span>
          </div>
          <div data-inner-scroll="" style={{ flex: ph ? 'none' : '1 1 0', minHeight: 0, overflowY: ph ? 'visible' : 'auto', ...INNER_SCROLL_STYLE }}>
            {tracks.map((t, i) => mrow(t, i))}
          </div>
        </Blk>
        </div>

        {notesReply && createPortal(<NoteReplies fun sheet={false} post={post} posterName={posterName} size={Math.max(Math.round(d.artSize * 0.75), 340)} d={d} cardBg="var(--theme-sidebar)" onClose={() => setNotesReply(false)} onCount={setCommentCount} />, document.body)}
        {wheel?.kind === 'add' && <PlaylistWheelPop post={post} tracks={wheel.tracks} title={wheel.title} at={wheel.at} onClose={() => setWheel(null)} />}
        {wheel?.kind === 'others' && <OthersWheelPop post={post} at={wheel.at} onClose={() => setWheel(null)} />}
      </div>
    )
  }

  if (BLOCKS_CARDS) {
    const ph = phone // the phone feed: one column, the slide scrolls instead of the blocks
    const runtime = noteRuntime(tracks)
    const keptBy = [posterName, ...(post.alsoPostedBy || [])].filter(Boolean)
    const nowP = srcPref || platformOf(activeUrl || firstUrl)
    const dotsOf = t => { const s = new Set((t.sources || []).map(x => x.platform)); const own = platformOf(t.stream_url || t.youtube_url); if (own) s.add(own); return [...s] }
    const W = blockWay(idx) // this post's colourway
    const cov = 230
    const replySizeBlocks = Math.round(d.artSize * 0.75)
    const lab = { fontFamily: BLOCK_CP, fontWeight: 700, fontSize: 21, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexShrink: 0 }
    const labSmall = { fontFamily: BLOCK_CP, fontWeight: 600, fontSize: 10.5, letterSpacing: '0.06em', opacity: 0.7 }
    const dtStyle = { fontFamily: d.monoFf, fontWeight: 600, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6 }
    const ddStyle = { margin: '2px 0 0', fontFamily: d.bodyFf, fontWeight: 500, fontSize: 14 }
    const pillBtn = { fontFamily: d.bodyFf, fontWeight: 600, fontSize: 11, padding: '6px 12px', borderRadius: 99, border: '1.5px solid currentColor', background: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }
    const colFill = ph ? {} : { display: 'flex', flexDirection: 'column', minHeight: 0 } // a block whose body can scroll, only if it has to
    const scrollBody = ph ? {} : { flex: '1 1 0', minHeight: 0, overflowY: 'auto', ...INNER_SCROLL_STYLE }
    const ripple = e => {
      const blk = e.currentTarget.closest('section'); if (!blk) return
      const r = blk.getBoundingClientRect(), el = document.createElement('i')
      el.className = 'lnv-rip'; el.style.left = `${e.clientX - r.left}px`; el.style.top = `${e.clientY - r.top}px`
      blk.prepend(el); setTimeout(() => el.remove(), 900)
    }
    const washInk = wash ? (inkOnHex(shelfColor(wash.p)) === '#fff' ? INK_DARK_BG : INK_LIGHT_BG) : null
    const sourceClick = (e, p) => {
      const r = e.currentTarget.closest('section').getBoundingClientRect()
      setWash(w => (w && w.p === p ? null : { p, x: e.clientX - r.left, y: e.clientY - r.top }))
      playFrom(p)
    }
    const clamp = n => (ph ? {} : { display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) // the post box never scrolls: a long post is cut with an ellipsis (hover for all of it)
    const star = (t, h, mine) => (
      <button onClick={e => { e.stopPropagation(); toggleHighlight(t) }} className={mine ? undefined : 'lnv-off'} aria-pressed={mine}
        aria-label={me ? `${mine ? 'Remove your highlight from' : 'Highlight'} ${t.title}` : 'Sign in to highlight tracks'}
        title={h.n ? `Highlighted by ${h.by.join(', ')}${h.n > h.by.length ? ` +${h.n - h.by.length}` : ''}` : (me ? 'Highlight this track' : 'Sign in to highlight tracks')}
        style={{ width: 26, height: 26, border: 'none', background: 'none', padding: 0, cursor: me ? 'pointer' : 'default', fontSize: 14, color: mine ? 'var(--theme-accent)' : 'inherit' }}>{mine || h.n ? '★' : '☆'}</button>
    )
    return (
      <div ref={el => { cardEl.current = el; registerPostRef?.(post.id, el) }} className="lnv-blocks"
        style={ph
          ? { position: 'relative', width: '100%', background: 'var(--theme-bg)', padding: '0 0 24px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8, transition: 'background 0.8s', color: 'var(--lv-pri)' }
          : { position: 'relative', flexShrink: 0, width: d.cardW, height: '100%', background: 'var(--theme-bg)', padding: `${NOTES_PAD_TOP}px 20px ${NOTES_PAD_BOTTOM}px`, boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8, transition: 'background 0.8s', color: 'var(--lv-pri)' }}>
        <style>{BLOCK_CSS}</style>
        {/* the release: cover (the player takes its place), the header exactly as the card has had it, the post number in its circle */}
        <Blk bg={W.hero} cut="br" style={{ flex: '0 0 auto', padding: ph ? '14px 14px 22px' : '18px 24px 24px', display: 'grid', gridTemplateColumns: ph ? 'minmax(0, 1fr)' : `${cov}px minmax(0, 1fr)`, gap: ph ? 16 : 24, alignItems: 'center' }}>
          <div style={{ position: 'relative', width: ph ? '100%' : cov, height: ph ? undefined : cov, aspectRatio: ph ? '1' : undefined, borderRadius: 18, overflow: 'hidden', background: playingSrc ? '#000' : 'var(--theme-dark3)' }}>
            {playingSrc ? (
              <TrackPlayer key={playingSrc} src={playingSrc} title={post.title} autoplay onEnded={playNext} />
            ) : (
              <div onClick={() => firstUrl && setActiveUrl(firstUrl)} style={{ position: 'absolute', inset: 0, background: cover ? '#000' : 'var(--theme-dark3)', cursor: firstUrl ? 'pointer' : 'default' }}>
                {cover && <img src={cover} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
            )}
          </div>
          <div ref={hdrR} style={{ minWidth: 0, paddingRight: ph ? 0 : 56 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
              <span style={{ ...badge, background: 'var(--theme-accent)', color: '#fff', borderRadius: 99 }}>{kind}</span>
              {locations.map(({ p, n }) => (
                <button key={p} onClick={() => playFrom(p)} title={`Play from ${SOURCE_NAME[p] || p}`} style={{ ...badge, ...mutedPill(p, 30), borderRadius: 99, cursor: 'pointer' }}>
                  {SOURCE_NAME[p] || p}{tracks.length > 1 && n > 0 ? <span style={{ fontFamily: d.monoFf, fontWeight: 500, opacity: 0.8, marginLeft: 5, letterSpacing: 0 }}>{n}/{tracks.length}</span> : null}
                </button>
              ))}
              <a href={discogsHref} target="_blank" rel="noopener noreferrer" title={discogsExact ? 'Open release on Discogs' : 'Search Discogs'} style={{ ...badge, borderRadius: 99, background: 'color-mix(in srgb, var(--lv-pri) 10%, transparent)', color: 'var(--lv-sec)' }}>◈ discogs</a>
              {buyHref && <a href={buyHref} target="_blank" rel="noopener noreferrer" style={{ ...badge, borderRadius: 99, background: 'color-mix(in srgb, var(--lv-pri) 10%, transparent)', color: 'var(--lv-sec)' }}>buy ↗</a>}
            </div>
            <div style={{ fontFamily: d.artistFf, fontWeight: d.artistWeight, fontSize: d.artistSize, lineHeight: d.artistLh, letterSpacing: `${d.artistLs}em`, color: 'var(--lv-pri)', wordBreak: 'break-word' }}>
              {artist && !isVariousArtist(artist) ? <DrawerLink kind="artists" name={artist} quiet>{artist}</DrawerLink> : (artist || post.title)}
            </div>
            <div style={{ fontFamily: d.artistFf, fontStyle: 'italic', fontSize: d.titleSize, lineHeight: d.titleLh, letterSpacing: `${d.titleLs}em`, color: 'var(--lv-sec)', wordBreak: 'break-word' }}>{post.title}</div>
            <div style={{ fontFamily: d.monoFf, fontSize: d.metalineSize, lineHeight: d.metalineLh, letterSpacing: `${d.metalineLs}em`, textTransform: 'uppercase', color: 'var(--lv-sec)', marginTop: d.metalineMt }}>
              {label && <DrawerLink kind="labels" name={label}>{label}</DrawerLink>}
              {label && (catNo || post.year) ? ' · ' : ''}
              {[catNo, post.year].filter(Boolean).join(' · ')}
            </div>
            {post.genres?.length > 0 && (
              <div ref={genreBox} style={{ display: 'flex', flexWrap: 'wrap', gap: d.pillGap, marginTop: 12 }}>
                {post.genres.map(g => (
                  <button key={g} data-g="" onClick={() => openD3?.('genres', { filter: g })}
                    style={{ fontSize: d.pillSize, background: 'color-mix(in srgb, var(--lv-pri) 10%, transparent)', color: 'var(--lv-sec)', padding: `${d.pillPy}px ${d.pillPx}px`, borderRadius: 99, fontFamily: d.bodyFf, border: 'none', cursor: 'pointer' }}>{g}</button>
                ))}
                <span data-more="" style={{ display: 'none', fontSize: d.pillSize, background: 'transparent', color: 'var(--lv-ter)', padding: `${d.pillPy}px ${d.pillPx}px`, borderRadius: 99, fontFamily: d.bodyFf, border: '1px solid var(--lv-line)' }} />
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <HeartButton post={post} text={on => on ? '♥ In your feed' : '♡ Add to feed'} style={{ fontFamily: BLOCK_CP, fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', padding: '8px 16px', borderRadius: 999, border: '1.5px solid currentColor', background: 'none', color: 'inherit', cursor: 'pointer' }} onStyle={{ background: 'var(--theme-accent)', borderColor: 'var(--theme-accent)', color: '#fff' }} />
            </div>
          </div>
          <span aria-label={`Post ${num}`} style={{ position: 'absolute', right: ph ? 20 : 26, bottom: ph ? 24 : 32, width: 56, height: 56, borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: d.monoFf, fontWeight: 600, fontSize: num.length > 3 ? 13 : 16, background: 'var(--lv-pri)', color: W.hero[1] }}>{num}</span>
        </Blk>

        <div style={ph ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 } : { flex: '1 1 0', minHeight: 180, display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 8 }}>
          {/* tracks: fills its space; only the list scrolls, and only if it has to */}
          <Blk bg={W.tracks} cut="bl" className="lnv-still" style={{ ...colFill, padding: '18px 22px 30px' }}>
            <h4 style={lab}><span>Tracks</span><span style={labSmall}>{tracks.length}{runtime ? ` · ${runtime}` : ''}{highlighted ? ` · ${highlighted} ★` : ''}</span></h4>
            <div data-inner-scroll="" style={scrollBody}>
              <div style={{ display: 'grid', gap: 3 }}>
                {tracks.map((t, i) => {
                  const u = urlOf(t), on = !!activeUrl && u === activeUrl, h = hlOf(t), mine = !!me && h.by.includes(me), v = shelfTrack(t, comp)
                  return (
                    <div key={t.id || i}>
                      <div className={`lnv-tr${on ? ' on' : ''}`} onClick={e => { if (u) { setActiveUrl(on ? null : u); ripple(e) } }} title={u ? undefined : 'No link for this track yet'}
                        style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto auto auto 26px', gap: 8, alignItems: 'center', padding: on ? '9px 12px' : '6px 10px', borderRadius: 99, cursor: u ? 'pointer' : 'default', opacity: u ? 1 : 0.55,
                          background: on ? 'var(--theme-accent)' : mine ? 'color-mix(in srgb, var(--theme-accent) 35%, transparent)' : 'color-mix(in srgb, currentColor 8%, transparent)', color: on ? '#fff' : 'inherit' }}>
                        <b style={{ fontFamily: d.monoFf, fontWeight: 600, fontSize: 10, opacity: 0.7 }}>{on ? <span className="lnv-eq"><i /><i /><i /></span> : (t.position || i + 1)}</b>
                        <span style={{ fontFamily: BLOCK_CP, fontWeight: 500, fontSize: 13, lineHeight: 1.2, minWidth: 0, overflowWrap: 'anywhere' }}>
                          {v.title}
                          {(v.artists.length > 0 || v.remixers.length > 0) && <span style={{ opacity: 0.8 }}> – {[...v.artists, ...v.remixers].map((n, k) => <span key={n}>{k > 0 && ', '}{artistLink(n)}</span>)}</span>}
                        </span>
                        <em style={{ fontFamily: d.monoFf, fontSize: 11, fontStyle: 'normal', opacity: 0.7 }}>{t.duration || ''}</em>
                        <span style={{ display: 'inline-flex', gap: 3 }}>{dotsOf(t).map(p => <i key={p} title={SOURCE_NAME[p] || p} style={{ width: 8, height: 8, borderRadius: '50%', background: shelfColor(p), outline: '1.5px solid color-mix(in srgb, currentColor 40%, transparent)' }} />)}</span>
                        <span className="lnv-off" style={{ display: 'grid', placeItems: 'center' }}>{u ? <button onClick={e => { e.stopPropagation(); setWheel({ kind: 'add', at: { x: e.clientX, y: e.clientY }, tracks: [trackFrom(post, t)], title: v.title }) }} title="Add to one of your playlists" aria-label={`Add ${t.title} to a playlist`} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontFamily: d.monoFf, fontSize: 15, lineHeight: 1 }}>+</button> : null}</span>
                        {star(t, h, mine)}
                      </div>
                      {on && <PreviewPrompt post={post} track={t} linkKey={linkKeyList[i]} activeUrl={activeUrl} indent={34} />}
                    </div>
                  )
                })}
              </div>
            </div>
          </Blk>
          <div style={ph ? { display: 'grid', gap: 8 } : { display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 8, minHeight: 0 }}>
            {/* plays from: a click on a source floods the block with that source's colour */}
            <Blk bg={W.plays} cut="tr" style={{ padding: '18px 22px 20px' }}>
              {wash && <div aria-hidden="true" key={wash.p} style={{ position: 'absolute', inset: 0, background: shelfColor(wash.p), animation: 'lnvWash .7s cubic-bezier(.3,.8,.2,1) forwards', '--wx': `${wash.x}px`, '--wy': `${wash.y}px` }} />}
              <style>{'@keyframes lnvWash{from{clip-path:circle(0 at var(--wx) var(--wy))}to{clip-path:circle(160% at var(--wx) var(--wy))}}'}</style>
              <div style={{ position: 'relative', ...(washInk || {}), color: 'var(--lv-pri)' }}>
                <h4 style={lab}><span>Plays from</span><span style={labSmall}>{locations.length} source{locations.length === 1 ? '' : 's'}</span></h4>
                {locations.map(({ p, n }) => {
                  const on = nowP === p
                  return (
                    <button key={p} className="lnv-pr" onClick={e => sourceClick(e, p)} aria-pressed={on} title={`Play from ${SOURCE_NAME[p] || p}`}
                      style={{ width: 'calc(100% + 12px)', margin: '0 0 4px -6px', display: 'grid', gridTemplateColumns: '100px minmax(0, 1fr) 36px', gap: 10, alignItems: 'center', padding: '3px 6px', border: 'none', borderRadius: 99, cursor: 'pointer', textAlign: 'left', color: 'inherit', fontFamily: d.bodyFf, fontWeight: 600, fontSize: 12, background: on ? 'color-mix(in srgb, currentColor 14%, transparent)' : 'none' }}>
                      <span>{on ? '▶ ' : ''}{SOURCE_NAME[p] || p}</span>
                      <span className="lnv-bar" style={{ height: 9, borderRadius: 99, background: 'color-mix(in srgb, currentColor 18%, transparent)', overflow: 'hidden', '--w': `${tracks.length ? Math.max(6, (n / tracks.length) * 100) : 100}%` }}><i /></span>
                      <em style={{ fontFamily: d.monoFf, fontSize: 11, fontStyle: 'normal', textAlign: 'right', opacity: 0.85 }}>{tracks.length > 1 ? `${n}/${tracks.length}` : ''}</em>
                    </button>
                  )
                })}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <a href={discogsHref} target="_blank" rel="noopener noreferrer" style={pillBtn}>Discogs ↗</a>
                  <a href={buyHref || `https://www.discogs.com/search/?${new URLSearchParams({ q: [artist, post.title].filter(Boolean).join(' '), type: 'release' })}`} target="_blank" rel="noopener noreferrer" style={pillBtn}>Buy ↗</a>
                </div>
              </div>
            </Blk>
            {/* details + the playlist wheel */}
            <Blk bg={W.details} style={{ ...colFill, padding: '18px 22px 18px' }}>
              <h4 style={lab}><span>Details</span><span style={labSmall}>{catNo}</span></h4>
              <div data-inner-scroll="" style={scrollBody}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
                  <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                    {label && <div><dt style={dtStyle}>Label</dt><dd style={ddStyle}><DrawerLink kind="labels" name={label}>{label}</DrawerLink></dd></div>}
                    {post.year && <div><dt style={dtStyle}>Year</dt><dd style={ddStyle}>{post.year}</dd></div>}
                    <div><dt style={dtStyle}>Kept by</dt><dd style={ddStyle}><button onClick={() => openD3?.('postlist', { kind: 'people', people: keptBy, title: 'Kept by', post: [artist, post.title].filter(Boolean).join(' – ') })} title="See who kept this" style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>{keptBy.length}</button></dd></div>
                    <div><dt style={dtStyle}>In playlists</dt><dd style={ddStyle}>{(post.playlists || []).length}</dd></div>
                  </dl>
                  <PlaylistMiniWheel post={post} onOpen={at => setWheel({ kind: 'others', at })} />
                </div>
                {(post.playlists || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                    {post.playlists.slice(0, 4).map(pl => <button key={pl.id} onClick={() => openPlaylistFeed({ token: pl.token, id: pl.id, name: pl.name })} title={`${pl.name} · by ${pl.owner}`} style={{ ...pillBtn, fontWeight: 500, fontSize: 11.5 }}>♫ {pl.name}</button>)}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {dAcct?.linked && [['collection', inColl, 'collection', 'in your collection'], ['wantlist', inWant, 'wantlist', 'on your wantlist']].map(([k, on, add, yes]) => (
                    on ? <span key={k} style={{ ...pillBtn, cursor: 'default', opacity: 0.8 }}>✓ {yes}</span>
                      : discogsExact ? <a key={k} href={discogsExact} target="_blank" rel="noopener noreferrer" title="Opens the release on Discogs, where you add it to your list" style={pillBtn}>+ {add} ↗</a> : null
                  ))}
                  <FollowedTag post={post} />
                </div>
                {contributors.length > 0 && (
                  <div style={{ marginTop: 10, fontFamily: d.bodyFf, fontSize: 13, lineHeight: 1.5 }}>
                    <span style={dtStyle}>Artists </span>{contributors.slice(0, 9).map((n, k) => <span key={n}>{k > 0 && ' · '}{artistLink(n)}</span>)}{contributors.length > 9 && <span style={{ opacity: 0.6 }}> +{contributors.length - 9} more</span>}
                  </div>
                )}
              </div>
            </Blk>
          </div>
        </div>

        {/* the post: no scrolling, no reply strip: the text, then who / reply / when */}
        <Blk bg={W.post} cut="tl" style={ph ? { padding: '16px 18px 18px' } : { ...colFill, flex: '0 1 auto', padding: '16px 24px 18px' }}>
          <h4 style={{ ...lab, marginBottom: 8 }}><span>The post</span><span style={labSmall}>{commentCount} repl{commentCount === 1 ? 'y' : 'ies'}</span></h4>
          <div style={{ minHeight: 0, overflow: 'hidden' }}>
            {quoteText && <p title={quoteText} style={{ margin: 0, fontFamily: d.bodyFf, fontStyle: 'italic', fontSize: 20, lineHeight: 1.22, letterSpacing: '-0.01em', whiteSpace: 'pre-line', overflowWrap: 'anywhere', ...clamp(3) }}>{quoteText}</p>}
            {showDesc && <p title={note} style={{ margin: quoteText ? '8px 0 0' : 0, fontFamily: d.bodyFf, fontSize: 14, lineHeight: 1.45, color: 'var(--lv-sec)', whiteSpace: 'pre-line', overflowWrap: 'anywhere', ...clamp(3) }}>{note}</p>}
            {!quoteText && !showDesc && <p style={{ margin: 0, fontFamily: d.bodyFf, fontSize: 14, color: 'var(--lv-ter)' }}>No post text.</p>}
          </div>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, rowGap: 8, flexWrap: ph ? 'wrap' : 'nowrap', marginTop: 10, fontFamily: d.monoFf, fontSize: 12 }}>
            {posterName && <UserChip name={posterName} d={d} />}
            <MainNumber post={post} style={{ fontFamily: d.monoFf, fontSize: 12, color: 'var(--lv-ter)' }} />
            {privateWaiting > 0 && <button onClick={e => { setNotesReply(true, { x: e.clientX, y: e.clientY }); qcPriv.invalidateQueries({ queryKey: ['private-count', post.id] }) }} title="Private replies, only you can see them" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: d.bodyFf, fontSize: 12, color: 'var(--theme-accent)' }}>🔒 {privateWaiting}</button>}
            <button className="lnv-pb" onClick={e => setNotesReply(v => !v, { x: e.clientX, y: e.clientY })} aria-expanded={notesReply}
              style={{ marginLeft: 'auto', fontFamily: BLOCK_CP, fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', border: 'none', borderRadius: 999, padding: '10px 18px', background: 'var(--lv-pri)', color: W.post[1], cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              ↩ Reply{commentCount > 0 && <span style={{ fontFamily: d.monoFf, fontWeight: 500, fontSize: 11 }}>{commentCount}</span>}
            </button>
            <span title={stampOf(post.created_at)} style={{ color: 'var(--lv-sec)', whiteSpace: 'nowrap' }}>{stampOf(post.created_at)}</span>
            {canModify && <>
              <button onClick={() => onEdit?.(post)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--lv-sec)' }}>edit</button>
              <button onClick={deletePost} disabled={deleting} style={{ background: 'none', border: 'none', padding: 0, cursor: deleting ? 'default' : 'pointer', font: 'inherit', color: 'var(--lv-ter)', opacity: deleting ? 0.5 : 1 }}>{deleting ? 'deleting…' : 'delete'}</button>
            </>}
          </div>
        </Blk>

        {notesReply && createPortal(<NoteReplies fun sheet={ph} post={post} posterName={posterName} size={Math.max(replySizeBlocks, 340)} d={d} cardBg="var(--theme-sidebar)" onClose={() => setNotesReply(false)} onCount={setCommentCount} />, document.body)}
        {wheel?.kind === 'add' && <PlaylistWheelPop post={post} tracks={wheel.tracks} title={wheel.title} at={wheel.at} onClose={() => setWheel(null)} />}
        {wheel?.kind === 'others' && <OthersWheelPop post={post} at={wheel.at} onClose={() => setWheel(null)} />}
      </div>
    )
  }

  if (NOTES_CARDS) {
    const L = noteLabel(d), NM = noteName(d), MT = noteMeta(d), NP = notePill(d)
    const TN = { ...NM, fontSize: 12 }, TM = { ...MT, fontSize: 10 } // the tracklist's own, smaller type
    const runtime = noteRuntime(tracks)
    const sides = noteSides(tracks)
    const picked = t => { const h = hlOf(t); return (!!me && h.by.includes(me)) || (!!ownerName && h.by.includes(ownerName)) }
    const nPicked = tracks.filter(picked).length
    const playIdx = i => { const u = urlOf(tracks[i]); if (u) setActiveUrl(activeUrl === u ? null : u) }
    const nowP = srcPref || platformOf(activeUrl || firstUrl)
    const keptBy = [posterName, ...(post.alsoPostedBy || [])].filter(Boolean)
    const replySize = Math.round(d.artSize * 0.75)
    const discogsPill = (key, on, add, yes) => on
      ? <span key={key} style={{ ...NP, cursor: 'default', borderColor: 'var(--lv-sec)', color: 'var(--lv-pri)' }}>✓ {yes}</span>
      : discogsExact ? <a key={key} className="lnv-np" href={discogsExact} target="_blank" rel="noopener noreferrer" title="Opens the release on Discogs, where you add it to your list" style={NP}>{add} ↗</a> : null
    const star = (t, h, mine, big) => (
      <button onClick={e => { e.stopPropagation(); toggleHighlight(t) }} className={mine ? undefined : 'lnv-off'} aria-pressed={mine}
        aria-label={me ? `${mine ? 'Remove your highlight from' : 'Highlight'} ${t.title}` : 'Sign in to highlight tracks'}
        title={h.n ? `Highlighted by ${h.by.join(', ')}${h.n > h.by.length ? ` +${h.n - h.by.length}` : ''}` : (me ? 'Highlight this track' : 'Sign in to highlight tracks')}
        style={{ width: big ? 30 : 28, height: big ? 30 : 28, border: 'none', background: 'none', padding: 0, cursor: me ? 'pointer' : 'default', fontSize: 14, color: mine ? 'var(--theme-accent)' : 'var(--lv-pri)' }}>{mine ? '★' : '☆'}</button>
    )
    return (
      <div ref={el => { cardEl.current = el; registerPostRef?.(post.id, el) }}
        style={{ position: 'relative', flexShrink: 0, width: d.cardW, height: '100%', background: cardBg, padding: `${NOTES_PAD_TOP}px 0 ${NOTES_PAD_BOTTOM}px`, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'background 0.8s', color: 'var(--lv-pri)', boxSizing: 'border-box' }}>
        <style>{NOTE_CSS}</style>
        <div ref={hdrR} style={{ position: 'relative', flexShrink: 0, margin: `0 ${d.bandPadX}px ${NOTES_GAP}px`, borderRadius: 34, background: 'color-mix(in srgb, var(--theme-showcase) 14%, transparent)', padding: '18px 26px 16px' }}>
            <div style={{ flexShrink: 0, fontFamily: d.artistFf, fontWeight: d.artistWeight, fontSize: d.artistSize, lineHeight: d.artistLh, letterSpacing: `${d.artistLs}em`, color: 'var(--lv-pri)', wordBreak: 'break-word' }}>
              {artist && !isVariousArtist(artist) ? <DrawerLink kind="artists" name={artist} quiet>{artist}</DrawerLink> : (artist || post.title)}
            </div>
            <div style={{ flexShrink: 0, fontFamily: d.artistFf, fontStyle: 'italic', fontSize: d.titleSize, lineHeight: d.titleLh, letterSpacing: `${d.titleLs}em`, color: 'var(--lv-sec)', wordBreak: 'break-word' }}>{post.title}</div>
            <div style={{ flexShrink: 0, fontFamily: d.monoFf, fontSize: d.metalineSize, lineHeight: d.metalineLh, letterSpacing: `${d.metalineLs}em`, textTransform: 'uppercase', color: 'var(--lv-sec)', marginTop: d.metalineMt }}>
              {label && <DrawerLink kind="labels" name={label}>{label}</DrawerLink>}
              {label && (catNo || post.year) ? ' · ' : ''}
              {[catNo, post.year].filter(Boolean).join(' · ')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 12, flexShrink: 0 }}>
              <span style={{ ...badge, background: 'var(--theme-showcase)', color: '#fff' }}>{kind}</span>
              {locations.map(({ p, n }) => (
                <button key={p} onClick={() => playFrom(p)} title={`Play from ${SOURCE_NAME[p] || p}`}
                  style={{ ...badge, ...(PAIRED_CARDS ? mutedPill(p, 24) : { border: 'none', background: shelfColor(p), color: p === 'beatport' ? '#000' : '#fff' }), cursor: 'pointer' }}>
                  {SOURCE_NAME[p] || p}{tracks.length > 1 && n > 0 ? <span style={{ fontFamily: d.monoFf, fontWeight: 500, opacity: 0.8, marginLeft: 5, letterSpacing: 0 }}>{n}/{tracks.length}</span> : null}
                </button>
              ))}
              <a href={discogsHref} target="_blank" rel="noopener noreferrer" title={discogsExact ? 'Open release on Discogs' : 'Search Discogs'} style={{ ...badge, border: '1px solid var(--lv-line)', color: 'var(--lv-sec)' }}>◈ discogs</a>
              {buyHref && <a href={buyHref} target="_blank" rel="noopener noreferrer" style={{ ...badge, border: '1px solid var(--lv-line)', color: 'var(--lv-sec)' }}>buy ↗</a>}
            </div>
            <span style={{ position: 'absolute', right: 16, bottom: 14, width: 46, height: 46, borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: d.monoFf, fontWeight: 500, fontSize: 13, background: cardBg, color: 'var(--lv-pri)' }}>{num}</span>
            {post.genres?.length > 0 && (
              <div ref={genreBox} style={{ display: 'flex', flexWrap: 'wrap', gap: d.pillGap, marginTop: 12, flexShrink: 0 }}>
                {post.genres.map(g => (
                  <button key={g} data-g="" onClick={() => openD3?.('genres', { filter: g })}
                    style={{ fontSize: d.pillSize, background: 'var(--theme-dark3)', color: 'var(--lv-sec)', padding: `${d.pillPy}px ${d.pillPx}px`, borderRadius: d.pillRadius, fontFamily: d.bodyFf, border: 'none', cursor: 'pointer' }}>{g}</button>
                ))}
                <span data-more="" style={{ display: 'none', fontSize: d.pillSize, background: 'transparent', color: 'var(--lv-ter)', padding: `${d.pillPy}px ${d.pillPx}px`, borderRadius: d.pillRadius, fontFamily: d.bodyFf, border: '1px solid var(--lv-line)' }} />
              </div>
            )}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `${d.artSize}px minmax(0, 1fr)`, gap: NOTES_GAP, padding: `0 ${d.bandPadX}px` }}>
          {/* left: the cover, Plays from, Details */}
          <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: NOTES_GAP }}>
            <div style={{ position: 'relative', width: d.artSize, height: `min(${d.artSize}px, calc(100vh - ${NOTES_PAD_TOP + NOTES_PAD_BOTTOM + 2 * FLOAT_INSET_Y + 300}px))`, flexShrink: 0, background: playingSrc ? '#000' : undefined, borderRadius: d.artRadius, overflow: 'hidden' }}>
              {playingSrc ? (
                <TrackPlayer key={playingSrc} src={playingSrc} title={post.title} autoplay onEnded={playNext} />
              ) : (
                <div onClick={() => firstUrl && setActiveUrl(firstUrl)} style={{ position: 'absolute', inset: 0, background: cover ? '#000' : 'var(--theme-dark3)', cursor: firstUrl ? 'pointer' : 'default' }}>
                  {cover && <img src={cover} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                </div>
              )}
            </div>
            {locations.length > 0 && (
              <div style={{ ...NOTE_BOX, flexShrink: 0, display: 'flex', flexWrap: 'nowrap', gap: 3, padding: 8, overflow: 'hidden' }}>
                {locations.map(({ p, n }) => {
                  const on = nowP === p, c = shelfColor(p)
                  return (
                    <button key={p} className="lnv-sp" onClick={() => playFrom(p)} aria-pressed={on} title={`Play from ${SOURCE_NAME[p] || p}`}
                      style={{ ...NP, fontSize: 8, padding: '6px 8px', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', background: on ? c : `color-mix(in srgb, ${c} 24%, transparent)`, borderColor: on ? c : `color-mix(in srgb, ${c} 45%, transparent)`, color: on ? inkOnHex(c) : 'var(--lv-pri)' }}>
                      {on ? '▶ ' : ''}{SOURCE_NAME[p] || p}{tracks.length > 1 && n > 0 && <span style={{ fontFamily: d.monoFf, fontWeight: 400, fontSize: 7, letterSpacing: 0, opacity: 0.8, marginLeft: 4 }}>{n}/{tracks.length}</span>}
                    </button>
                  )
                })}
              </div>
            )}
            <div data-inner-scroll="" style={{ ...NOTE_BOX, flex: '0 1 auto', minHeight: 0, overflowY: 'auto', padding: '8px 6px 6px', ...INNER_SCROLL_STYLE }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 10px 4px' }}>
                <span style={L}>Playlists</span><span style={L}>{(post.playlists || []).length}</span>
              </div>
              {(post.playlists || []).map(pl => (
                <button key={pl.id} className="lnv-nr" onClick={() => openPlaylistFeed({ token: pl.token, id: pl.id, name: pl.name })} title={`Open ${pl.name}`}
                  style={{ width: '100%', display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr) auto', alignItems: 'baseline', gap: '0 6px', padding: '3px 10px', border: 'none', borderRadius: 10, background: 'none', color: 'var(--lv-pri)', textAlign: 'left', cursor: 'pointer' }}>
                  <NoteDash /><span style={NM}>{pl.name}</span><span style={MT}>{pl.owner}</span>
                </button>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 0' }}>
                <HeartButton post={post} text={on => on ? '✓ in your feed' : '+ add to feed'} style={{ ...NP }} onStyle={{ background: 'var(--theme-accent)', borderColor: 'var(--theme-accent)', color: '#fff' }} />
                <AddToPlaylistButton post={post} label="+ add" align="left" style={{ ...NP, cursor: 'pointer' }} />
              </div>
              <div style={{ margin: '5px 10px 0', paddingTop: 5, borderTop: `1px solid ${NOTE_HAIR}`, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={L}>Kept by</span><span style={L}>{keptBy.length}</span>
              </div>
              <button className="lnv-nr" onClick={() => openD3?.('postlist', { kind: 'people', people: keptBy, title: 'Kept by', post: [artist, post.title].filter(Boolean).join(' – ') })} title="See who kept this"
                style={{ width: '100%', display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr) auto', alignItems: 'baseline', gap: '0 6px', padding: '3px 10px', border: 'none', borderRadius: 10, background: 'none', color: 'var(--lv-pri)', textAlign: 'left', cursor: 'pointer' }}>
                <NoteDash /><span style={{ ...NM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{keptBy.slice(0, 3).join(', ')}</span><span style={MT}>{keptBy.length > 3 ? `+${keptBy.length - 3}` : ''}</span>
              </button>
              {contributors.length > 0 && <>
                <div style={{ margin: '5px 10px 0', paddingTop: 5, borderTop: `1px solid ${NOTE_HAIR}`, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={L}>Artists</span><span style={L}>{contributors.length}</span>
                </div>
                <div style={{ padding: '3px 10px', fontFamily: d.bodyFf, fontSize: 14, lineHeight: 1.5, color: 'var(--lv-sec)' }}>
                  {contributors.slice(0, 12).map((n, k) => <span key={n}>{k > 0 && ' · '}{artistLink(n)}</span>)}{contributors.length > 12 && <span style={{ color: 'var(--lv-ter)' }}> +{contributors.length - 12} more</span>}
                </div>
              </>}
              <div style={{ margin: '5px 10px 0', paddingTop: 5, borderTop: `1px solid ${NOTE_HAIR}` }}><span style={L}>Discogs</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 10px 2px' }}>
                {discogsPill('c', !!dAcct?.linked && inColl, '+ collection', 'in your collection')}
                {discogsPill('w', !!dAcct?.linked && inWant, '+ wantlist', 'on your wantlist')}
                <a className="lnv-np" href={buyHref || `https://www.discogs.com/search/?${new URLSearchParams({ q: [artist, post.title].filter(Boolean).join(' '), type: 'release' })}`} target="_blank" rel="noopener noreferrer" style={NP}>buy ↗</a>
              </div>
            </div>
          </div>
          {/* right: Tracks (highlights on top, then the whole record), then the post */}
          <div style={{ position: 'relative', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: NOTES_GAP }}>
            <div style={{ ...NOTE_BOX, flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', padding: '14px 10px 10px' }}>
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 10px' }}>
                <span style={L}>{tracks.length} track{tracks.length === 1 ? '' : 's'}{runtime ? ` · ${runtime}` : ''}</span>
              </div>
              <div data-inner-scroll="" style={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto', marginTop: 4, ...INNER_SCROLL_STYLE }}>
                {/* highlights: every track is here, folded away unless the poster or you picked it, so adding and removing one animates */}
                <NoteFold open={nPicked > 0} shift={0}>
                  <div style={{ paddingTop: 6 }}>
                    <div style={{ display: 'flex', gap: 8, margin: '0 10px 6px', ...L }}><span>Highlights</span><span>{nPicked}</span></div>
                    {tracks.map((t, i) => {
                      const h = hlOf(t), mine = !!me && h.by.includes(me), own = !!ownerName && h.by.includes(ownerName)
                      const u = urlOf(t), on = !!activeUrl && u === activeUrl
                      const who = [own && ownerName !== me ? ownerName : null, mine ? 'you' : null].filter(Boolean).join(' + ')
                      return (
                        <NoteFold key={t.id || i} open={own || mine}>
                          <div style={{ paddingBottom: 6 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr) auto 30px', gap: 10, alignItems: 'center', padding: '7px 4px 7px 7px', borderRadius: 18, background: `color-mix(in srgb, var(--theme-accent) ${on ? 30 : 16}%, transparent)` }}>
                              <button onClick={() => playIdx(i)} disabled={!u} aria-label={`${on ? 'Stop' : 'Play'} ${t.title}`}
                                style={{ width: 38, height: 38, borderRadius: '50%', border: on ? 'none' : `1px solid ${NOTE_HAIR2}`, background: on ? 'var(--lv-pri)' : 'none', color: on ? cardBg : 'var(--lv-pri)', fontSize: 12, cursor: u ? 'pointer' : 'default', opacity: u ? 1 : 0.4 }}>{on ? '❚❚' : '▶'}</button>
                              <button onClick={() => playIdx(i)} style={{ minWidth: 0, border: 'none', background: 'none', padding: 0, textAlign: 'left', color: 'var(--lv-pri)', cursor: u ? 'pointer' : 'default' }}>
                                <span style={{ display: 'block', fontFamily: d.monoFf, fontSize: 10, color: 'var(--lv-sec)' }}>{[t.position, t.duration, who].filter(Boolean).join(' · ')}</span>
                                <span style={{ display: 'block', ...TN, lineHeight: 1.15 }}>{shelfTrack(t, comp).title}</span>
                              </button>
                              <span style={{ fontFamily: d.monoFf, fontSize: 11, color: 'var(--lv-sec)' }}>★{h.n}</span>
                              {star(t, h, mine, true)}
                            </div>
                          </div>
                        </NoteFold>
                      )
                    })}
                    <div style={{ margin: '4px 10px 0', borderTop: `1px solid ${NOTE_HAIR}` }} />
                  </div>
                </NoteFold>
                {/* the whole record, in order, under one big letter per side */}
                {sides.map(g => (
                  <div key={g.key + (g.items[0]?.i ?? 0)} style={{ display: 'grid', gridTemplateColumns: g.key ? '26px minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 2, alignItems: 'start', padding: g.key ? '6px 0 6px 10px' : '6px 0 6px 2px' }}>
                    {g.key && <span aria-label={`Side ${g.key}`} style={{ fontFamily: d.bodyFf, fontWeight: 900, fontSize: g.key.length > 1 ? 13 : 18, lineHeight: '26px', color: 'var(--lv-ter)' }}>{g.key}</span>}
                    <div>
                      {g.items.map(({ t, i }) => {
                        const u = urlOf(t), on = !!activeUrl && u === activeUrl
                        const h = hlOf(t), mine = !!me && h.by.includes(me)
                        const v = shelfTrack(t, comp)
                        return (
                          <div key={t.id || i}>
                            <div className="lnv-nr" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto 18px 24px 28px', gap: 6, alignItems: 'center', minHeight: 26, padding: '0 2px 0 8px', borderRadius: 10, background: on ? 'color-mix(in srgb, var(--lv-pri) 8%, transparent)' : undefined }}>
                              <button onClick={() => playIdx(i)} title={u ? undefined : 'No link for this track yet'}
                                style={{ display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr)', alignItems: 'baseline', border: 'none', background: 'none', padding: '6px 0', textAlign: 'left', cursor: u ? 'pointer' : 'default', ...TN, color: on ? 'var(--theme-accent)' : 'var(--lv-pri)', opacity: u ? 1 : 0.55 }}>
                                <NoteDash />
                                <span style={{ overflowWrap: 'anywhere' }}>{v.title}{(v.artists.length > 0 || v.remixers.length > 0) && <span style={{ fontWeight: 400, color: 'var(--lv-sec)' }}> – {[...v.artists, ...v.remixers].map((n, k) => <span key={n}>{k > 0 && ', '}{artistLink(n)}</span>)}</span>}</span>
                              </button>
                              <span style={TM}>{t.duration || ''}</span>
                              <span style={{ fontFamily: d.monoFf, fontSize: 10, color: 'var(--lv-sec)', textAlign: 'right' }}>{h.n || ''}</span>
                              <span className="lnv-off" style={{ display: 'grid', placeItems: 'center' }}>{u ? <AddToPlaylistButton tracks={[trackFrom(post, t)]} label="+" align="right" style={{ fontFamily: d.monoFf, fontSize: 15, color: 'var(--lv-pri)' }} /> : null}</span>
                              {star(t, h, mine, false)}
                            </div>
                            {on && <PreviewPrompt post={post} track={t} linkKey={linkKeyList[i]} activeUrl={activeUrl} indent={g.key ? 8 : 20} />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...NOTE_BOX, flexShrink: 0, padding: '16px 20px 14px', maxHeight: '45%', display: 'flex', flexDirection: 'column' }}>
              <div data-inner-scroll="" style={{ minHeight: 0, overflowY: 'auto', ...INNER_SCROLL_STYLE }}>
                {quoteText && <p style={{ margin: 0, fontFamily: d.bodyFf, fontStyle: 'italic', fontSize: 22, lineHeight: 1.22, letterSpacing: '-0.01em', color: 'var(--lv-pri)', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{quoteText}</p>}
                {showDesc && <p style={{ margin: quoteText ? '8px 0 0' : 0, fontFamily: d.bodyFf, fontSize: 14, lineHeight: 1.45, color: 'var(--lv-sec)', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{note}</p>}
                {!quoteText && !showDesc && <p style={{ margin: 0, fontFamily: d.bodyFf, fontSize: 14, color: 'var(--lv-ter)' }}>No post text.</p>}
              </div>
              <div style={{ flexShrink: 0, marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                {posterName && <span style={{ fontFamily: d.bodyFf, fontSize: 13, color: 'var(--lv-sec)' }}>— <b style={{ fontWeight: 700, color: 'var(--lv-sec)' }}>{posterName}</b></span>}
                <button className="lnv-np" onClick={e => setNotesReply(v => !v, { x: e.clientX, y: e.clientY })} aria-expanded={notesReply}
                  style={{ ...NP, fontSize: 13, padding: '11px 19px', marginLeft: 'auto', ...(notesReply ? { background: 'var(--lv-pri)', borderColor: 'var(--lv-pri)', color: cardBg } : null) }}>
                  reply{commentCount > 0 && <span style={{ fontFamily: d.monoFf, fontWeight: 400, fontSize: 11, letterSpacing: 0, marginLeft: 6 }}>{commentCount}</span>}
                </button>
              </div>
            </div>
            {notesReply && createPortal(<NoteReplies post={post} posterName={posterName} size={replySize} d={d} cardBg={cardBg} onClose={() => setNotesReply(false)} onCount={setCommentCount} />, document.body)}
          </div>
        </div>
        {/* one pill across the foot: who posted it, main number, time, edit / delete */}
        <div style={{ flexShrink: 0, margin: `${NOTES_GAP}px ${d.bandPadX}px 0`, height: 44, padding: '0 20px 0 5px', border: `1px solid ${NOTE_HAIR}`, borderRadius: 99, display: 'flex', alignItems: 'center', gap: 14, fontFamily: d.monoFf, fontSize: 12.5 }}>
          {posterName && <UserChip name={posterName} d={d} />}
          <FollowedTag post={post} />
          <MainNumber post={post} style={{ fontFamily: d.monoFf, fontSize: 12.5, color: 'var(--lv-ter)' }} />
          {privateWaiting > 0 && <button onClick={() => { setNotesReply(true); qcPriv.invalidateQueries({ queryKey: ['private-count', post.id] }) }} title="Private replies, only you can see them" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: d.bodyFf, fontSize: 12, color: 'var(--theme-accent)' }}>🔒 {privateWaiting}</button>}
          <span title={stampOf(post.created_at)} style={{ marginLeft: 'auto', color: 'var(--lv-sec)', whiteSpace: 'nowrap' }}>{stampOf(post.created_at)}</span>
          {canModify && <>
            <button onClick={() => onEdit?.(post)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--lv-sec)' }}>edit</button>
            <button onClick={deletePost} disabled={deleting} style={{ background: 'none', border: 'none', padding: 0, cursor: deleting ? 'default' : 'pointer', font: 'inherit', color: 'var(--lv-ter)', opacity: deleting ? 0.5 : 1 }}>{deleting ? 'deleting…' : 'delete'}</button>
          </>}
        </div>
      </div>
    )
  }

  if (PAIRED_CARDS) {
    const cap = { fontFamily: d.monoFf, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--lv-ter)' }
    const chip = { display: 'inline-block', margin: '0 5px 5px 0', fontFamily: d.bodyFf, fontWeight: 500, fontSize: 12, padding: '4px 11px', borderRadius: 99, border: '1px solid var(--lv-sec)', background: 'none', color: 'var(--lv-pri)', cursor: 'pointer' }
    const dt = { ...cap, paddingTop: 3 }
    const nPlaylists = (post.playlists || []).length
    const plBtn = e => { const r = cardEl.current.getBoundingClientRect(); setPlPop({ x: Math.min(Math.max(e.clientX - r.left - 150, 16), r.width - 316), bottom: r.bottom - e.clientY + 14 }) }
    return (
      <div ref={el => { cardEl.current = el; registerPostRef?.(post.id, el) }}
        style={{ position: 'relative', flexShrink: 0, width: d.cardW, height: '100%', background: cardBg, padding: `${PAIRED_PAD_Y}px 0`, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'background 0.8s', color: 'var(--lv-pri)', boxSizing: 'border-box' }}>
        <style>{'@keyframes lnvShelfIn { from { transform: translateX(100%) } }'}</style>
        {/* the header box (gabriel, 12 Oct; from mockup24): the artist, the title, the release line, the location pills and the genres in a soft box of their own */}
        <div ref={hdrR} style={{ flexShrink: 0, margin: `0 ${d.bandPadX}px 12px`, borderRadius: 34, background: 'color-mix(in srgb, var(--theme-showcase) 14%, transparent)', padding: '18px 26px 16px' }}>
            <div style={{ flexShrink: 0, fontFamily: d.artistFf, fontWeight: d.artistWeight, fontSize: d.artistSize, lineHeight: d.artistLh, letterSpacing: `${d.artistLs}em`, color: 'var(--lv-pri)', wordBreak: 'break-word' }}>
              {artist && !isVariousArtist(artist) ? <DrawerLink kind="artists" name={artist} quiet>{artist}</DrawerLink> : (artist || post.title)}
            </div>
            <div style={{ flexShrink: 0, fontFamily: d.artistFf, fontStyle: 'italic', fontSize: d.titleSize, lineHeight: d.titleLh, letterSpacing: `${d.titleLs}em`, color: 'var(--lv-sec)', wordBreak: 'break-word' }}>{post.title}</div>
            <div style={{ flexShrink: 0, fontFamily: d.monoFf, fontSize: d.metalineSize, lineHeight: d.metalineLh, letterSpacing: `${d.metalineLs}em`, textTransform: 'uppercase', color: 'var(--lv-sec)', marginTop: d.metalineMt }}>
              {label && <DrawerLink kind="labels" name={label}>{label}</DrawerLink>}
              {label && (catNo || post.year) ? ' · ' : ''}
              {[catNo, post.year].filter(Boolean).join(' · ')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 12, flexShrink: 0 }}>
              <span style={{ ...badge, background: 'var(--theme-showcase)', color: '#fff' }}>{kind}</span>
              {locations.map(({ p, n }) => (
                <button key={p} onClick={() => playFrom(p)} title={`Play from ${SOURCE_NAME[p] || p}`}
                  style={{ ...badge, ...(PAIRED_CARDS ? mutedPill(p, 24) : { border: 'none', background: shelfColor(p), color: p === 'beatport' ? '#000' : '#fff' }), cursor: 'pointer' }}>
                  {SOURCE_NAME[p] || p}{tracks.length > 1 && n > 0 ? <span style={{ fontFamily: d.monoFf, fontWeight: 500, opacity: 0.8, marginLeft: 5, letterSpacing: 0 }}>{n}/{tracks.length}</span> : null}
                </button>
              ))}
              <a href={discogsHref} target="_blank" rel="noopener noreferrer" title={discogsExact ? 'Open release on Discogs' : 'Search Discogs'} style={{ ...badge, border: '1px solid var(--lv-line)', color: 'var(--lv-sec)' }}>◈ discogs</a>
              {buyHref && <a href={buyHref} target="_blank" rel="noopener noreferrer" style={{ ...badge, border: '1px solid var(--lv-line)', color: 'var(--lv-sec)' }}>buy ↗</a>}
            </div>
            {post.genres?.length > 0 && (
              <div ref={genreBox} style={{ display: 'flex', flexWrap: 'wrap', gap: d.pillGap, marginTop: 12, flexShrink: 0 }}>
                {post.genres.map(g => (
                  <button key={g} data-g="" onClick={() => openD3?.('genres', { filter: g })}
                    style={{ fontSize: d.pillSize, background: 'var(--theme-dark3)', color: 'var(--lv-sec)', padding: `${d.pillPy}px ${d.pillPx}px`, borderRadius: d.pillRadius, fontFamily: d.bodyFf, border: 'none', cursor: 'pointer' }}>{g}</button>
                ))}
                <span data-more="" style={{ display: 'none', fontSize: d.pillSize, background: 'transparent', color: 'var(--lv-ter)', padding: `${d.pillPy}px ${d.pillPx}px`, borderRadius: d.pillRadius, fontFamily: d.bodyFf, border: '1px solid var(--lv-line)' }} />
              </div>
            )}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `${d.artSize}px minmax(0, 1fr)`, gap: COL_GAP, padding: `0 ${d.bandPadX}px` }}>
          {/* left: the cover, then Plays from / The post */}
          <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ position: 'relative', width: d.artSize, height: `min(${d.artSize}px, calc(100vh - ${2 * (PAIRED_PAD_Y + FLOAT_INSET_Y) + 300}px))`, flexShrink: 0, background: playingSrc ? '#000' : undefined, borderRadius: d.artRadius, overflow: 'hidden' }}>
              {playingSrc ? (
                <TrackPlayer key={playingSrc} src={playingSrc} title={post.title} autoplay onEnded={playNext} />
              ) : (
                <div onClick={() => firstUrl && setActiveUrl(firstUrl)} style={{ position: 'absolute', inset: 0, background: cover ? '#000' : 'var(--theme-dark3)', cursor: firstUrl ? 'pointer' : 'default' }}>
                  {cover && <img src={cover} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  <span style={{ position: 'absolute', left: 10, top: 10, fontFamily: d.monoFf, fontWeight: 500, fontSize: 11, letterSpacing: '0.08em', padding: '6px 9px', borderRadius: 99, background: 'var(--lv-pri)', color: cardBg }}>#{num}</span>
                </div>
              )}
            </div>
            <PairBox d={d} name="Plays from" sub={`${locations.length} place${locations.length === 1 ? '' : 's'}`} open={pairL === 's'} onOpen={() => setPairL('s')}>
              <div style={{ ...cap, margin: '2px 0 8px' }}>Play this release from</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {locations.map(({ p, n }) => {
                  const on = srcPref === p || (!srcPref && platformOf(firstUrl) === p)
                  return (
                    <button key={p} onClick={() => playFrom(p)} title={`Play from ${SOURCE_NAME[p] || p}${on ? ' (your choice)' : ''}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99, cursor: 'pointer', fontFamily: d.bodyFf, fontWeight: 500, fontSize: 11, ...mutedPill(p, on ? 42 : 20) }}>
                      {on ? '▶ ' : ''}{SOURCE_NAME[p] || p}
                      {tracks.length > 1 && n > 0 && <small style={{ fontFamily: d.monoFf, fontWeight: 500, fontSize: 10, opacity: 0.85 }}>{n}/{tracks.length}</small>}
                    </button>
                  )
                })}
              </div>
            </PairBox>
            <PairBox d={d} name="The post" sub={`${commentCount} repl${commentCount === 1 ? 'y' : 'ies'}`} open={pairL === 'p'} onOpen={() => setPairL('p')}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 6px', fontFamily: d.bodyFf, fontWeight: 500, fontSize: 13 }}>
                <span>{posterName}</span><span style={{ fontFamily: d.monoFf, fontWeight: 600, fontSize: 11, color: 'var(--lv-ter)' }}>{stampOf(post.created_at)}</span>
              </div>
              {quoteText && <p style={{ margin: '2px 0 0', fontFamily: d.bodyFf, fontStyle: 'italic', fontSize: 19, lineHeight: 1.3, color: 'var(--lv-pri)', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{quoteText}</p>}
              {showDesc && <p style={{ margin: quoteText ? '8px 0 0' : '2px 0 0', fontFamily: d.bodyFf, fontSize: 14, lineHeight: 1.45, color: 'var(--lv-sec)', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{note}</p>}
              {!quoteText && !showDesc && <p style={{ margin: '2px 0 0', fontFamily: d.bodyFf, fontSize: 14, color: 'var(--lv-ter)' }}>No post text.</p>}
              <CardReplies fill={false} size={14} posterName={posterName} post={post} count={commentCount} onCount={setCommentCount} onOpen={() => setCommentsOpen(true)} d={d} />
            </PairBox>
          </div>
          {/* right: artist / title, then Tracks / Details */}
          <div ref={colR} style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <PairBox d={d} name="Tracks" sub={`${tracks.length}${highlighted ? ` · ${highlighted} ★` : ''}`} open={tracksOpen} onOpen={() => setPairR('t')} bodyRef={trkBody}>
              {tracks.map(row)}
            </PairBox>
            <PairBox d={d} name="Details" sub="lists · discogs · buy" open={detailsOpen} onOpen={() => setPairR('d')} bodyRef={detBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '2px 0 10px' }}>
                {[['In playlists', nPlaylists, { kind: 'playlists', lists: post.playlists || [] }], ['Kept by', 1 + (post.alsoPostedBy || []).length, { kind: 'people', people: [posterName, ...(post.alsoPostedBy || [])].filter(Boolean) }]].map(([k, n, props]) => (
                  <button key={k} onClick={() => openD3?.('postlist', { ...props, title: k, post: [artist, post.title].filter(Boolean).join(' – ') })} title={`See ${k === 'Kept by' ? 'who kept this' : 'the playlists it is in'}`}
                    style={{ border: '1px solid color-mix(in srgb, var(--lv-pri) 30%, transparent)', borderRadius: 16, padding: '8px 12px', fontFamily: d.bodyFf, fontWeight: 500, fontSize: 15, background: 'none', color: 'var(--lv-pri)', textAlign: 'left', cursor: 'pointer' }}>
                    <small style={{ ...cap, display: 'block', marginBottom: 2, fontSize: 9, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{k}</small>{n} <span style={{ float: 'right', color: 'var(--lv-ter)' }}>→</span>
                  </button>
                ))}
              </div>
              {/* the actions as pills, flush left under the tiles (no row labels) */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '0 0 12px' }}>
                {dAcct?.linked && [['collection', inColl, 'add to Discogs collection', 'In your Discogs collection', '＋'], ['wantlist', inWant, 'add to Discogs wantlist', 'On your Discogs wantlist', '♡']].map(([k, on, add, yes, ic]) => (
                  on ? <span key={k} style={{ ...chip, margin: 0, fontSize: 13, cursor: 'default', background: 'color-mix(in srgb, var(--lv-pri) 10%, transparent)' }}>✓ {yes}</span>
                    : discogsExact ? <a key={k} href={discogsExact} target="_blank" rel="noopener noreferrer" title="Opens the release on Discogs, where you add it to your list" style={{ ...chip, margin: 0, fontSize: 13, textDecoration: 'none' }}>{ic} {add} ↗</a> : null
                ))}
                {(() => {
                  const href = buyHref || `https://www.discogs.com/search/?${new URLSearchParams({ q: [artist, post.title].filter(Boolean).join(' '), type: 'release' })}`
                  const where = buyHref && platformOfUrl(post.stream_url) === 'bandcamp' && !post.discogs_id ? 'Bandcamp' : 'Discogs'
                  return <a href={href} target="_blank" rel="noopener noreferrer" style={{ ...chip, margin: 0, fontSize: 13, textDecoration: 'none' }}>Buy on {where} ↗</a>
                })()}
                <AddToPlaylistButton post={post} style={{ ...chip, margin: 0, fontSize: 13 }} />
                <HeartButton post={post} style={{ ...chip, margin: 0, fontSize: 13 }} />
                <FollowedTag post={post} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: '8px 12px', alignItems: 'start', fontFamily: d.bodyFf, fontWeight: 400, fontSize: 14, color: 'var(--lv-pri)' }}>
                {contributors.length > 0 && <><span style={dt}>Artists</span><span style={{ fontWeight: 500, fontSize: 13, lineHeight: 1.5 }}>{contributors.slice(0, 9).map((n, k) => <span key={n}>{k > 0 && ' · '}{artistLink(n)}</span>)}{contributors.length > 9 && <span style={{ color: 'var(--lv-ter)' }}> +{contributors.length - 9} more</span>}</span></>}
                {nPlaylists > 0 && <><span style={dt}>Playlists</span><span>{post.playlists.map(pl => <button key={pl.id} onClick={plBtn} title={`${pl.name} · by ${pl.owner}`} style={chip}>♫ {pl.name}</button>)}</span></>}
                {(post.alsoPostedBy || []).length > 0 && <><span style={dt}>Also by</span><span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{post.alsoPostedBy.slice(0, 4).map(n => <UserChip key={n} name={n} d={d} />)}{post.alsoPostedBy.length > 4 && <span style={{ fontFamily: d.monoFf, fontSize: 11, color: 'var(--lv-ter)' }}>+{post.alsoPostedBy.length - 4}</span>}</span></>}
              </div>
            </PairBox>
          </div>
        </div>
        {/* one pill across the foot: who posted it, main number, time, edit / delete */}
        <div style={{ flexShrink: 0, margin: `${SHELF_PAD_Y / 2}px ${d.bandPadX}px 0`, height: 44, padding: '0 20px 0 5px', border: `1px solid ${CARD_LINE}`, borderRadius: 99, display: 'flex', alignItems: 'center', gap: 14, fontFamily: d.monoFf, fontSize: 12 }}>
          {posterName && <UserChip name={posterName} d={d} />}
          <MainNumber post={post} style={{ fontFamily: d.monoFf, fontSize: d.stampSize, color: 'var(--lv-ter)' }} />
          {privateWaiting > 0 && <button onClick={() => { setCommentsOpen(true); qcPriv.invalidateQueries({ queryKey: ['private-count', post.id] }) }} title="Private replies, only you can see them" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: d.bodyFf, fontSize: 12, color: 'var(--theme-accent)' }}>🔒 {privateWaiting} private</button>}
          <span title={stampOf(post.created_at)} style={{ marginLeft: 'auto', color: 'var(--lv-sec)', whiteSpace: 'nowrap' }}>{stampOf(post.created_at)}</span>
          {canModify && <>
            <button onClick={() => onEdit?.(post)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--lv-ter)' }}>edit</button>
            <button onClick={deletePost} disabled={deleting} style={{ background: 'none', border: 'none', padding: 0, cursor: deleting ? 'default' : 'pointer', font: 'inherit', color: 'var(--theme-accent)', opacity: deleting ? 0.5 : 1 }}>{deleting ? 'deleting…' : 'delete'}</button>
          </>}
        </div>
        {plPop && <PlaylistsPop lists={post.playlists || []} at={plPop} cardBg={cardBg} d={d} onClose={() => setPlPop(null)} />}
        {commentsOpen && (
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 360, zIndex: 20, background: cardBg, borderLeft: '1px solid var(--lv-line)', boxShadow: '-18px 0 40px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', animation: 'lnvShelfIn 0.28s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '26px 24px 6px 26px', flexShrink: 0 }}>
              <h3 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: d.bodyFf, fontWeight: 900, fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.02em', color: 'var(--lv-pri)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artist || post.title}</h3>
              <span style={{ fontFamily: d.monoFf, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--lv-ter)', whiteSpace: 'nowrap' }}>{commentCount} repl{commentCount === 1 ? 'y' : 'ies'}</span>
              <button onClick={() => setCommentsOpen(false)} aria-label="Close replies" style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--lv-line)', background: 'color-mix(in srgb, var(--lv-pri) 7%, transparent)', color: 'var(--lv-sec)', cursor: 'pointer', fontSize: 16, flexShrink: 0, alignSelf: 'center' }}>×</button>
            </div>
            <div data-inner-scroll="" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 24px 14px 26px', ...INNER_SCROLL_STYLE }}>
              {note && <div style={{ fontFamily: d.bodyFf, fontStyle: 'italic', fontWeight: 300, fontSize: 18, lineHeight: 1.4, color: 'var(--lv-pri)', paddingLeft: 12, borderLeft: '3px solid var(--theme-accent)', whiteSpace: 'pre-line', overflowWrap: 'anywhere', margin: '10px 0' }}>{note}</div>}
              <CommentThread postId={post.id} onCountChange={setCommentCount} d={d} maxH={9999} inputSize={13} drawer ownerName={posterName} />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={el => { cardEl.current = el; registerPostRef?.(post.id, el) }}
      style={{ position: 'relative', flexShrink: 0, width: comp ? d.cardW + SHELF_COMP_EXTRA : d.cardW, height: '100%', background: cardBg, padding: `${SHELF_PAD_Y}px ${d.bandPadX}px`, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'background 0.8s', color: 'var(--lv-pri)' }}>
      <style>{'@keyframes lnvShelfIn { from { transform: translateX(100%) } }'}</style>

      {/* top: sleeve (the player takes its place) | pills, artist, title, label, genres */}
      <div style={{ display: 'grid', gridTemplateColumns: `${d.artSize}px minmax(0, 1fr)`, gap: COL_GAP, height: stageH, flexShrink: 0 }}>
        <div style={{ position: 'relative', height: '100%', aspectRatio: '1 / 1', flexShrink: 0, background: playingSrc ? '#000' : undefined, borderRadius: d.artRadius, overflow: 'hidden' }}>
          {playingSrc ? (
            <TrackPlayer key={playingSrc} src={playingSrc} title={post.title} autoplay onEnded={playNext} />
          ) : (
            <div onClick={() => firstUrl && setActiveUrl(firstUrl)} style={{ position: 'absolute', inset: 0, background: cover ? '#000' : 'var(--theme-dark3)', cursor: firstUrl ? 'pointer' : 'default' }}>
              {cover && <img src={cover} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14, flexShrink: 0 }}>
            <span style={{ ...badge, background: 'var(--theme-showcase)', color: '#fff' }}>{kind}</span>
            {locations.map(({ p, n }) => (
              <button key={p} onClick={() => playFrom(p)} title={`Play from ${SOURCE_NAME[p] || p}`}
                style={{ ...badge, border: 'none', cursor: 'pointer', background: shelfColor(p), color: p === 'beatport' ? '#000' : '#fff' }}>
                {SOURCE_NAME[p] || p}{tracks.length > 1 && n > 0 ? <span style={{ fontFamily: d.monoFf, fontWeight: 500, opacity: 0.8, marginLeft: 5, letterSpacing: 0 }}>{n}/{tracks.length}</span> : null}
              </button>
            ))}
            <a href={discogsHref} target="_blank" rel="noopener noreferrer" title={discogsExact ? 'Open release on Discogs' : 'Search Discogs'} style={{ ...badge, border: '1px solid var(--lv-line)', color: 'var(--lv-sec)' }}>◈ discogs</a>
            {buyHref && <a href={buyHref} target="_blank" rel="noopener noreferrer" style={{ ...badge, border: '1px solid var(--lv-line)', color: 'var(--lv-sec)' }}>buy ↗</a>}
          </div>
          <div style={{ flexShrink: 0, fontFamily: d.artistFf, fontWeight: d.artistWeight, fontSize: d.artistSize, lineHeight: d.artistLh, letterSpacing: `${d.artistLs}em`, color: 'var(--lv-pri)', wordBreak: 'break-word' }}>
            {artist && !isVariousArtist(artist) ? <DrawerLink kind="artists" name={artist} quiet>{artist}</DrawerLink> : (artist || post.title)}
          </div>
          <div style={{ flexShrink: 0, fontFamily: d.artistFf, fontStyle: 'italic', fontSize: d.titleSize, lineHeight: d.titleLh, letterSpacing: `${d.titleLs}em`, color: 'var(--lv-sec)', wordBreak: 'break-word' }}>{post.title}</div>
          <div style={{ flexShrink: 0, fontFamily: d.monoFf, fontSize: d.metalineSize, lineHeight: d.metalineLh, letterSpacing: `${d.metalineLs}em`, textTransform: 'uppercase', color: 'var(--lv-sec)', marginTop: d.metalineMt }}>
            {label && <DrawerLink kind="labels" name={label}>{label}</DrawerLink>}
            {label && (catNo || post.year) ? ' · ' : ''}
            {[catNo, post.year].filter(Boolean).join(' · ')}
          </div>
          {post.genres?.length > 0 && (
            <div ref={genreBox} style={{ display: 'flex', flexWrap: 'wrap', gap: d.pillGap, marginTop: 12, flexShrink: 0 }}>
              {post.genres.map(g => (
                <button key={g} data-g="" onClick={() => openD3?.('genres', { filter: g })}
                  style={{ fontSize: d.pillSize, background: 'var(--theme-dark3)', color: 'var(--lv-sec)', padding: `${d.pillPy}px ${d.pillPx}px`, borderRadius: d.pillRadius, fontFamily: d.bodyFf, border: 'none', cursor: 'pointer' }}>{g}</button>
              ))}
              <span data-more="" style={{ display: 'none', fontSize: d.pillSize, background: 'transparent', color: 'var(--lv-ter)', padding: `${d.pillPy}px ${d.pillPx}px`, borderRadius: d.pillRadius, fontFamily: d.bodyFf, border: '1px solid var(--lv-line)' }} />
            </div>
          )}
          {contributors.length > 0 && (
            <div style={{ marginTop: 12, minHeight: 0, overflow: 'hidden', fontFamily: d.bodyFf, fontSize: 12, lineHeight: 1.6, color: 'var(--lv-sec)' }}>
              <div style={{ fontFamily: d.monoFf, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--lv-ter)', marginBottom: 4 }}>{contributors.length} artists</div>
              {contributors.slice(0, 9).map((n, k) => <span key={n}>{k > 0 && ' · '}{artistLink(n)}</span>)}
              {contributors.length > 9 && <span style={{ color: 'var(--lv-ter)' }}> +{contributors.length - 9} more</span>}
            </div>
          )}
          {/* the big post number, as on the old cards, in the column's spare room (gabriel, 2026-10-08) */}
          <div ref={numBox} aria-hidden="true" style={{ pointerEvents: 'none', flex: '1 1 0', minHeight: 0, marginTop: 8 }}>
            {numSize >= 56 && <div style={{ whiteSpace: 'nowrap', fontFamily: d.numeralFf, fontWeight: d.numeralWeight, fontSize: numSize, lineHeight: d.numeralLh, letterSpacing: `${d.numeralLs}em`, opacity: d.numeralOpacity, color: 'var(--lv-pri)' }}>{num}</div>}
            <div style={{ height: 1, background: 'var(--lv-line)', marginTop: numSize >= 56 ? NUM_LINE_GAP : 0 }} />
          </div>
        </div>
      </div>

      {/* tracklist: always there, scrolls inside its own space */}
      <div style={{ flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexShrink: 0, fontFamily: d.monoFf, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--lv-ter)', marginBottom: 4 }}>
          <span>Tracklist{me ? ' · tap ☆ to highlight' : ''}</span><span>{tracks.length} track{tracks.length === 1 ? '' : 's'}{highlighted ? <> · {highlighted} highlighted <span style={{ color: MINE_HL, marginLeft: 6 }}>● you</span>{ownerName && ownerName !== me && <span style={{ color: OWNER_HL, marginLeft: 6 }}>● {ownerName}</span>}</> : ''}</span>
        </div>
        <div ref={listRef} data-inner-scroll={listFit.overflows ? '' : undefined} onScroll={listFit.onScroll}
          style={{ flex: '0 1 auto', minHeight: 0, overflowY: listFit.overflows ? 'auto' : 'hidden', display: 'grid', gridTemplateColumns: tracks.length > 3 ? '1fr 1fr' : '1fr', columnGap: COL_GAP, alignContent: 'start', ...INNER_SCROLL_STYLE, ...fadeMask(listFit) }}>
          {tracks.map(row)}
        </div>
      </div>

      {/* the poster's own words: the description takes all the room left under the tracklist and
          scrolls only once it has filled it (the tracklist gives way before this block drops below ~two lines) */}
      {quoteText && (
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', marginTop: 22, marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexShrink: 0, fontFamily: d.bodyFf, fontWeight: 600, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--lv-ter)', marginBottom: 8 }}>
            <span>The post</span><span style={{ fontFamily: d.monoFf, fontWeight: 400, letterSpacing: '0.06em' }}>{posterName}{post.created_at ? ` · ${stampOf(post.created_at)}` : ''}</span>
          </div>
          <p style={{ margin: 0, paddingLeft: 16, borderLeft: '3px solid var(--theme-accent)', fontFamily: d.bodyFf, fontStyle: 'italic', fontWeight: 400, fontSize: textSize, lineHeight: 1.3, color: 'var(--lv-pri)', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{quoteText}</p>
        </div>
      )}
      {showDesc && (
        <div style={{ flex: '1 1 0', minHeight: 60, display: 'flex', flexDirection: 'column', marginTop: quoteText ? 6 : 26, marginBottom: 6 }}>
          {!quoteText && <>
            <div style={{ ...{ fontFamily: d.labelFf, fontWeight: 600, fontSize: d.postLabelSize, letterSpacing: `${d.zlabelLs}em`, textTransform: 'uppercase', color: 'var(--lv-ter)' } }}>The post</div>
            <div aria-hidden="true" style={{ height: 1, background: 'var(--lv-line)', margin: '9px 0 8px' }} />
          </>}
          <p ref={descRef} data-inner-scroll={descFit.overflows ? '' : undefined} onScroll={descFit.onScroll}
            style={{ fontSize: d.descSize, lineHeight: 1.4, fontFamily: d.bodyFf, color: 'var(--lv-sec)', margin: 0, flex: '1 1 0', minHeight: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-line', overflowY: descFit.overflows ? 'auto' : 'hidden', ...INNER_SCROLL_STYLE, ...fadeMask(descFit) }}>{note}</p>
        </div>
      )}

      {/* replies under the post */}
      <CardReplies fill={!showDesc} size={textSize} posterName={posterName} post={post} count={commentCount} onCount={setCommentCount} onOpen={() => setCommentsOpen(true)} d={d} />

      {/* footer: actions, then who posted it / who else / which public playlists */}
      <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', gap: 10, alignItems: 'baseline', flexShrink: 0 }}>
        <button onClick={() => setCommentsOpen(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: d.bodyFf, fontSize: d.metarowSize, color: 'var(--lv-ter)' }}>
          <span style={{ color: 'var(--theme-accent)', fontWeight: 700 }}>{commentCount}</span>&nbsp;replies
        </button>
        {privateWaiting > 0 && <button onClick={() => { setCommentsOpen(true); qcPriv.invalidateQueries({ queryKey: ['private-count', post.id] }) }} title="Private replies, only you can see them" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: d.bodyFf, fontSize: d.metarowSize, color: 'var(--theme-accent)' }}>🔒 {privateWaiting} private</button>}
        <AddToPlaylistButton post={post} style={{ fontFamily: d.bodyFf, fontSize: d.metarowSize, color: 'var(--lv-ter)' }} />
        <HeartButton post={post} style={{ fontFamily: d.bodyFf, fontSize: d.metarowSize, color: 'var(--lv-ter)' }} />
        <FollowedTag post={post} />
        {canModify && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontFamily: d.monoFf, fontSize: d.stampSize, letterSpacing: `${d.stampLs}em` }}>
            <button onClick={() => onEdit?.(post)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', letterSpacing: 'inherit', color: 'var(--lv-ter)' }}>edit</button>
            <button onClick={deletePost} disabled={deleting} style={{ background: 'none', border: 'none', padding: 0, cursor: deleting ? 'default' : 'pointer', font: 'inherit', letterSpacing: 'inherit', color: 'var(--theme-accent)', opacity: deleting ? 0.5 : 1 }}>{deleting ? 'deleting…' : 'delete'}</button>
          </span>
        )}
      </div>
      <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--lv-line)', display: 'grid', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: d.bodyFf, fontSize: 12, color: 'var(--lv-ter)' }}>
          {posterName && <UserChip name={posterName} d={d} />}
          <MainNumber post={post} style={{ fontFamily: d.monoFf, fontSize: d.stampSize, color: 'var(--lv-ter)' }} />
          <span title={stampOf(post.created_at)} style={{ marginLeft: 'auto', fontFamily: d.monoFf, fontSize: d.stampSize, letterSpacing: `${d.stampLs}em`, color: 'var(--lv-ter)' }}>
            {stampOf(post.created_at)}
          </span>
        </div>
        {((post.alsoPostedBy || []).length > 0 || (post.playlists || []).length > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {(post.alsoPostedBy || []).length > 0 && <>
              <span style={{ fontFamily: d.bodyFf, fontWeight: 600, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--lv-ter)' }}>Also posted by</span>
              {post.alsoPostedBy.slice(0, 3).map(n => <UserChip key={n} name={n} d={d} />)}
              {post.alsoPostedBy.length > 3 && <span style={{ fontFamily: d.monoFf, fontSize: 11, color: 'var(--lv-ter)' }}>+{post.alsoPostedBy.length - 3}</span>}
            </>}
            {(post.playlists || []).length > 0 && <>
              <span style={{ fontFamily: d.bodyFf, fontWeight: 600, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--lv-ter)', marginLeft: (post.alsoPostedBy || []).length ? 10 : 0 }}>In playlists</span>
              {post.playlists.slice(0, 2).map(pl => (
                <button key={pl.id} onClick={e => { const r = cardEl.current.getBoundingClientRect(); setPlPop({ x: Math.min(Math.max(e.clientX - r.left - 150, 16), r.width - 316), bottom: r.bottom - e.clientY + 14 }) }} title={`${pl.name} · by ${pl.owner}`}
                  style={{ flexShrink: 0, border: '1px solid var(--lv-line)', background: 'none', borderRadius: 99, padding: '2px 10px', cursor: 'pointer', fontFamily: d.bodyFf, fontWeight: 600, fontSize: 12, color: 'var(--lv-pri)' }}>{pl.name} <small style={{ fontFamily: d.monoFf, fontWeight: 400, fontSize: 10, color: 'var(--lv-ter)' }}>{pl.owner}</small></button>
              ))}
              {post.playlists.length > 2 && <button onClick={e => { const r = cardEl.current.getBoundingClientRect(); setPlPop({ x: Math.min(Math.max(e.clientX - r.left - 150, 16), r.width - 316), bottom: r.bottom - e.clientY + 14 }) }} style={{ flexShrink: 0, border: '1px solid var(--lv-line)', background: 'none', borderRadius: 99, padding: '2px 10px', cursor: 'pointer', fontFamily: d.monoFf, fontSize: 11, color: 'var(--lv-ter)' }}>+{post.playlists.length - 2}</button>}
            </>}
          </div>
        )}
      </div>
      {plPop && <PlaylistsPop lists={post.playlists || []} at={plPop} cardBg={cardBg} d={d} onClose={() => setPlPop(null)} />}

      {/* replies: a panel out of the card's right edge, laid out like the artist / label drawers */}
      {commentsOpen && (
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 360, zIndex: 20, background: cardBg, borderLeft: '1px solid var(--lv-line)', boxShadow: '-18px 0 40px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', animation: 'lnvShelfIn 0.28s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '26px 24px 6px 26px', flexShrink: 0 }}>
            <h3 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: d.bodyFf, fontWeight: 900, fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.02em', color: 'var(--lv-pri)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artist || post.title}</h3>
            <span style={{ fontFamily: d.monoFf, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--lv-ter)', whiteSpace: 'nowrap' }}>{commentCount} repl{commentCount === 1 ? 'y' : 'ies'}</span>
            <button onClick={() => setCommentsOpen(false)} aria-label="Close replies" style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--lv-line)', background: 'color-mix(in srgb, var(--lv-pri) 7%, transparent)', color: 'var(--lv-sec)', cursor: 'pointer', fontSize: 16, flexShrink: 0, alignSelf: 'center' }}>×</button>
          </div>
          <div data-inner-scroll="" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 24px 14px 26px', ...INNER_SCROLL_STYLE }}>
            <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 14, alignItems: 'end', margin: '6px 0 4px' }}>
              {cover ? <img src={cover} alt="" style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover' }} /> : <span />}
              <div style={{ fontFamily: d.monoFf, fontSize: 11.5, lineHeight: 1.7, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--lv-sec)' }}>
                <div>{post.title}</div>
                {(label || post.year) && <div>{[label, post.year].filter(Boolean).join(' · ')}</div>}
                <div>Posted by {posterName} · {stampOf(post.created_at)}</div>
              </div>
            </div>
            {note && <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: d.bodyFf, fontWeight: 600, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--lv-ter)', margin: '18px 0 6px' }}><span>The post</span><span>#{post.id}</span></div>
              <div style={{ fontFamily: d.bodyFf, fontStyle: 'italic', fontWeight: 300, fontSize: 18, lineHeight: 1.4, color: 'var(--lv-pri)', paddingLeft: 12, borderLeft: '3px solid var(--theme-accent)', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{note}</div>
            </>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: d.bodyFf, fontWeight: 600, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--lv-ter)', margin: '18px 0 2px' }}><span>Replies</span><span>oldest first</span></div>
            <CommentThread postId={post.id} onCountChange={setCommentCount} d={d} maxH={9999} inputSize={13} drawer ownerName={posterName} />
          </div>
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

// ── Spotlight list: type tags + role pills (gabriel, 2026-10-02, mockup E) ──
// The index used to number its rows, and an artist's MASTER entries (no
// label on Discogs' list) filled the label column with the artist's role —
// "Remix, Appearance". Rows are now grouped by year, each with a type tag
// from the Discogs format and, on artist spotlights, a role pill.

// releaseTag / roleGroup / ROLE_PILL / cleanLabelName: lib/catalogue.js

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

  // The WHOLE catalogue (2026-10-02), crawled by the backend — a label's or
  // artist's Discogs releases (getCataloguePage), a channel's YouTube
  // uploads (getChannelUploads) — 100 at a time as the list scrolls,
  // narrowed by the search box, and re-asked every 6s while the crawl is
  // still collecting.
  const [catalogueQuery, setCatalogueQuery] = useState('')
  const [catalogueFilter, setCatalogueFilter] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setCatalogueFilter(catalogueQuery.trim()), 300)
    return () => clearTimeout(t)
  }, [catalogueQuery])
  const cataloguePages = useInfiniteQuery({
    queryKey: ['spotlight-catalogue', type, catalogueKey, catalogueFilter],
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ offset: String(pageParam), limit: '100', q: catalogueFilter })
      const url = type === 'channel'
        ? `${API}/media/channel-uploads?videoUrl=${encodeURIComponent(channelVideoUrl)}&${qs}`
        : `${API}/discogs/${type}/${catalogueKey}/releases?${qs}`
      const res = await fetch(url)
      return res.ok ? res.json() : null
    },
    initialPageParam: 0,
    getNextPageParam: last => {
      if (!last) return undefined
      const next = last.pagination.offset + last.releases.length
      return next < last.pagination.matched ? next : undefined
    },
    enabled: hasCatalogue,
    staleTime: Infinity,
    refetchInterval: q => (q.state.data?.pages?.[0]?.crawl?.done === false ? 6000 : false),
  })
  const catalogueFirst = cataloguePages.data?.pages?.[0]
  const catalogueCrawl = catalogueFirst?.crawl || null
  // One `catalogue` shape for all three types from here on.
  const catalogue = cataloguePages.data === undefined
    ? undefined
    : catalogueFirst
      ? { channel: catalogueFirst.channel, releases: cataloguePages.data.pages.flatMap(p => p?.releases || []), pagination: catalogueFirst.pagination }
      : null

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
  //   cta     — "view all →" (the "+ add to feed" button moved into each open row, 2026-10-08)
  // Rows come from the catalogue when there is one, otherwise from this
  // subject's own LNV posts, so every spotlight gets the same anatomy.
  // Masters come without format/label: ask for their main release's (slow
  // background queue on the backend, like the covers — poll until done).
  const infoIds = hasCatalogue && type === 'artist'
    ? catalogueItems.filter(r => r.type === 'master' && r.mainRelease).map(r => r.mainRelease)
    : []
  const { data: releaseInfo } = useQuery({
    queryKey: ['spotlight-release-info', infoIds.join(',')],
    queryFn: async () => {
      const res = await fetch(`${API}/discogs/release-info?ids=${infoIds.join(',')}`)
      return res.ok ? res.json() : { info: {}, pending: 0 }
    },
    enabled: infoIds.length > 0,
    staleTime: Infinity,
    refetchInterval: q => (q.state.data?.pending > 0 ? 5000 : false),
  })

  // One row shape for every source. `artist` is the record's own artist when
  // it isn't the subject (a remix / guest spot / a label's release).
  const POST_TAG = { album: 'LP', single: 'Single', livemix: 'Live' }
  const rows = (hasCatalogue
    ? catalogueItems.map(r => {
        const info = r.type === 'master' ? releaseInfo?.info?.[r.mainRelease] : null
        const group = type === 'artist' ? roleGroup(r.role || '') : null
        return {
          key: rowKeyOf(r),
          kind: type === 'channel' ? 'video' : 'release',
          id: r.id,
          title: r.title || '',
          tag: type === 'channel' ? 'Video' : releaseTag(r.format || info?.format || '', r.title),
          group,
          artist: type === 'label' || (type === 'artist' && group !== 'main') ? (r.artist || '') : '',
          label: type === 'artist' ? cleanLabelName(r.label || info?.label || '') : '',
          year: r.year || '',
          thumb: r.thumb || '',
          onSite: isOnSite(r),
          versions: r.versions || 1, // pressings folded in by the duplicate comber
        }
      })
    : posts.map(p => ({
        key: `post:${p.id}`,
        kind: 'post',
        id: p.id,
        title: p.title || '',
        tag: POST_TAG[p.post_type] || 'Single',
        group: null,
        artist: type === 'label' ? artistName(p) : '',
        label: type === 'label' ? '' : labelName(p),
        year: p.year || '',
        thumb: coverSrc(p),
        onSite: true,
        post: p,
      })))
    // Newest year first; undated entries last.
    .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))
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
  const postTrackView = (p, t) => shelfTrack(t, isCompilation(p, p.tracks || []))
  const releaseRows = withoutHeadings(selectedFull?.tracklist)
  const releaseKeys = linkKeys(releaseRows)
  const openTracks = !openRow ? []
    : openRow.kind === 'post'
      ? (openRow.post.tracks || []).map(t => ({ position: t.position, artists: postTrackView(openRow.post, t).artists.map(name => ({ name })), title: postTrackView(openRow.post, t).title, duration: t.duration, url: t.stream_url || t.youtube_url || '', embed: trackEmbedSrc(t, toEmbedSrc) }))
      : openRow.kind === 'release'
        ? releaseRows.map((t, ti) => {
            const tt = normT(t.title)
            const video = tt && (selectedFull.videos || []).find(v => /youtu/.test(v.url || '') && normT(v.title).includes(tt))
            const posted = tt && (onSitePost?.tracks || []).find(pt => normT(pt.title) === tt)
            const saved = savedLinks?.links?.[releaseKeys[ti]]
            return { position: t.position, linkKey: releaseKeys[ti],
              added: saved?.by ? { by: saved.by, id: saved.submissionId } : null,
              suggestion: savedLinks?.suggestions?.[releaseKeys[ti]] || null, mine: savedLinks?.mine?.[releaseKeys[ti]] || null, title: t.title, duration: t.duration, artists: t.artists, url: video?.url || posted?.stream_url || posted?.youtube_url || saved?.url || '', knownMiss: !!saved && !saved.url }
          })
        : []

  // Returns 'played' | 'none' | 'capped' | 'busy' so playNextFrom can chain.
  async function playTrack(t, i) {
    const trackKey = `${openKey}#${i}`
    if (t.url) { setPlaying(p => (p?.key === trackKey ? null : { key: trackKey, url: t.url, embed: t.embed })); return 'played' }
    if (searching === trackKey) return 'busy'
    setSearching(trackKey)
    try {
      const artist = (t.artists || []).map(a => a.name).join(', ')
        || (type === 'artist' ? name : type === 'label' ? openRow?.artist : '') || ''
      const rel = openRow?.kind === 'release' ? selectedFull?.labels?.[0] : null
      const q = new URLSearchParams({ artist, title: t.title || '', label: type === 'label' ? name : (rel?.name || ''), catno: rel?.catno && !/^none$/i.test(rel.catno) ? rel.catno : '', listen: '1' })
      if (openRow?.kind === 'release' && trackReleaseId && t.linkKey) { q.set('release_id', trackReleaseId); q.set('position', t.linkKey) }
      const r = await fetch(`${API}/discogs/youtube/search?${q}`)
      const d = await r.json()
      // A Spotify fallback (SPOTIFY-FALLBACK) isn't the track's link — don't save it.
      if (openRow?.kind === 'release' && trackReleaseId && t.linkKey && !d.capped && !d.fallback) {
        queryClient.setQueryData(['release-track-links', trackReleaseId], old => ({ links: { ...(old?.links || {}), [t.linkKey]: { url: d.youtube_url || null, title: d.youtube_title || null } } }))
      }
      const foundUrl = d.youtube_url || d.spotify_url
      if (foundUrl) {
        setFoundUrls(m => ({ ...m, [trackKey]: foundUrl }))
        setPlaying({ key: trackKey, url: foundUrl })
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

  // Album play-through: when track i ends, play the next track that already
  // has a link. No searching ahead (2026-10-06, YouTube savings) — a track
  // with no link is only searched when someone clicks it.
  function playNextFrom(i) {
    for (let j = i + 1; j < openTracks.length; j++) {
      const found = foundUrls[`${openKey}#${j}`]
      const url = openTracks[j].url || (found && found !== 'none' && found !== 'capped' ? found : '')
      if (url) { setPlaying({ key: `${openKey}#${j}`, url }); return }
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
  // What a catalogue entry is called, and when the list gets a search box.
  const itemWord = type === 'channel' ? 'uploads' : 'releases'
  const bigCatalogue = hasCatalogue && (catalogue?.pagination?.items || 0) > 100
  // type tag · title (+ the record's artist) · role pill (artists only) · label/artist
  const hasRoles = rows.some(r => r.group)
  const COLS = hasRoles ? '54px minmax(0, 1.5fr) 84px minmax(0, 1fr)' : '54px minmax(0, 1.5fr) minmax(0, 1fr)'
  const ROW_PAD = 9
  // "2005" heading summary: "1 own · 2 remix · 3 guest" (artists), else a count.
  const yearSummary = list => {
    if (!hasRoles) return `${list.length} ${type === 'channel' ? 'upload' : 'release'}${list.length !== 1 ? 's' : ''}`
    return [['main', 'own'], ['remix', 'remix'], ['prod', 'producer'], ['guest', 'guest']]
      .map(([k, w]) => [list.filter(r => r.group === k).length, w]).filter(([n]) => n).map(([n, w]) => `${n} ${w}`).join(' · ')
  }
  const pillStyle = (group, open) => {
    const base = { justifySelf: 'start', fontFamily: T.labelFf, fontWeight: 600, fontSize: T.zlabelSize, letterSpacing: `${T.zlabelLs}em`, textTransform: 'uppercase', borderRadius: 99, padding: '2px 8px', whiteSpace: 'nowrap', border: '1px solid transparent' }
    if (group === 'main') return { ...base, background: 'var(--theme-accent)', color: '#fff' }
    const ink = open ? cardBg : group === 'guest' ? textTer : textPri
    return { ...base, color: ink, borderColor: open ? cardBg : group === 'guest' ? divider : textSec, borderStyle: group === 'prod' ? 'dashed' : 'solid' }
  }
  const rowText = { fontFamily: T.bodyFf, fontSize: T.trackSize, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const monoText = { ...rowText, fontFamily: T.monoFf, fontSize: T.tracknumSize, letterSpacing: `${T.stampLs}em`, fontVariantNumeric: 'tabular-nums' }

  return (
    <div
      ref={el => registerPostRef?.(cardKey, el)}
      style={{ flexShrink: 0, width: liveCardWidth() /* same width as live-set cards */, height: '100%', background: cardBg, display: 'flex', flexDirection: 'column', padding: `${DESIGN_BASE.padY}px ${SPOTLIGHT_PAD}px` /* same top/bottom as every card (was 65, then 32 inside a 58px gap) */, overflow: 'hidden', transition: 'background 0.8s' }}
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
        {/* ♥ to favourite (2026-10-06) */}
        {!subject.isPlaceholder && <FavHeart kind={type} name={name} size={Math.round(T.artistSize * 0.6)} style={{ marginLeft: 10, color: textSec, verticalAlign: 'middle' }} />}
      </div>
      <div style={{ flexShrink: 0, marginTop: T.metalineMt, fontFamily: T.monoFf, fontSize: T.metalineSize, lineHeight: T.metalineLh, letterSpacing: `${T.metalineLs}em`, textTransform: 'uppercase', color: textSec }}>
        {hasCatalogue
          ? (catalogue === undefined ? `${postsLine} · pulling the ${catalogueSource} catalogue…`
            : catalogueCrawl && !catalogueCrawl.done ? `${postsLine} · collecting ${itemWord}: ${catalogueCrawl.have.toLocaleString('en-GB')} of ${catalogueCrawl.total.toLocaleString('en-GB')}`
            : `${postsLine} · ${count.toLocaleString('en-GB')} on ${catalogueSource}`)
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

      {/* index — grouped by year (mockup E, 2026-10-02) */}
      {/* Catalogue search — a channel or label can run to thousands of
          entries (HÖR: 10,000+ uploads). Drawer-style pill box; filters the
          crawled titles (plus artist and catno for Discogs). */}
      {bigCatalogue && (
        <label style={{ flexShrink: 0, marginTop: 18, display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${divider}`, borderRadius: 99, padding: '6px 14px' }}>
          <span aria-hidden="true" style={{ ...monoText, color: textTer }}>⌕</span>
          <input id={`catalogue-search-${String(cardKey).replace(/[^\w-]+/g, '-')}`} value={catalogueQuery} onChange={e => setCatalogueQuery(e.target.value)}
            placeholder={`Search ${count.toLocaleString('en-GB')} ${itemWord}`} aria-label={`Search this ${type}'s ${itemWord}`}
            style={{ border: 0, outline: 0, background: 'none', flex: 1, minWidth: 0, fontFamily: T.bodyFf, fontSize: T.trackSize, color: textPri }} />
          {catalogueFilter && catalogue && (
            <span style={{ ...monoText, color: textTer, flexShrink: 0 }}>{catalogue.pagination.matched.toLocaleString('en-GB')} found</span>
          )}
        </label>
      )}
      {/* 10px of room each side so the rows' rounded hover isn't clipped.
          The next 100 entries load as the list nears the bottom. */}
      <div ref={listRef} data-inner-scroll=""
        onScroll={hasCatalogue ? e => {
          const el = e.currentTarget
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 400 && cataloguePages.hasNextPage && !cataloguePages.isFetchingNextPage) cataloguePages.fetchNextPage()
        } : undefined}
        style={{ flex: 1, minHeight: 0, margin: `${bigCatalogue ? 12 : 18}px -10px 0`, padding: '0 10px', overflowY: 'auto', overflowX: 'hidden', ...INNER_SCROLL_STYLE }}>
        {rows.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', ...msgText }}>
            {hasCatalogue && catalogue === undefined ? 'fetching catalogue…'
              : catalogueFilter ? `no ${itemWord} match “${catalogueFilter}”${catalogueCrawl && !catalogueCrawl.done ? ' yet — still collecting' : ''}`
              : `nothing found on ${catalogueSource}`}
          </div>
        )}
        {rows.map((r, idx) => {
          const open = r.key === openKey
          const newYear = idx === 0 || rows[idx - 1].year !== r.year
          const yearRows = newYear ? rows.filter(x => x.year === r.year) : null
          return (
            <div key={r.key} ref={el => { if (el) rowRefs.current.set(r.key, el); else rowRefs.current.delete(r.key) }}>
              {/* Year heading, the way the artist drawer heads its letters. */}
              {newYear && (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: idx === 0 ? '0 0 4px' : '16px 0 4px' }}>
                  <span style={{ fontFamily: T.artistFf, fontWeight: 900, fontSize: 25, letterSpacing: '-0.01em', lineHeight: 1.1, color: textTer }}>{r.year || 'Undated'}</span>
                  <span style={{ ...monoText, color: textTer, textTransform: 'uppercase' }}>{yearSummary(yearRows)}</span>
                </div>
              )}
              <div
                onClick={() => toggleRow(r.key)}
                style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: `${ROW_PAD}px 10px`, margin: newYear ? '0 -10px' : `${ROW_PAD / 3}px -10px 0`, borderRadius: 12, cursor: 'pointer', background: open ? textPri : 'transparent', color: open ? cardBg : textPri, transition: 'background 0.15s, color 0.15s' }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'color-mix(in srgb, var(--theme-text-pri) 9%, transparent)' }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
              >
                {/* Type tag from the Discogs format (LP / EP / Single / 12" / Comp / Mix / OST). */}
                <span style={{ ...monoText, fontSize: 10, textTransform: 'uppercase', textAlign: 'center', border: `1px solid ${open ? cardBg : textTer}`, borderRadius: 5, padding: '2px 0', width: 54 }}>{r.tag}</span>
                <span style={{ ...rowText, fontWeight: 700 }}>
                  {r.onSite && hasCatalogue && <span title="on LNV" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--theme-accent)', marginRight: 7, verticalAlign: 'middle' }} />}
                  {r.title}
                  {r.artist && type === 'artist' && <span style={{ fontWeight: 400, fontStyle: 'italic', color: open ? cardBg : textSec }}> · {r.artist}</span>}
                  {r.versions > 1 && <span title="Pressings of the same record, folded into one row" style={{ ...monoText, fontWeight: 400, fontSize: 10, color: open ? cardBg : textTer }}> · {r.versions} versions</span>}
                </span>
                {hasRoles && <span style={pillStyle(r.group, open)}>{ROLE_PILL[r.group]}</span>}
                <span style={{ ...rowText, color: open ? cardBg : textSec, fontStyle: type === 'label' ? 'italic' : 'normal' }}>{type === 'label' ? r.artist : r.label}</span>
              </div>

              {open && (
                <div style={{ padding: '10px 6px 14px', borderBottom: `1px solid ${divider}` }}>
                  {/* "+ add to my feed" right in the row (2026-10-08, gabriel; it replaced the footer
                      button): a release or channel upload that isn't on LNV yet goes to the composer. */}
                  {hasCatalogue && !r.onSite && (r.kind === 'release' || r.kind === 'video') && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          onCreateFromDiscogs?.(r.kind === 'video' ? `https://www.youtube.com/watch?v=${r.id}` : `https://www.discogs.com/${r.key.startsWith('master:') ? 'master' : 'release'}/${r.id}`)
                        }}
                        style={{ background: 'var(--theme-accent)', border: 'none', borderRadius: 20, padding: '5px 14px', color: '#fff', fontFamily: T.labelFf, fontWeight: T.badgeWeight, fontSize: T.metarowSize, letterSpacing: `${T.badgeLs}em`, textTransform: 'uppercase', cursor: 'pointer' }}
                      >+ add to my feed</button>
                    </div>
                  )}
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
                            style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr) 48px 16px 36px', gap: 10, alignItems: 'baseline', padding: '4px 0', borderBottom: `1px dotted ${divider}`, cursor: miss ? 'default' : 'pointer', background: isPlaying ? 'color-mix(in srgb, var(--theme-accent) 14%, transparent)' : 'transparent' }}>
                            <span style={{ ...monoText, color: textTer }}>{t.position || i + 1}</span>
                            <span style={{ ...rowText, color: isPlaying ? textPri : textSec, fontWeight: isPlaying ? 600 : 400 }}>
                              {t.title}
                              {rowArtists(t).length > 0 && (
                                <span>
                                  <span style={{ margin: '0 7px', color: textTer, fontWeight: 400 }}>–</span>
                                  {rowArtists(t).map((a, k) => (
                                    <span key={a.name + k}>{k > 0 && ', '}<DrawerLink kind="artists" name={a.name} quiet style={{ fontWeight: 700, color: textPri }}>{a.name}</DrawerLink></span>
                                  ))}
                                </span>
                              )}
                            </span>
                            <span style={{ ...monoText, color: textTer, textAlign: 'right' }}>{t.duration || ''}</span>
                            <span style={{ ...monoText, color: isPlaying ? 'var(--theme-accent)' : textTer, textAlign: 'right' }}>{state}</span>
                            {/* ♡ and + once the track has a link (2026-10-03); a track
                                still to be found on YouTube gets them after its first play. */}
                            <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                              {url && (() => {
                                const tr = { post_id: onSitePost?.id || (openRow?.kind === 'post' ? openRow.post.id : null), position: t.position || null, title: t.title, artist: (t.artists || []).map(a => a.name).join(', ') || (type === 'artist' ? name : openRow?.artist || ''), url, embed_url: t.embed || null, duration: t.duration || null, cover: openRow?.thumb || openRow?.post?.thumb_image || null }
                                return <>
                                  <AddToPlaylistButton tracks={[tr]} label="+" align="right" style={{ ...monoText, color: textTer }} />
                                </>
                              })()}
                            </span>
                          </div>
                          {/* Nothing found for this track: a listener can add a link (checked first). */}
                          {miss && t.linkKey && trackReleaseId && (
                            <AddLinkRow releaseId={trackReleaseId} linkKey={t.linkKey} title={t.title}
                              artist={(t.artists || []).map(a => a.name).join(', ') || (type === 'artist' ? name : type === 'label' ? openRow?.artist : '') || ''}
                              suggestion={t.suggestion} mine={t.mine}
                              onDone={() => { queryClient.invalidateQueries({ queryKey: ['release-track-links', trackReleaseId] }); setFoundUrls(m => { const n = { ...m }; delete n[trackKey]; return n }) }} />
                          )}
                          {url && t.added && (
                            <UserLinkNote by={t.added.by} submissionId={t.added.id}
                              onDone={() => queryClient.invalidateQueries({ queryKey: ['release-track-links', trackReleaseId] })} />
                          )}
                          {/* The player opens right under the track that was clicked. */}
                          {isPlaying && (playing.embed || toEmbedSrc(playing.url)) && (
                            <div style={{ width: '100%', aspectRatio: '16 / 9', maxHeight: 240, margin: '8px 0 10px', borderRadius: DESIGN_BASE.artRadius, overflow: 'hidden' }}>
                              <TrackPlayer key={playing.url} src={playing.embed || toEmbedSrc(playing.url)} title={t.title}
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
        {hasCatalogue && cataloguePages.hasNextPage && (
          <div style={{ padding: '14px 0', textAlign: 'center', ...msgText }}>{cataloguePages.isFetchingNextPage ? 'loading more…' : 'scroll for more'}</div>
        )}
      </div>

      {/* footer: "view all →" (the add-to-feed button now lives inside each open row) */}
      <div style={{ flexShrink: 0, marginTop: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {browsable ? (
          <span onClick={() => openD3?.(type === 'artist' ? 'artists' : 'labels', { filter: name })} style={{ fontSize: T.metarowSize, fontWeight: 600, cursor: 'pointer', color: textPri, fontFamily: T.bodyFf, borderBottom: '1px dotted currentColor' }}>view all →</span>
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
  // Labels and channels crawl their catalogue the same way (gabriel,
  // 2026-10-02): one post is enough when there's a catalogue to fill the
  // card from — a label's Discogs id (its Discogs releases) or a channel's
  // YouTube set (its channel uploads). Without one they still need
  // SPOTLIGHT_MIN_POSTS posts of their own.
  for (const [name, ps] of byLabel) {
    if (ps.length >= SPOTLIGHT_MIN_POSTS || subjectDiscogsId({ type: 'label', name, posts: ps })) pool.push({ type: 'label', name, posts: ps })
  }
  for (const [name, ps] of byChannel) {
    if (ps.length >= SPOTLIGHT_MIN_POSTS || subjectChannelVideoUrl({ type: 'channel', name, posts: ps })) pool.push({ type: 'channel', name, posts: ps })
  }
  // TEMP (2026-08-26) — see PLACEHOLDER_CHANNEL_POSTS' comment above. Only
  // when there's no real channel to show.
  if (!pool.some(s => s.type === 'channel')) pool.push({ type: 'channel', name: PLACEHOLDER_CHANNEL_NAME, posts: PLACEHOLDER_CHANNEL_POSTS, isPlaceholder: true })
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

// The shelf is built once, then only ever EXTENDED as more posts load
// (2026-10-01, feed lazy loading): cards already on the shelf keep their
// place, spotlights and colours — a new page is appended, it doesn't
// reshuffle what you've scrolled past. `prev` is the last result; pass null
// to start over (new search, or new posts arriving at the front).
// Returns { items, order, pick, count }.
function buildShelfItems(posts, prev = null) {
  // Legacy DB-persisted spotlight posts (old triggerSpotlights model) are
  // filtered out entirely — not rendered as spotlights (that path is gone)
  // and not rendered as ordinary posts either (they carry no artists/
  // labels/genres and a synthetic title, so they'd look broken as a PostCard).
  const real = posts.filter(p => !p.is_spotlight)
  const key = s => s.type + ':' + s.name
  let st
  if (!prev) st = { items: [], order: shuffled(buildSpotlightPool(real)), count: 0, since: 0, gap: 0, turn: 0, picks: {}, run: 0 }
  else {
    // Subjects that only qualify now (enough posts loaded) join the end of
    // the rotation; the ones already in it keep their order.
    const seen = new Set(prev.order.map(key))
    const fresh = shuffled(buildSpotlightPool(real).filter(s => !seen.has(key(s))))
    st = { ...prev, items: [...prev.items], order: [...prev.order, ...fresh], picks: { ...prev.picks } }
  }
  // Next spotlight subject: the type whose turn it is, else the next type
  // round that has one. The placeholder channel is a last resort only.
  function nextSubject() {
    for (let k = 0; k < SPOTLIGHT_TYPES.length; k++) {
      const type = SPOTLIGHT_TYPES[(st.turn + k) % SPOTLIGHT_TYPES.length]
      const pool = st.order.filter(s => s.type === type && !s.isPlaceholder)
      if (!pool.length) continue
      st.turn += k + 1
      const n = st.picks[type] || 0
      st.picks[type] = n + 1
      return pool[n % pool.length]
    }
    st.turn++
    return st.order.find(s => s.isPlaceholder) || null
  }
  for (const post of real.slice(st.count)) {
    const i = st.count++
    const single = !isLiveSetPost(post) && !isAlbumPost(post)
    st.run = single ? st.run + 1 : 0
    st.items.push({ key: `p-${post.id}`, kind: 'post', post, mirror: single && st.run % 2 === 0 })
    if (++st.since === SPOTLIGHT_ROUTINE[st.gap % SPOTLIGHT_ROUTINE.length]) {
      st.since = 0; st.gap++
      const subject = nextSubject()
      if (subject) {
        st.items.push({ key: `spotlight-${i}-${subject.type}-${subject.name}`, kind: 'spotlight', subject })
        st.run = 0 // a spotlight breaks a run of singles
      }
    }
  }
  return st
}

// ── Introductions (alpha, 2026-10-05) ─────────────────────────────────────────
// My feed slots in an introduction (IntroCard, Collect.jsx) at most once
// every INTRO_EVERY cards, never before the INTRO_EVERY-th, always after a
// post. The cards around it keep their order — it's added, never mixed in.
const INTRO_EVERY = 8
function withIntros(items, intros) {
  if (!intros?.length) return items
  const out = []
  let due = INTRO_EVERY, next = 0
  items.forEach((it, n) => {
    out.push(it)
    if (n + 1 >= due && next < intros.length && it.kind === 'post') {
      const intro = intros[next++]
      out.push({ key: `intro-${intro.username}`, kind: 'intro', intro })
      due = n + 1 + INTRO_EVERY
    }
  })
  return out
}
// TEMP (dev only, gabriel 2026-10-05: "throw some placeholders in the feed
// for the feel") — until real matches exist, these fill the slots. Marked
// "placeholder" on the card; nothing is sent for them. Covers come from
// the posts already loaded. Delete once there are real people to introduce.
const PLACEHOLDER_INTROS = import.meta.env.DEV ? [
  { username: 'mira', bio: 'Dub techno and the records that led to it.', post_count: 23, member_since: '2026-09-12 20:00:00',
    social: { names: ['lnv_admin'], total: 1 }, common: { names: [{ name: 'Basic Channel', posters: 3 }, { name: 'Rhythm & Sound', posters: 4 }], more: 0, records: 2 } },
  { username: 'dan', bio: 'Late-night digger. Deep house, Detroit, anything on Cocoon.', post_count: 42, member_since: '2026-08-30 20:00:00',
    social: { names: [], total: 0 }, common: { names: [{ name: 'Degustibus Music', posters: 2 }, { name: 'Fango', posters: 3 }], more: 3, records: 0 } },
  { username: 'rosa_b', bio: '', post_count: 9, member_since: '2026-10-01 20:00:00',
    social: { names: ['lnv_admin', 'treebeast'], total: 4 }, common: { names: [], more: 0, records: 0 } },
] : []

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
      // Right-hand corners rounded like the post cards (gabriel, 2026-09-30).
      borderTopRightRadius: FLOAT_RADIUS,
      borderBottomRightRadius: FLOAT_RADIUS,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      // + STRIP_RADIUS on the left: that much of the intro sits under the strip
      // (Layout.jsx), so the centred content stays where it was.
      padding: `32px 32px 32px ${32 + STRIP_RADIUS}px`,
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

// Phone layout (2026-10-05, from the handover's phone-app vision): one post
// per screen, swiped sideways like flicking through records in a crate —
// not yes / no, a swipe just moves on. Same feeds, posts, players, ♡ / +
// list, names and replies as the desktop shelf; only the presentation
// changes. Native scroll-snap does the swiping (touch momentum, and a
// trackpad or arrow keys on a narrow desktop window).
//
// Music: tapping a cover or a track opens that card's player, and only that
// card's — one player at a time. Swiping away keeps it playing; playing
// another card replaces it. Most players need a second tap inside them on
// phones (browsers only let sound start from a tap on the player itself).

const D = DESIGN_BASE
const P_MONO = D.monoFf, P_SANS = D.bodyFf
const PHONE_RADIUS = 28
const PHONE_GAP = 10

// Light or dark text for a card from its actual colour, re-checked when the
// palette changes (same rule as the desktop FloatSlot).
function useInk(ref) {
  const [ink, setInk] = useState(null)
  useLayoutEffect(() => {
    let t = null
    const pick = () => { if (ref.current) setInk(bgIsDark(ref.current) ? INK_DARK_BG : INK_LIGHT_BG) }
    pick()
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(pick, 850) })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => { mo.disconnect(); clearTimeout(t) }
  }, [ref])
  return ink
}

// The top bar (feed switcher + search) floats over the deck; cards start under it.
const PHONE_TOPBAR_H = 'calc(58px + env(safe-area-inset-top))'

// The phone's opening (2026-10-05): the desktop's landing, built the same
// way — the intro panel's colour, with the nav strip (rail) and the strip's
// second zone over it at the left, at the desktop's proportions (320 / 530
// px of 1440), rounded right edges. It sits just before the first post, the
// post riding on the panel's right edge; the strip's two colours fold away as
// the post comes across, as the desktop strip collapses over the feed.
// It moves at its own fixed pace, not under the finger: on the first post, a
// swipe back plays it in; on it, a swipe on (or a tap) plays it out. A page
// load opens on it and plays it out after a beat. `ctlRef.current.close()`
// shuts it at once (a new feed, a jump to a post).
const OPENING_HOLD_MS = 500
const OPENING_MOVE_MS = 1200
const OPENING_SWIPE_PX = 24 // how far a swipe goes before it counts
const OPENING_STRIP = [ // drawn bottom to top; `from`/`to`: the share of the way out it folds over
  { bg: 'var(--theme-channel, var(--theme-dark2))', width: 37, from: 0, to: 0.75 },
  { bg: 'var(--theme-sidebar)', width: 22, from: 0.2, to: 1 },
]
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
function PhoneOpening({ deckRef, ctlRef }) {
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const stripRefs = useRef([])
  useEffect(() => {
    const deck = deckRef.current
    const root = rootRef.current
    // o: 1 = open (on the opening), 0 = closed (on the first post).
    let o = 1, target = 1, tween = null, raf = null
    const paint = () => {
      const p = 1 - o
      if (panelRef.current) panelRef.current.style.width = `${o * 100}%`
      if (deck) deck.style.transform = o > 0 ? `translateX(${o * 100}%)` : ''
      OPENING_STRIP.forEach((l, i) => {
        const t = Math.min(1, Math.max(0, (p - l.from) / (l.to - l.from)))
        const el = stripRefs.current[i]
        if (el) el.style.width = `${l.width * (1 - easeInOut(t))}%`
      })
      if (root) root.style.visibility = o > 0 ? 'visible' : 'hidden'
    }
    const step = now => {
      if (tween.start == null) tween.start = now
      const t = Math.min(1, (now - tween.start) / tween.dur)
      o = tween.from + (tween.to - tween.from) * easeInOut(t)
      paint()
      raf = t < 1 ? requestAnimationFrame(step) : null
    }
    const moveTo = to => {
      target = to
      cancelAnimationFrame(raf)
      if (reducedMotion() || o === to) { o = to; paint(); return }
      tween = { from: o, to, start: null, dur: OPENING_MOVE_MS * Math.abs(to - o) }
      raf = requestAnimationFrame(step)
    }
    ctlRef.current = { close: () => { cancelAnimationFrame(raf); target = 0; o = 0; paint() } }

    // On the first post: a swipe back (finger right, trackpad left, ←) plays it in.
    let sx = 0, sy = 0, armed = false
    const atStart = () => target === 0 && deck.scrollLeft <= 1
    const onDeckTouchStart = e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; armed = atStart() }
    const onDeckTouchMove = e => {
      if (!armed) return
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy
      if (dx > OPENING_SWIPE_PX && dx > Math.abs(dy)) { armed = false; moveTo(1) }
    }
    const onDeckWheel = e => { if (atStart() && e.deltaX < -OPENING_SWIPE_PX) moveTo(1) }
    // On the opening: a swipe on, a tap, or → plays it out.
    const onRootTouchStart = e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; armed = true }
    const onRootTouchMove = e => {
      e.preventDefault() // the deck underneath stays put
      if (!armed) return
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy
      if (-dx > OPENING_SWIPE_PX && -dx > Math.abs(dy)) { armed = false; moveTo(0) }
    }
    const onRootClick = () => moveTo(0)
    const onRootWheel = e => { e.preventDefault(); if (e.deltaX > OPENING_SWIPE_PX || e.deltaY > OPENING_SWIPE_PX) moveTo(0) }
    const onKey = e => {
      if (e.target.closest?.('input, textarea, [contenteditable]')) return
      if (target === 1 && e.key === 'ArrowRight') { e.stopPropagation(); moveTo(0) }
      else if (atStart() && e.key === 'ArrowLeft') { e.stopPropagation(); moveTo(1) }
    }
    deck.addEventListener('touchstart', onDeckTouchStart, { passive: true })
    deck.addEventListener('touchmove', onDeckTouchMove, { passive: true })
    deck.addEventListener('wheel', onDeckWheel, { passive: true })
    root.addEventListener('touchstart', onRootTouchStart, { passive: true })
    root.addEventListener('touchmove', onRootTouchMove, { passive: false })
    root.addEventListener('click', onRootClick)
    root.addEventListener('wheel', onRootWheel, { passive: false })
    window.addEventListener('keydown', onKey, true)

    // A page load: open, then out after a beat.
    paint()
    const hold = setTimeout(() => moveTo(0), OPENING_HOLD_MS)
    return () => {
      clearTimeout(hold)
      cancelAnimationFrame(raf)
      deck.style.transform = ''
      deck.removeEventListener('touchstart', onDeckTouchStart)
      deck.removeEventListener('touchmove', onDeckTouchMove)
      deck.removeEventListener('wheel', onDeckWheel)
      root.removeEventListener('touchstart', onRootTouchStart)
      root.removeEventListener('touchmove', onRootTouchMove)
      root.removeEventListener('click', onRootClick)
      root.removeEventListener('wheel', onRootWheel)
      window.removeEventListener('keydown', onKey, true)
      ctlRef.current = null
    }
  }, [deckRef, ctlRef])
  const edge = { position: 'absolute', top: 0, left: 0, bottom: 0, borderTopRightRadius: STRIP_RADIUS, borderBottomRightRadius: STRIP_RADIUS, transition: 'background 0.8s' }
  return (
    <div ref={rootRef} aria-label="Opening — swipe or tap to start" style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'pointer' }}>
      <div ref={panelRef} style={{ ...edge, width: '100%', background: 'var(--theme-showcase)' }} />
      {OPENING_STRIP.map((l, i) => (
        <div key={i} ref={el => { stripRefs.current[i] = el }} style={{ ...edge, width: `${l.width}%`, background: l.bg }} />
      ))}
    </div>
  )
}

function Slide({ bg, children, bare = false }) {
  const ref = useRef(null)
  const ink = useInk(ref)
  return (
    <section style={{ flex: '0 0 100%', minWidth: 0, height: '100%', boxSizing: 'border-box', padding: `${PHONE_TOPBAR_H} ${PHONE_GAP}px ${PHONE_GAP}px`, scrollSnapAlign: 'center', scrollSnapStop: 'always' }}>
      <div ref={ref} data-inner-scroll=""
        style={{ height: '100%', overflowY: 'auto', overscrollBehaviorY: 'contain', borderRadius: bare ? 0 : PHONE_RADIUS, background: bg, boxShadow: bare ? 'none' : '0 10px 30px -10px rgba(0,0,0,0.3)', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', ...ink }}>
        {children}
      </div>
    </section>
  )
}

const pBadge = { fontSize: D.badgeSize, fontWeight: D.badgeWeight, letterSpacing: `${D.badgeLs}em`, textTransform: 'uppercase', padding: `${D.badgePy + 1}px ${D.badgePx}px`, borderRadius: D.badgeRadius, fontFamily: D.labelFf, textDecoration: 'none', whiteSpace: 'nowrap' }
const pZlabel = { fontFamily: D.labelFf, fontWeight: 600, fontSize: D.zlabelSize, letterSpacing: `${D.zlabelLs}em`, textTransform: 'uppercase', color: 'var(--theme-text-ter)', marginBottom: D.zlabelMb }
const pPlain = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', letterSpacing: 'inherit' }

function PhoneCard({ post, playing, onPlay, onStop, onEdit }) {
  const { canModify, deleting, deletePost } = usePostActions(post)
  const { openD3 } = useLayout() || {}
  const [trackUrl, setTrackUrl] = useState(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(post.commentCount || post.comment_count || 0)

  const live = detectType(post) === 'livemix'
  const type = detectType(post)
  const artist = artistName(post)
  const label = labelName(post)
  const catNo = post.labels?.[0]?.catalogue_number || ''
  const tracks = post.tracks || []
  const note = cleanNote(post.notes || post.body)

  // What the cover plays: the post's own player, else its first track with a
  // link (desktop's "click the art = track A").
  const firstTrackUrl = tracks.map(t => t.stream_url || t.youtube_url).find(Boolean) || null
  const startUrl = postEmbed(post) ? null : firstTrackUrl
  const canPlay = !!postEmbed(post, startUrl)
  const embed = playing ? postEmbed(post, trackUrl) : null

  function play(url) {
    // A link with no player we can embed (Spotify, Apple Music…) opens there.
    if (!postEmbed(post, url)) { const out = url || post.stream_url; if (out) window.open(out, '_blank', 'noopener'); return }
    setTrackUrl(url); onPlay()
  }
  // An album plays through: at the end of a track, the next one with a link.
  function next() {
    const urls = tracks.map(t => t.stream_url || t.youtube_url).filter(Boolean)
    const i = urls.indexOf(trackUrl)
    if (i >= 0 && i + 1 < urls.length && postEmbed(post, urls[i + 1])) setTrackUrl(urls[i + 1])
  }

  const playingUrl = (playing && trackUrl) || post.stream_url || ''
  const platform = platformOfUrl(playingUrl) || post.platform || ''
  const ytId = platform === 'youtube' ? playingUrl.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1] : null
  const platformHref = ytId ? `https://www.youtube.com/watch?v=${ytId}` : (playingUrl || null)
  const discogsExact = post.discogs_url || (post.discogs_id ? `https://www.discogs.com/release/${post.discogs_id}` : null)
  const discogsHref = discogsExact || (!live && (artist || post.title)
    ? `https://www.discogs.com/search/?${new URLSearchParams({ q: [artist, post.title].filter(Boolean).join(' '), type: 'all' })}` : null)
  const buyHref = post.discogs_id ? `https://www.discogs.com/sell/release/${post.discogs_id}`
    : (platformOfUrl(post.stream_url) === 'bandcamp' ? post.stream_url : null)
  const outline = { ...pBadge, background: 'none', border: '1px solid var(--theme-border)', color: 'var(--theme-text-sec)' }

  const media = embed && !embed.h
    ? <div style={{ width: '100%', aspectRatio: String(embed.ratio), borderRadius: 22, overflow: 'hidden', background: '#000' }}>
        <TrackPlayer key={embed.src} src={embed.src} autoplay onEnded={next} title={post.title} />
      </div>
    : <CoverArt post={post} style={{ width: '100%', aspectRatio: live ? '16 / 9' : '1', borderRadius: 22 }}>
        {(canPlay || post.stream_url) && !embed && (
          <button onClick={() => play(startUrl)} aria-label={canPlay ? `Play ${post.title}` : `Open ${post.title}`}
            style={{ ...pPlain, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', color: '#fff', fontSize: canPlay ? 24 : 20, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: canPlay ? 4 : 0 }}>{canPlay ? '▶' : '↗'}</span>
          </button>
        )}
      </CoverArt>

  return (
    <div style={{ padding: '18px 18px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <span style={{ ...pBadge, background: live ? 'var(--theme-accent)' : 'var(--theme-showcase)', color: '#fff' }}>{live ? 'LIVE SET' : type === 'single' ? 'SINGLE' : 'ALBUM'}</span>
        {platform && <a href={platformHref || undefined} target="_blank" rel="noopener noreferrer"
          style={{ ...pBadge, background: PLATFORM_COLORS[platform] || 'var(--theme-accent)', color: platform === 'beatport' ? '#000' : '#fff' }}>{platform.toUpperCase()}</a>}
        {discogsHref && <a href={discogsHref} target="_blank" rel="noopener noreferrer" style={outline}>◈ DISCOGS</a>}
        {buyHref && <a href={buyHref} target="_blank" rel="noopener noreferrer" style={outline}>BUY ↗</a>}
      </div>

      {media}
      {embed?.h && (
        <div style={{ height: embed.h, borderRadius: 14, overflow: 'hidden', marginTop: -4 }}>
          <TrackPlayer key={embed.src} src={embed.src} autoplay onEnded={next} title={post.title} />
        </div>
      )}
      {playing && <button onClick={onStop} style={{ ...pPlain, alignSelf: 'flex-start', fontFamily: P_MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--theme-text-ter)', marginTop: -6 }}>■ stop</button>}

      <div>
        <div style={{ fontFamily: D.artistFf, fontSize: 28, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', color: 'var(--theme-text-pri)', overflowWrap: 'anywhere' }}>
          {artist && !isVariousArtist(artist) ? <DrawerLink kind="artists" name={artist} quiet>{artist}</DrawerLink> : (artist || post.title)}
        </div>
        {artist && post.title && <div style={{ fontFamily: D.artistFf, fontSize: 24, fontStyle: 'italic', lineHeight: 1.08, letterSpacing: '-0.02em', color: 'var(--theme-text-sec)', overflowWrap: 'anywhere' }}>{post.title}</div>}
        {(label || post.year || catNo) && (
          <div style={{ marginTop: 10, fontFamily: P_MONO, fontSize: 11, fontWeight: 500, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--theme-text-ter)', lineHeight: 1.5 }}>
            {label && <DrawerLink kind="labels" name={label}>{label}</DrawerLink>}
            {[catNo, post.year].filter(Boolean).map((x, i) => <span key={x}>{label || i ? ' · ' : ''}{x}</span>)}
          </div>
        )}
        {live && post.channel && <div style={{ marginTop: 6, fontFamily: P_SANS, fontSize: 13, color: 'var(--theme-text-sec)' }}>
          <DrawerLink kind="live" name={post.channel}>{post.channel}</DrawerLink>{' '}
          <FavHeart kind="channel" name={post.channel} size={15} style={{ color: 'var(--theme-text-ter)' }} />
        </div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, borderBottom: '1px solid var(--theme-border)', paddingBottom: 10 }}>
        <div aria-hidden="true" style={{ fontFamily: D.numeralFf, fontWeight: 900, fontSize: 96, lineHeight: 0.78, letterSpacing: '-0.055em', opacity: D.numeralOpacity, color: 'var(--theme-text-pri)', marginLeft: -4 }}>
          {String(post.feedNumber ?? post.id).padStart(2, '0')}
        </div>
        <MainNumber post={post} style={{ fontFamily: P_MONO, fontSize: 11, color: 'var(--theme-text-ter)', marginLeft: 'auto' }} />
      </div>

      {!live && tracks.length > 0 && (
        <div>
          <div style={pZlabel}>Album listing</div>
          {tracks.map((t, i) => {
            const url = t.stream_url || t.youtube_url || null
            const on = playing && url && trackUrl === url
            return (
              <div key={i} onClick={() => { if (url) (on ? onStop() : play(url)) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '0 6px', margin: '0 -6px', borderRadius: 10, cursor: url ? 'pointer' : 'default', background: on ? 'color-mix(in srgb, var(--theme-accent) 16%, transparent)' : 'transparent' }}>
                <span style={{ fontFamily: P_MONO, fontSize: 11, minWidth: 18, color: on ? 'var(--theme-accent)' : 'var(--theme-text-ter)' }}>{url ? (on ? '▶' : '▷') : (t.position || i + 1)}</span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: P_SANS, fontSize: 15, color: on ? 'var(--theme-text-pri)' : 'var(--theme-text-sec)', fontWeight: on ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                {t.duration && <span style={{ fontFamily: P_MONO, fontSize: 11, color: 'var(--theme-text-ter)', fontVariantNumeric: 'tabular-nums' }}>{t.duration}</span>}
                {url && <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', gap: 12, alignItems: 'center', fontSize: 16 }}>
                  <AddToPlaylistButton tracks={[trackFrom(post, t)]} label="+" align="right" style={{ fontFamily: P_MONO, fontSize: 16, color: 'var(--theme-text-ter)' }} />
                </span>}
              </div>
            )
          })}
        </div>
      )}

      {post.genres?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {post.genres.slice(0, 6).map(g => (
            <button key={g} onClick={() => openD3?.('genres', { filter: g })}
              style={{ ...pPlain, fontFamily: P_SANS, fontSize: 13, background: 'var(--theme-dark3)', color: 'var(--theme-text-sec)', padding: '5px 12px', borderRadius: 99 }}>{g}</button>
          ))}
        </div>
      )}

      {(note || post.post_title) && (
        <div>
          <PostTitle post={post} labelStyle={{ ...pZlabel, fontSize: D.postLabelSize, marginBottom: D.postLabelMb }} />
          {note && <div style={{ fontFamily: P_SANS, fontSize: 15, lineHeight: 1.5, color: 'var(--theme-text-sec)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note}</div>}
        </div>
      )}

      {/* byline — who posted it (and who else did), replies, keep it */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 8, fontFamily: P_SANS, fontSize: 13, color: 'var(--theme-text-ter)', borderTop: '1px solid var(--theme-border)', paddingTop: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
          <FollowedTag post={post} />
          <WallLink name={post.user?.username || post.username} style={{ fontWeight: 600, fontSize: 14, color: 'var(--theme-text-pri)' }} />
          <AlsoPosted post={post} style={{ fontSize: 14, color: 'var(--theme-text-pri)' }} />
        </span>
        <span style={{ fontFamily: P_MONO, fontSize: 11, marginLeft: 'auto' }}>{timeAgo(post.created_at)}</span>
        <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 18, minHeight: 36 }}>
          <button onClick={() => setCommentsOpen(v => !v)} style={pPlain}>
            <span style={{ color: 'var(--theme-accent)', fontWeight: 700 }}>{commentCount}</span> replies
          </button>
          <HeartButton post={post} size={16} style={{ fontSize: 13, color: 'var(--theme-text-ter)' }} />
          <AddToPlaylistButton post={post} style={{ fontSize: 13, color: 'var(--theme-text-ter)' }} />
          {canModify && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontFamily: P_MONO, fontSize: 11 }}>
              <button onClick={() => onEdit?.(post)} style={pPlain}>edit</button>
              <button onClick={deletePost} disabled={deleting} style={pPlain}>{deleting ? '…' : 'delete'}</button>
            </span>
          )}
        </div>
      </div>
      {commentsOpen && <div style={{ margin: '0 -18px' }}><CommentThread postId={post.id} onCountChange={setCommentCount} d={{ ...D, cmPx: 18, cmSize: 14 }} maxH={320} inputSize={16} /></div>}
    </div>
  )
}

// A spotlight between posts: who or what, a few of their posts here (tap one
// to go to it), and their drawer for the rest.
const SPOTLIGHT_DRAWER = { artist: 'artists', label: 'labels', channel: 'live' }
const SPOTLIGHT_NAME = { artist: 'Artist', label: 'Label', channel: 'Channel' }
function PhoneSpotlight({ subject, onJump }) {
  const { openD3 } = useLayout() || {}
  const kind = SPOTLIGHT_DRAWER[subject.type]
  const posts = subject.posts.slice(0, 6)
  return (
    <div style={{ padding: '26px 20px 20px', display: 'flex', flexDirection: 'column', gap: 18, minHeight: '100%', boxSizing: 'border-box' }}>
      <div style={{ transform: 'scale(0.6)', transformOrigin: 'left top', height: 66 }}>{SPOTLIGHT_MARK[subject.type]}</div>
      <div>
        <div style={pZlabel}>{SPOTLIGHT_NAME[subject.type]} spotlight</div>
        <div style={{ fontFamily: D.artistFf, fontSize: 34, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.025em', color: 'var(--theme-text-pri)', overflowWrap: 'anywhere' }}>
          {subject.name} <FavHeart kind={subject.type} name={subject.name} size={24} style={{ color: 'var(--theme-text-sec)', verticalAlign: 'middle' }} />
        </div>
        <div style={{ marginTop: 8, fontFamily: P_MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--theme-text-ter)' }}>
          {subject.posts.length} {subject.posts.length === 1 ? 'post' : 'posts'} here
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {posts.map(p => (
          <button key={p.id} onClick={() => onJump(p.id)} aria-label={`Go to ${p.title}`} style={{ ...pPlain, display: 'block' }}>
            <CoverArt post={p} style={{ width: '100%', aspectRatio: '1', borderRadius: 12 }} />
          </button>
        ))}
      </div>
      <button onClick={() => openD3?.(kind, { filter: subject.name })}
        style={{ ...pPlain, alignSelf: 'flex-start', marginTop: 'auto', fontFamily: P_SANS, fontWeight: 600, fontSize: 15, padding: '11px 20px', borderRadius: 99, background: 'var(--theme-text-pri)', color: 'var(--theme-showcase)' }}>
        Everything by {subject.name} →
      </button>
    </div>
  )
}

function PhoneFeed({ shelf, intros, cardBg, emptyText, onEdit, hasMore, loadMore, viewKey, jumpRef, topBar, header, latestPost }) {
  const deckRef = useRef(null)
  const openingRef = useRef(null)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(null) // key of the card whose player is open
  // The desktop's placeholder channel spotlight has nothing to show here.
  // Introductions slot in as their own slides (withIntros).
  const list = withIntros((shelf.current || []).filter(it => it.kind === 'post' || !it.subject?.isPlaceholder), intros)
  // Card colours by the shelf's own index, so introductions don't shift them.
  let shelfIdx = -1
  const bgs = list.map(it => it.kind === 'intro' ? cardBg(0, it) : cardBg(++shelfIdx, it))
  let phonePostIdx = -1 // posts only (no spotlights / live sets): the blocks card walks its colour spectrum by this
  const blocksOf = list.map(it => (BLOCKS_CARDS && it.kind === 'post' && !isLiveSetPost(it.post) ? ++phonePostIdx : -1))
  // A wall's card (WallCard) leads it; the posts follow.
  const head = header ? 1 : 0

  // A new feed or search starts at its first card, the opening shut.
  const [shownKey, setShownKey] = useState(viewKey)
  if (shownKey !== viewKey) { setShownKey(viewKey); setIdx(0) }
  const firstKey = useRef(viewKey)
  useEffect(() => {
    if (viewKey === firstKey.current) return
    firstKey.current = null
    openingRef.current?.close()
    deckRef.current?.scrollTo({ left: 0 })
  }, [viewKey])

  // The next page when FEED_LOAD_AHEAD cards from the end.
  useEffect(() => { if (hasMore && idx - head >= list.length - FEED_LOAD_AHEAD) loadMore() }, [idx, head, list.length, hasMore, loadMore])

  function go(i, smooth = true) {
    const el = deckRef.current
    if (el) el.scrollTo({ left: Math.max(0, Math.min(i, list.length - 1 + head)) * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
  }
  // Jumps (search, drawers, a spotlight's covers) land straight on the card.
  const jumpTo = id => {
    const i = list.findIndex(it => it.post?.id === id)
    if (i < 0) return false
    openingRef.current?.close()
    go(i + head, false)
    return true
  }
  useEffect(() => { if (jumpRef) jumpRef.current = jumpTo })

  // "My profile" (lib/collections showMyProfile): back to the first slide —
  // your profile, on my feed — with the opening out of the way.
  useEffect(() => {
    const h = () => { openingRef.current?.close(); deckRef.current?.scrollTo({ left: 0 }) }
    window.addEventListener('lnv:show-profile', h)
    return () => window.removeEventListener('lnv:show-profile', h)
  }, [])

  // Arrow keys on a narrow desktop window.
  useEffect(() => {
    const h = e => {
      if (e.target.closest?.('input, textarea, [contenteditable]')) return
      if (e.key === 'ArrowRight') go(idx + 1)
      else if (e.key === 'ArrowLeft') go(idx - 1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const onScroll = e => {
    const el = e.currentTarget
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== idx) setIdx(i)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'var(--theme-bg)' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 8, padding: `calc(10px + env(safe-area-inset-top)) ${PHONE_GAP}px 10px` }}>
        {topBar}
      </div>
      <div ref={deckRef} onScroll={onScroll} aria-label="Posts — swipe for the next one"
        style={{ position: 'absolute', inset: 0, display: 'flex', overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', overscrollBehaviorX: 'contain', scrollbarWidth: 'none' }}>
        {header && (BLOCKS_CARDS ? <Slide bg="var(--theme-bg)" bare>{header}</Slide> : <Slide bg="var(--theme-showcase)">{header}</Slide>)}
        {list.length === 0 ? (
          <section style={{ flex: '0 0 100%', height: '100%', boxSizing: 'border-box', padding: `${PHONE_TOPBAR_H} 32px 32px`, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: P_SANS, fontSize: 15, lineHeight: 1.5, color: 'var(--theme-text-sec)', scrollSnapAlign: 'center' }}>{emptyText}</section>
        ) : list.map((it, i) => blocksOf[i] >= 0 ? (
          <Slide key={it.key} bg="var(--theme-bg)" bare>
            <ShelfCard post={latestPost ? latestPost(it.post) : it.post} cardBg="var(--theme-bg)" d={D} onEdit={onEdit} idx={blocksOf[i]} phone />
          </Slide>
        ) : (
          <Slide key={it.key} bg={bgs[i]}>
            {it.kind === 'intro'
              ? <IntroCard intro={it.intro} compact placeholder={!!it.intro.placeholder} />
              : it.kind === 'spotlight'
              ? <PhoneSpotlight subject={it.subject} onJump={jumpTo} />
              : <PhoneCard post={latestPost ? latestPost(it.post) : it.post} onEdit={onEdit}
                  playing={playing === it.key} onPlay={() => setPlaying(it.key)} onStop={() => setPlaying(null)} />}
          </Slide>
        ))}
      </div>
      <PhoneOpening deckRef={deckRef} ctlRef={openingRef} />
    </div>
  )
}

export default function Feed() {
  // One player at a time across every card (lib/playerGuard).
  useEffect(() => installPlayerGuard(), [])
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
  const [search, setSearch]           = useState('')
  const [authTab, setAuthTab]         = useState(null) // the Module look: the welcome card swaps for the account card (sign in / create) in its own slot
  const shelfItems                    = useRef([])
  const shelfState                    = useRef(null)
  const lastPostsSignature            = useRef(null)
  const clockWrapRef                  = useRef(null)
  const scrollCueRef                  = useRef(null)
  const queryClient                   = useQueryClient()
  const { feedRef, driveFeedScroll, scrollToPost: scrollShelfToPost, postRefs, openD3, jumpHandlerRef } = useLayout() || {}
  // Phones get one post per screen, swiped sideways (PhoneFeed in Feed.jsx,
  // 2026-10-05) — same posts, same feeds; a jump to a post moves that deck.
  const phone = usePhone()
  // The Module look keeps its controls in the nav strip (Strip.jsx sends 'lnv-tool'): the search and the feed switch open as a floating bar,
  // new post opens the composer, the theme picker floats beside the strip, and the listen panel is ListeningSettings in `rail` mode.
  const railTools = MODULE_CARDS && !phone
  const [toolBar, setToolBar] = useState(false)
  const toolBarRef = useRef(null)
  useEffect(() => {
    if (!railTools) return undefined
    const on = e => {
      const k = e.detail
      if (k === 'search' || k === 'feeds') { setToolBar(true); if (k === 'search') setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' })), 80) }
      else if (k === 'compose') setComposeOpen(true)
      else if (k === 'theme') setPickerOpen(v => !v)
      else if (k === 'listen') window.dispatchEvent(new Event('lnv-listen-toggle'))
    }
    window.addEventListener('lnv-tool', on)
    return () => window.removeEventListener('lnv-tool', on)
  }, [railTools])
  useEffect(() => {
    if (!toolBar) return undefined
    const key = e => { if (e.key === 'Escape') setToolBar(false) }
    const away = e => { if (toolBarRef.current && !toolBarRef.current.contains(e.target)) setToolBar(false) }
    window.addEventListener('keydown', key)
    document.addEventListener('pointerdown', away)
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('pointerdown', away) }
  }, [toolBar])
  const phoneJumpRef = useRef(null)
  const scrollToPost = useCallback(id => (phone ? phoneJumpRef.current?.(id) : scrollShelfToPost?.(id)), [phone, scrollShelfToPost])
  const onPhoneDeck = useCallback(id => phone && (shelfItems.current || []).some(it => it.post?.id === id), [phone])

  // Theme
  useEffect(() => { applyPalette(themeIdx === -1 ? getAutoIndex() : themeIdx) }, [themeIdx])
  useEffect(() => {
    const t = setInterval(() => { if (themeIdx === -1) applyPalette(getAutoIndex()) }, 60000)
    return () => clearInterval(t)
  }, [themeIdx])

  // Search box (SearchBox.jsx) picks: a post scrolls the feed to it. A post
  // that isn't in the loaded feed (older than the latest 60) is fetched by
  // filtering the feed on its number — the backend puts that post first —
  // and scrolled to once it lands (pendingJump).
  const pendingJump = useRef(null)
  function jumpToPost(id) {
    if (postRefs?.current?.has(id) || onPhoneDeck(id)) { scrollToPost(id); return }
    pendingJump.current = id
    setSearch(String(id))
  }
  // The drawers jump through LayoutProvider's jumpToPost, which calls this.
  useEffect(() => {
    if (!jumpHandlerRef) return
    jumpHandlerRef.current = jumpToPost
    return () => { jumpHandlerRef.current = null }
  })

  // Data — lazy loaded (2026-10-01): FEED_PAGE posts at a time; reaching
  // the post FEED_LOAD_AHEAD from the end of what's loaded (post 50 of 60)
  // fetches the next FEED_PAGE (see the IntersectionObserver below). The
  // latest feed pages by cursor (`before` = last post id) so new posts
  // can't shift the pages; search pages by number (ranked results).
  // Which feed (2026-10-03): my feed (you + who you follow), the main one, a
  // wall, or a playlist as a feed — FeedSwitcher / lib/collections. A search
  // always searches the main feed.
  const feedMode = useFeedMode()
  // Kept the same array while the feed doesn't change, so effects that
  // watch it don't re-run on every render.
  const feedSelKey = search || feedMode.type === 'main' ? ''
    : feedMode.type === 'home' ? `home\n${feedMode.friends === false ? 'mine' : 'all'}`
    : feedMode.type === 'wall' ? `wall\n${feedMode.username}`
    : `playlist\n${feedMode.token ? `t:${feedMode.token}` : String(feedMode.id)}`
  const feedSel = useMemo(() => feedSelKey ? feedSelKey.split('\n') : null, [feedSelKey])
  const { data: raw, isFetching, isFetchingNextPage, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: feedSel ? ['posts', 'FEED', ...feedSel] : ['posts', search ? 'SEARCH' : 'LATEST', search],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: String(FEED_PAGE) })
      if (search) { qs.set('search', search); if (pageParam) qs.set('page', String(pageParam)) }
      else {
        if (feedSel?.[0] === 'home') { qs.set('feed', 'home'); if (feedSel[1] === 'mine') qs.set('friends', '0') }
        else if (feedSel?.[0] === 'wall') qs.set('wall', feedSel[1])
        else if (feedSel?.[0] === 'playlist') {
          if (feedSel[1].startsWith('t:')) qs.set('playlist_token', feedSel[1].slice(2))
          else qs.set('playlist', feedSel[1])
        }
        if (pageParam) qs.set('before', String(pageParam))
      }
      const res = await fetch(`${API}/posts?${qs}`, feedSel ? { headers: authHeaders() } : undefined)
      // Signed out, or no longer allowed to see that playlist: back to the main feed.
      if (feedSel && (res.status === 401 || res.status === 404)) return { posts: [], hasMore: false, gone: true }
      if (!res.ok) return { posts: [], hasMore: false }
      const d = await res.json()
      // /api/posts returns {posts,total,page,limit,hasMore}; tolerate a bare array too.
      return Array.isArray(d) ? { posts: d, hasMore: false } : { posts: d.posts || [], hasMore: !!d.hasMore, cursor: d.cursor ?? null }
    },
    // Walls / shared feeds say where their next page starts (`cursor`).
    getNextPageParam: (last, all) => !last.hasMore ? undefined : search ? all.length + 1 : (last.cursor ?? last.posts[last.posts.length - 1]?.id),
    // The 30 s check for new posts only runs while just the first page is
    // loaded — refetching would re-download every page scrolled through.
    refetchInterval: q => (search || (q.state.data?.pages?.length || 0) > 1) ? false : 30000,
  })
  // The search box's spinner and jump logic mean "loading a new search", not
  // "loading the next page".
  const searching = isFetching && !isFetchingNextPage
  const feedGone = !!raw?.pages?.[0]?.gone
  useEffect(() => { if (feedGone) setFeedMode(homeMode()) }, [feedGone])

  // Links (2026-10-03): ?wall=<username> opens a wall (public);
  // ?playlist=<token> opens a shared playlist, read-only, in the playlists
  // drawer; ?playlistinvite=<token> joins a playlist so you can add tracks
  // (signed out, it waits in sessionStorage while you sign in).
  const linksChecked = useRef(false)
  useEffect(() => {
    if (linksChecked.current) return
    linksChecked.current = true
    const params = new URLSearchParams(window.location.search)
    // ?feed=<username> opens someone's feed (?wall= still works for old links).
    const wallName = params.get('feed') || params.get('wall'), shared = params.get('playlist')
    let invite = params.get('playlistinvite')
    if (wallName || shared || invite) {
      for (const k of ['feed', 'wall', 'playlist', 'playlistinvite']) params.delete(k)
      window.history.replaceState(null, '', window.location.pathname + (params.toString() ? `?${params}` : ''))
    }
    if (wallName) openWall(wallName)
    if (shared) openD3?.('playlists', { token: shared })
    try {
      if (invite) sessionStorage.setItem('lnv_playlistinvite', invite)
      else invite = sessionStorage.getItem('lnv_playlistinvite')
    } catch { /* storage blocked */ }
    if (!invite) return
    const forget = () => { try { sessionStorage.removeItem('lnv_playlistinvite') } catch { /* ignore */ } }
    if (!isLoggedIn()) {
      if (window.confirm('A friend invited you to add tracks to their playlist. Sign in (or make an account) to accept?')) window.location.href = '/login'
      else forget()
      return
    }
    forget()
    playlistsApi.preview(invite).then(p => {
      if (p.joined) return openD3?.('playlists', { open: p.id })
      if (!window.confirm(`${p.owner} invited you to add tracks to “${p.name}” (${p.track_count} track${p.track_count === 1 ? '' : 's'}). Accept?`)) return
      return playlistsApi.join(invite).then(j => {
        queryClient.invalidateQueries({ queryKey: ['playlists'] })
        openD3?.('playlists', { open: j.id })
      })
    }).catch(err => window.alert(err.message))
  }, [queryClient, openD3])

  const posts = useMemo(() => {
    const seen = new Set()
    return (raw?.pages || []).flatMap(p => p.posts).filter(p => !seen.has(p.id) && seen.add(p.id))
  }, [raw])
  // The shelf is only rebuilt when the list of posts changes (below), so a
  // refresh with the same posts but fresher details — a ♥, a reply count,
  // "& you" — gives cards the latest copy by id (2026-10-06).
  const latestPost = useMemo(() => {
    const byId = new Map(posts.map(p => [p.id, p]))
    return post => byId.get(post.id) || post
  }, [posts])

  // Introductions (alpha) — signed in, on my feed with friends' posts, not
  // while searching. Dev builds fill empty slots with placeholders.
  const introsOn = feedMode.type === 'home' && isLoggedIn() && !search && feedMode.friends !== false
  const introData = useIntroductions(introsOn)
  const coverPosts = posts.filter(p => coverSrc(p)).slice(0, 9)
  const coverKey = coverPosts.map(p => p.id).join(',')
  const intros = useMemo(() => {
    if (!introsOn || !introData || introData.off) return []
    const real = introData.items || []
    const fill = PLACEHOLDER_INTROS.slice(0, Math.max(0, PLACEHOLDER_INTROS.length - real.length)).map((it, i) => ({
      ...it, placeholder: true,
      latest: coverPosts.slice(i * 3, i * 3 + 3).map(p => ({ id: p.id, title: p.title, cover: coverSrc(p) })),
    }))
    return [...real, ...fill]
    // coverPosts is keyed by coverKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introsOn, introData, coverKey])

  const postsSignature = posts.map(p => p.id).join(',')
  if (postsSignature !== lastPostsSignature.current) {
    // More posts on the end of the same list → extend; anything else (new
    // search, new posts at the front) → rebuild.
    const prev = lastPostsSignature.current
    const appended = prev && shelfState.current && postsSignature.startsWith(prev + ',')
    shelfState.current = buildShelfItems(posts, appended ? shelfState.current : null)
    shelfItems.current = shelfState.current.items
    lastPostsSignature.current = postsSignature
  }

  // Next page once the post FEED_LOAD_AHEAD from the end of the loaded
  // posts comes on screen.
  const loadTriggerId = hasNextPage && !isFetchingNextPage ? posts[Math.max(0, posts.length - FEED_LOAD_AHEAD)]?.id : null
  useEffect(() => {
    const root = feedRef?.current
    const el = loadTriggerId != null ? postRefs?.current?.get(loadTriggerId) : null
    if (!root || !el) return
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) fetchNextPage() }, { root, threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [loadTriggerId, feedRef, postRefs, fetchNextPage])

  // 2026-09-25: when the SEARCH changes (never on the 30 s background
  // refresh), move the shelf once that search's results have landed — to the
  // first result (or the no-results panel) while searching, back to the
  // start when it's cleared. Must go through driveFeedScroll: the old
  // `feedRef.current.scrollLeft = 0` here was overwritten by LayoutProvider's
  // ticker on the very next frame, so a search that shrank the shelf left the
  // view stranded past its end (typing "38" = blank, unscrollable page).
  // 2026-10-03: switching feeds (main / mine / shared) moves the shelf the
  // same way — to the first card, so you land on the feed you picked rather
  // than back on the intro. Only clearing a search returns to the start.
  const viewKey = search ? `s:${search}` : feedSel ? `f:${feedSel.join(':')}` : ''
  const scrolledForSearch = useRef(viewKey) // a page load keeps its intro, whichever feed it opens on
  useEffect(() => {
    if (searching || scrolledForSearch.current === viewKey) return
    const prev = scrolledForSearch.current
    scrolledForSearch.current = viewKey
    if (pendingJump.current != null) return // a jump to a post is on its way
    // Effects run after the new results are in the DOM, so measure now.
    const feed = feedRef?.current
    if (!feed) return
    const first = viewKey || !prev.startsWith('s:') ? feed.children[1] : null
    // - STRIP_RADIUS: the feed's left edge sits that far under the strip (Layout.jsx)
    const target = first ? feed.scrollLeft + (first.getBoundingClientRect().left - feed.getBoundingClientRect().left) - STRIP_RADIUS : 0
    driveFeedScroll?.(Math.max(0, target))
  }, [viewKey, searching, postsSignature, feedRef, driveFeedScroll])

  // A card's "main #N" (wall / shared feed): back to the main feed, then to
  // that post once the main feed has loaded (Collect.jsx MainNumber).
  useEffect(() => {
    const h = e => { pendingJump.current = e.detail; setFeedMode({ type: 'main' }) }
    window.addEventListener('lnv:jump-main', h)
    return () => window.removeEventListener('lnv:jump-main', h)
  }, [])

  // "My profile" (2026-10-05, lib/collections showMyProfile): my feed is
  // already switched to; clear any search and bring your profile card into
  // view once it's drawn. Phones go back to the deck's first slide
  // (PhoneFeed listens too).
  useEffect(() => {
    let tries = 0, t = null
    const scrollToCard = () => {
      const feed = feedRef?.current
      const card = feed?.querySelector('[data-profile-card="me"]')
      if (!card) { if (++tries < 30) t = setTimeout(scrollToCard, 100); return }
      const slot = card.closest('[data-float-slot]') || card
      driveFeedScroll?.(Math.max(0, feed.scrollLeft + (slot.getBoundingClientRect().left - feed.getBoundingClientRect().left) - STRIP_RADIUS))
    }
    const h = () => { pendingJump.current = null; setSearch(''); tries = 0; clearTimeout(t); if (!phone) t = setTimeout(scrollToCard, 50) }
    window.addEventListener('lnv:show-profile', h)
    return () => { window.removeEventListener('lnv:show-profile', h); clearTimeout(t) }
  }, [phone, feedRef, driveFeedScroll])

  // Finish a jump to a post that had to be fetched first (jumpToPost).
  useEffect(() => {
    const id = pendingJump.current
    if (searching || id == null) return
    if (feedSel) return // still showing a wall / shared feed: wait for the main one
    // On the main feed but not among the loaded posts: fetch it by number.
    if (!search && posts.length && !posts.some(p => p.id === id)) { setSearch(String(id)); return }
    if (!posts.some(p => p.id === id) || !(postRefs?.current?.has(id) || onPhoneDeck(id))) return
    pendingJump.current = null
    const t = setTimeout(() => scrollToPost(id), 250)
    return () => clearTimeout(t)
  }, [searching, postsSignature, postRefs, scrollToPost, feedSel, search, posts, onPhoneDeck])

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
    let twin = null // the clock's copy inside the strip's green zone (Strip.jsx #lnv-strip-clock)
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
        // The twin sits in the strip's green zone, whose right edge is the
        // strip's (outerWidth). On screen the real clock's right edge is at
        // innerWidth - 56 - scrollX (FeedIntro's right minus gap + 56; the
        // feed starts STRIP_RADIUS under the strip), so the twin's `right`
        // within the zone is outerWidth - that. No layout reads.
        if (!twin || !twin.isConnected) twin = document.getElementById('lnv-strip-clock')
        if (twin) {
          twin.style.right = `${outerWidth - (window.innerWidth - 56 - 1 /* FeedIntro's 1px borderRight */ - (dbg?.scrollX ?? 0))}px`
          twin.style.opacity = clockWrapRef.current.style.opacity
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

  // The phone nav's + (PhoneNav.jsx) opens the composer; with a url
  // (the drawers' release preview, "+ add to my feed") it starts from it.
  useEffect(() => {
    const h = e => { if (e.detail?.url) openComposeWithUrl(e.detail.url); else setComposeOpen(true) }
    window.addEventListener('lnv:compose', h)
    return () => window.removeEventListener('lnv:compose', h)
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
    if (item?.kind === 'spotlight' || item?.kind === 'intro') return 'var(--theme-showcase)'
    if (idx >= SPECTRUM_START) return spectrumBg(idx, currentPalette.name)
    // Trial (gabriel, 2026-09-26): the first three match the surface —
    // lifted only by their shadow. POST_BG_CYCLE was:
    // `var(--theme-${POST_BG_CYCLE[idx % POST_BG_CYCLE.length]})`
    return 'var(--theme-bg)'
  }

  const currentPalette = PALETTES[themeIdx === -1 ? getAutoIndex() : themeIdx]

  const myFeedSwitch = { on: feedMode.friends !== false, set: setHomeFriends }
  const emptyText = search ? `No results for "${search}"`
    : feedSel?.[0] === 'home' ? (isFetching ? 'Loading…' : !isLoggedIn() ? 'Nothing on the front page yet.' : feedSel[1] === 'mine' ? 'Nothing posted yet — post a link with +, or ♥ a record to keep it here.' : 'Your feed: your posts and everyone you follow. Post a link with +, or open someone’s feed from a card and follow them.')
    : feedSel?.[0] === 'wall' ? (isFetching ? 'Loading…' : feedMode.username === getUser() ? 'Nothing in your feed yet — everything you post shows up here (and in your followers’ feeds).' : `Nothing in ${feedMode.username}’s feed yet.`)
    : feedSel ? (isFetching ? 'Loading…' : `None of “${feedMode.name}”’s tracks come from posts yet — tracks added from a post or spotlight show here as cards.`)
    : 'No posts yet — share the first record.'

  const searchBox = (style) => (
    <SearchBox
      style={style}
      onJump={jumpToPost}
      onOpenDrawer={(kind, name) => openD3?.(kind, { filter: name })}
      onShowAll={q => { pendingJump.current = null; setSearch(q) }}
      onClear={() => { pendingJump.current = null; setSearch('') }}
      filtering={!!search}
      busy={searching}
    />
  )

  const modals = (<>
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
    {/* Once, after signing in: add your Discogs collection and wantlist (2026-10-08) */}
    <DiscogsPrompt />
  </>)

  if (phone) return (
    <>
      <PhoneFeed
        shelf={shelfItems}
        intros={intros}
        latestPost={latestPost}
        cardBg={getCardBg}
        emptyText={posts.length ? null : emptyText}
        onEdit={setEditingPost}
        hasMore={!!hasNextPage}
        loadMore={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
        viewKey={viewKey}
        jumpRef={phoneJumpRef}
        header={search ? null : feedMode.type === 'wall' ? <WallCard key={feedMode.username} username={feedMode.username} compact />
          : feedMode.type === 'home' && isLoggedIn() ? <WallCard key="me" username={getUser()} compact friends={myFeedSwitch} />
          : feedMode.type === 'home' ? <WelcomeCard key="welcome" compact /> : null}
        topBar={<>
          <FeedSwitcher menuLeft noFollow style={{ position: 'relative', top: 'auto', right: 'auto', flexShrink: 0, maxWidth: '45%' }} />
          {searchBox({ position: 'static', top: 'auto', right: 'auto', width: 'auto', flex: 1, minWidth: 0 })}
        </>}
      />
      {modals}
    </>
  )

  const composeAnchor = (
    <div key="compose-anchor" style={{ position: 'sticky', left: STRIP_RADIUS + COMPOSE_LOCK_GAP - (16 + FLOAT_GAP / 2), flex: '0 0 0', width: 0, height: 0, alignSelf: 'flex-end', zIndex: 100 }}>
      <button onClick={() => setComposeOpen(true)} aria-label="New post"
        style={{ position: 'absolute', bottom: 16, left: 16 + FLOAT_GAP / 2, width: 48, height: 48, borderRadius: '50%', background: 'var(--theme-accent)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', transition: 'background 0.8s' }}>+</button>
    </div>
  )

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
        {/* No posts: the button rides with the first card there is (your profile / the welcome), in its lower-left corner. */}
        {!posts.length && !railTools && composeAnchor}
        {/* A wall opens on its owner's card (2026-10-05). */}
        {feedMode.type === 'wall' && !search && <FloatSlot bare={BLOCKS_CARDS} key={`wall-${feedMode.username}`}><WallCard username={feedMode.username} /></FloatSlot>}
        {/* My feed opens on your profile, with its friends switch (2026-10-06). */}
        {feedMode.type === 'home' && isLoggedIn() && !search && <FloatSlot bare={BLOCKS_CARDS} key="wall-me"><WallCard username={getUser()} friends={myFeedSwitch} /></FloatSlot>}
        {/* Signed out, the front page opens on a welcome instead (2026-10-05). */}
        {feedMode.type === 'home' && !isLoggedIn() && !search && <FloatSlot bare={BLOCKS_CARDS} key="welcome">{MODULE_CARDS && authTab ? <Login embedded startTab={authTab} onClose={() => setAuthTab(null)} /> : <WelcomeCard onAuth={MODULE_CARDS ? setAuthTab : undefined} />}</FloatSlot>}
        {!posts.length && (
          // A card-width panel, not flex:1 — the intro already fills the
          // viewport, so flex:1 squeezed this to ~40px just off-screen.
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: `0 0 ${DESIGN_BASE.cardW}px`, fontFamily: 'VT323, monospace', fontSize: 14, color: 'var(--theme-text-sec)' }}>
            {emptyText}
          </div>
        )}
        {(() => {
          const nodes = []
          // The compose button (48px, gabriel 2026-10-01) rides with the first post (2026-10-08): it starts in
          // that card's lower-left corner and scrolls with the feed until it reaches the nav strip, where it
          // locks — exactly where the old fixed button sat. A zero-size sticky anchor in the row; the button
          // hangs off it. sticky `left` is the card slot's side padding (FLOAT_GAP / 2) negative, so the
          // anchor pins COMPOSE_LOCK_LEFT from the scroll edge (minus where the button hangs: 16 + that padding),
          // which puts the locked button COMPOSE_LOCK_GAP clear of the rail, tucked beside its rounded corner.
          // With no posts the button is placed before the first card instead (above, 9 Oct) — it used to sit at the
          // far right end of the row, under the bottom-right buttons.
          if (posts.length && !railTools) nodes.push(composeAnchor)
          let idx = -1 // the shelf's own index: introductions don't shift the cards' looks
          let postIdx = -1 // posts only (no spotlights or live sets): the blocks card walks its colour spectrum by this
          withIntros(shelfItems.current, intros).forEach(item => {
            if (item.kind === 'intro') {
              nodes.push(<FloatSlot key={item.key}><IntroCard intro={item.intro} placeholder={!!item.intro.placeholder} /></FloatSlot>)
              return
            }
            idx++
            if (item.kind !== 'spotlight' && !isLiveSetPost(item.post)) postIdx++
            const cardBg = getCardBg(idx, item)
            const card = (item.kind === 'spotlight'
              ? <SpotlightCard key={item.key} cardKey={item.key} subject={item.subject} cardBg={cardBg} onCreateFromDiscogs={openComposeWithUrl} />
              : isLiveSetPost(item.post)
                ? <LiveSetCard key={item.key} post={latestPost(item.post)} cardBg={cardBg} d={designFor(idx, true)} onEdit={setEditingPost} />
                : SHELF_CARDS
                ? <ShelfCard key={item.key} post={latestPost(item.post)} cardBg={cardBg} d={designFor(idx, false)} onEdit={setEditingPost} idx={postIdx} />
                : isAlbumPost(item.post)
                ? <AlbumCard key={item.key} post={latestPost(item.post)} cardBg={cardBg} d={designFor(idx, false)} onEdit={setEditingPost} />
                : <PostCard key={item.key} post={latestPost(item.post)} cardBg={cardBg} onEdit={setEditingPost}
                    d={item.mirror ? { ...designFor(idx, false), mediaSide: 'left', plateAlign: 'left' } : designFor(idx, detectType(item.post) === 'livemix')} />)
            // Floating card — rounded and lifted off the surface (FloatSlot).
            nodes.push(<FloatSlot key={item.key} bare={BLOCKS_CARDS && SHELF_CARDS && item.kind !== 'spotlight' && !isLiveSetPost(item.post)}>{card}</FloatSlot>)
          })
          // Empty feed: the row after the clock panel is only the profile/welcome card slot + the empty panel
          // (about 1,628px), shorter than a wide screen, so the scroll ran out with the clock still half in view.
          // This room lets that card scroll up beside the rail, with only it showing. It stops STRIP_RADIUS short of the
          // very edge: the feed starts STRIP_RADIUS under the rail, so the full scroll tucked the card under the rail's
          // rounded corner (9 Oct).
          if (!posts.length) nodes.push(<div key="end-room" aria-hidden="true" style={{ flex: '0 0 auto', width: `max(0px, calc(100% - ${2 * DESIGN_BASE.cardW + FLOAT_GAP + STRIP_RADIUS}px))` }} />)
          return nodes
        })()}
      </div>

      {/* Main feed / my feed / shared feeds (2026-10-03) */}
      {!railTools && <FeedSwitcher />}

      {/* Search — dropdown of post numbers, posts, artists/labels/genres */}
      {!railTools && searchBox()}

      {/* How do you listen? — which services to play from first (2026-10-08) */}
      <ListeningSettings rail={railTools} />

      {/* The Module look: the feed switch and the search open here, beside the strip */}
      {railTools && toolBar && (
        <div ref={toolBarRef} style={{ position: 'fixed', left: RAIL_WIDTH + 16, top: 16, zIndex: 300, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <FeedSwitcher menuLeft noFollow style={{ position: 'relative', top: 'auto', right: 'auto', flexShrink: 0 }} />
          <div style={{ position: 'relative', width: 340 }}>{searchBox({ position: 'relative', top: 'auto', right: 'auto', width: '100%' })}</div>
          <button onClick={() => setToolBar(false)} aria-label="Close" style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--theme-border)', background: 'var(--theme-dark3)', color: 'var(--theme-text-sec)', cursor: 'pointer', fontSize: 15, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', flexShrink: 0 }}>×</button>
        </div>
      )}
      {railTools && pickerOpen && (
        <>
          <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 299 }} />
          <div style={{ position: 'fixed', left: RAIL_WIDTH + 16, bottom: 16, width: 164, height: 1, zIndex: 300 }}>
            <ThemePicker currentIdx={themeIdx} onSelect={i => { setThemeIdx(i); setPickerOpen(false) }} />
          </div>
        </>
      )}

      {/* Theme button */}
      {!railTools && <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 100 }}>
        {pickerOpen && <ThemePicker currentIdx={themeIdx} onSelect={i => { setThemeIdx(i); setPickerOpen(false) }} />}
        <button onClick={() => setPickerOpen(v => !v)}
          style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', cursor: 'pointer', color: 'var(--theme-text-sec)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>◐</button>
        <div style={{ fontSize: 8, textAlign: 'center', color: 'var(--theme-text-ter)', marginTop: 3, fontFamily: 'VT323, monospace', letterSpacing: '0.06em' }}>
          {themeIdx === -1 ? 'AUTO' : currentPalette?.name?.split(' ')[0].toUpperCase()}
        </div>
      </div>}

      {modals}
    </div>
  )
}

