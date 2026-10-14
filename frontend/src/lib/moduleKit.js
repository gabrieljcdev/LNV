// The Module look (?cards=module, 14 Oct 2026, gabriel's pick of mockup36), shared by the post card (Feed.jsx), the landing (WelcomeCard),
// the profile (WallCard) and the sign-in page: a dark frame of tight matte tiles, one hot tile, a turntable disc. Opt-in: ?cards=module turns it on,
// ?cards=blocks turns it off; both are remembered. The query is read here too so /login?cards=module works as a first visit.
export const MODULE_CARDS = (() => {
  try {
    const q = new URLSearchParams(window.location.search).get('cards')
    if (q === 'blocks' || q === 'module') localStorage.setItem('lnv-cards', q)
    const v = localStorage.getItem('lnv-cards')
    return v === 'module' || v === null // the default from 14 Oct 2026; ?cards=blocks goes back (remembered)
  } catch { return true }
})()

// ── The Module spectrum (gabriel, 14 Oct 2026) ──────────────────────────────────────────────────────────────────────────────
// Colour runs across the feed as a spectrum: each post is ONE solid colour, and the colour steps along the time-of-day palette's own
// sweep from post to post (there and back, so there is never a jump). Inside each post a couple of boxes (the details box, a counter)
// take colours of the same palette that contrast with it: the accents. Frame and cover are deeper shades of the post's colour.
import { PALETTES, getActivePaletteName } from '../services/themeService'

// Each palette's sweep, in order (anchors; the steps between them are blended).
export const MODULE_RAMPS = {
  'Deep Night':   ['#0C0D10', '#17191D', '#2B2F36', '#434954', '#6B7380', '#A4ACBA'],
  'Pre-dawn':     ['#0A0D14', '#141C2A', '#1E2535', '#2F3A5C', '#404C70', '#6573A8'],
  'First Light':  ['#12304A', '#1E4060', '#1A4A6B', '#6C93AD', '#BACED8', '#DCE8F0'],
  'Morning':      ['#1C2E1E', '#2C4A2E', '#5E7A5A', '#B8C4B0', '#E4E0D6', '#F0EDE4'],
  'Midday':       ['#8B1A1A', '#C0392B', '#E05020', '#FF8C00', '#FFC300', '#FFEA61'],
  'Afternoon':    ['#1A1612', '#2E2820', '#C4391A', '#D4CEC4', '#E8E2D8', '#F5F0E8'],
  'Evening':      ['#2A1A4E', '#3C2967', '#782D65', '#C3005D', '#FD9367', '#FDCD63'],
  'Late Evening': ['#1B1928', '#1C3182', '#2D3956', '#404C70', '#9970AA', '#C9A8D8'],
}
const rgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) }
const hx = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const mixc = (a, b, t) => { const A = rgb(a), B = rgb(b); return hx(A.map((v, i) => v + (B[i] - v) * t)) }
const lumOf = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrastOf = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const satOf = h => { const c = rgb(h), mx = Math.max(...c), mn = Math.min(...c); return mx ? (mx - mn) / mx : 0 }
export const RAMP_STEPS = 10 // colours from one end of the sweep to the other; the feed walks them there and back
function along(anchors, t) { // t 0..1 over the anchors
  const x = Math.max(0, Math.min(1, t)) * (anchors.length - 1), i = Math.min(anchors.length - 2, Math.floor(x))
  return mixc(anchors[i], anchors[i + 1], x - i)
}
// The look of post number `idx`: { base, frame, cover, a1, a2 } as plain hex colours (a1 / a2: the accent boxes).
export function moduleLook(idx = 0, name = getActivePaletteName()) {
  const ramp = MODULE_RAMPS[name] || MODULE_RAMPS.Morning
  const S = RAMP_STEPS - 1, p = ((idx % (2 * S)) + 2 * S) % (2 * S), step = p <= S ? p : 2 * S - p
  const base = along(ramp, step / S)
  const pal = PALETTES.find(x => x.name === name) || {}
  const pool = [...new Set([...ramp, ...['accent', 'showcase', 'dark1', 'dark2', 'dark3', 'light1', 'light2'].map(k => pal[k]).filter(Boolean)].map(c => c.toUpperCase()))]
  const ranked = pool.filter(c => contrastOf(c, base) >= 2.2).sort((x, y) => contrastOf(y, base) * (0.7 + satOf(y)) - contrastOf(x, base) * (0.7 + satOf(x)))
  const a1 = ranked[0] || (lumOf(base) > 0.4 ? '#14210F' : '#F2F4F7')
  const a2 = ranked.find(c => contrastOf(c, a1) > 1.5 && c !== a1) || ranked[1] || a1
  return { base, frame: mixc(base, '#000000', 0.55), cover: mixc(base, '#000000', 0.32), a1, a2 }
}
// The boxes are cut with the nav strip's own curve: STRIP_RADIUS (Strip.jsx) is 40, so every Module box is 40 (gabriel, 14 Oct).
// No frame (gabriel, 14 Oct): the boxes float straight on the feed colour. This keeps the call sites; it is just the gap and nothing behind.
export const modFrameFor = () => ({ background: 'transparent', borderRadius: 0, padding: 0, boxSizing: 'border-box' })
export const solid = c => [c, c] // <Blk bg>: [fill, base]

export const MODULE_CSS = `
.lnv-mod .lnv-bk{border-radius:40px;box-shadow:0 16px 30px -18px rgba(0,0,0,.45),0 2px 6px -2px rgba(0,0,0,.18);outline:1px solid color-mix(in srgb,var(--lv-pri) 14%,transparent);outline-offset:-1px}
.lnv-mod .lnv-bk:hover{transform:none!important;box-shadow:0 16px 30px -18px rgba(0,0,0,.45),0 2px 6px -2px rgba(0,0,0,.18)!important}
.mod-metal{background:linear-gradient(180deg,#fbfcfb,#edf0ee);color:#1b1b1b;cursor:pointer}
.mod-disc{position:absolute;right:-50px;top:50%;width:230px;height:230px;margin-top:-115px;border-radius:50%;background:conic-gradient(from 0deg,#f2f2f2,#9d9d9d 12%,#fafafa 25%,#8a8a8a 37%,#f2f2f2 50%,#a3a3a3 62%,#fafafa 75%,#8f8f8f 87%,#f2f2f2);animation:modSpin 6s linear infinite paused}
.mod-disc::after{content:'';position:absolute;inset:0;border-radius:50%;background:repeating-radial-gradient(circle,transparent 0 5px,rgba(0,0,0,.04) 5px 6px)}
.mod-metal.on .mod-disc,.mod-disc.spin{animation-play-state:running}
@keyframes modSpin{to{transform:rotate(360deg)}}
.mod-hatch{position:relative;border:1.5px solid color-mix(in srgb,var(--lv-pri) 55%,transparent);border-radius:12px;background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--lv-pri) 78%,transparent) 0 2px,transparent 2px 8px);overflow:hidden}
.mod-hatch.on::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--lv-pri) 38%,transparent),transparent);animation:modSweep 1.6s ease-in-out infinite}
@keyframes modSweep{from{transform:translateY(-100%)}to{transform:translateY(100%)}}
.mod-cplay{position:absolute;left:16px;bottom:16px;width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.92);color:#111;display:grid;place-items:center;font-size:18px;padding-left:3px;box-shadow:0 10px 22px -6px rgba(0,0,0,.5);transition:transform .25s cubic-bezier(.2,.9,.3,1.4)}
.mod-cplay:hover{transform:scale(1.1)}
.mod-tr{transition:background .2s,padding .25s}.mod-tr:hover{background:color-mix(in srgb,var(--lv-pri) 7%,transparent);padding-left:8px}
.mod-sr{transition:background .2s}.mod-sr:hover{background:color-mix(in srgb,var(--lv-pri) 9%,transparent)}
`
