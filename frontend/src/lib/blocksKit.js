import { useEffect, useState } from 'react'

// The blocks look (13 Oct 2026): rounded blocks with one chamfered corner, filled from the time-of-day palette, with light or dark ink
// picked per block. Shared by the feed's post card (Feed.jsx), the profile / welcome cards (Collect.jsx) and the sign-in page.
// A block sets --blk-bg to the colour it is filled with, so a solid button inside can use it as its text colour.

export const INK_DARK_BG  = { '--theme-text-pri': 'rgba(255,255,255,0.95)', '--theme-text-sec': 'rgba(255,255,255,0.80)', '--theme-text-ter': 'rgba(255,255,255,0.72)', '--theme-border': 'rgba(255,255,255,0.18)' }
export const INK_LIGHT_BG = { '--theme-text-pri': 'rgba(0,0,0,0.86)', '--theme-text-sec': 'rgba(0,0,0,0.72)', '--theme-text-ter': 'rgba(0,0,0,0.66)', '--theme-border': 'rgba(0,0,0,0.12)' }
for (const ink of [INK_DARK_BG, INK_LIGHT_BG]) {
  ink['--lv-pri'] = ink['--theme-text-pri']; ink['--lv-sec'] = ink['--theme-text-sec']
  ink['--lv-ter'] = ink['--theme-text-ter']; ink['--lv-line'] = ink['--theme-border']
}
export function bgIsDark(el) {
  const c = getComputedStyle(el).backgroundColor
  const m = c.match(/\d+(\.\d+)?/g)
  if (!m) return false
  const k = /^color\(srgb/i.test(c) ? 255 : 1
  const [r, g, b] = m.slice(0, 3).map(v => { v = (Number(v) * k) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18 // ≈ where white and black ink give equal contrast
}

// Black or white text on a platform colour, whichever reads.
export function inkOnHex(hex) {
  const h = String(hex || '').replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  if (full.length !== 6) return '#fff'
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const L = 0.2126 * f(parseInt(full.slice(0, 2), 16)) + 0.7152 * f(parseInt(full.slice(2, 4), 16)) + 0.0722 * f(parseInt(full.slice(4, 6), 16))
  return 1.05 / (L + 0.05) >= 3.9 ? '#fff' : '#111'
}

export const BLOCK_RAD = 30 // block corner radius
export const BLOCK_CUT = 38 // the one cut corner
export const BLOCK_CP = "'Chakra Petch', 'Barlow', sans-serif"
export const BLOCK_CSS = '.lnv-bk{transition:transform .35s cubic-bezier(.2,.9,.3,1.3),box-shadow .35s}.lnv-bk:hover{transform:translateY(-3px) rotate(-.2deg);box-shadow:0 14px 30px rgba(0,0,0,.18)}'
  + `.lnv-bk{border-radius:${BLOCK_RAD}px}`
  + `.lnv-cut-br{clip-path:polygon(0 0,100% 0,100% calc(100% - ${BLOCK_CUT}px),calc(100% - ${BLOCK_CUT}px) 100%,0 100%)}`
  + `.lnv-cut-bl{clip-path:polygon(0 0,100% 0,100% 100%,${BLOCK_CUT}px 100%,0 calc(100% - ${BLOCK_CUT}px))}`
  + `.lnv-cut-tr{clip-path:polygon(0 0,calc(100% - ${BLOCK_CUT}px) 0,100% ${BLOCK_CUT}px,100% 100%,0 100%)}`
  + `.lnv-cut-tl{clip-path:polygon(${BLOCK_CUT}px 0,100% 0,100% 100%,0 100%,0 ${BLOCK_CUT}px)}`
  + '.lnv-tr{transition:transform .25s cubic-bezier(.2,.9,.3,1.5),background .2s,padding .25s}.lnv-tr:hover{transform:translateX(6px)}.lnv-tr.on{transform:translateX(10px)}'
  + '.lnv-tr .lnv-off{opacity:.3;transition:opacity .15s}.lnv-tr:hover .lnv-off{opacity:1}'
  + '.lnv-eq{display:inline-flex;align-items:flex-end;gap:2px;height:12px;width:14px}.lnv-eq i{flex:1;background:currentColor;animation:lnvEq .8s ease-in-out infinite alternate}.lnv-eq i:nth-child(2){animation-delay:.2s}.lnv-eq i:nth-child(3){animation-delay:.4s}@keyframes lnvEq{from{height:20%}to{height:100%}}'
  + '.lnv-rip{position:absolute;width:10px;height:10px;border-radius:50%;background:var(--theme-accent);transform:translate(-50%,-50%) scale(1);opacity:.55;animation:lnvRip .8s ease-out forwards;pointer-events:none;z-index:0}@keyframes lnvRip{to{transform:translate(-50%,-50%) scale(60);opacity:0}}'
  + '.lnv-num span{display:inline-block;transition:transform .6s cubic-bezier(.2,.9,.3,1.4)}.lnv-num span:hover{transform:rotateY(180deg) scale(1.06)}'
  + '.lnv-still:hover{transform:none!important;box-shadow:none!important}'
  + '.lnv-pb{transition:transform .25s cubic-bezier(.2,.9,.3,1.6),background .2s}.lnv-pb:hover{transform:translateY(-3px) scale(1.06)}.lnv-pb:active{transform:scale(.94)}'
  + '.lnv-pr{transition:background .2s}.lnv-pr:hover{background:color-mix(in srgb,currentColor 14%,transparent)}'
  + '.lnv-bar i{display:block;height:100%;border-radius:99px;background:currentColor;width:0;animation:lnvGrow .9s .2s cubic-bezier(.2,.9,.3,1) forwards}@keyframes lnvGrow{to{width:var(--w)}}'
  + '.lnv-wheel{transition:transform .5s cubic-bezier(.2,.9,.3,1.5)}.lnv-wheel:hover{transform:rotate(40deg) scale(1.1)}'
  + '.lnv-rc{transition:transform .35s cubic-bezier(.2,.9,.3,1.5),box-shadow .35s}.lnv-rc:hover{transform:translateY(-2px) scale(1.02);box-shadow:0 10px 22px rgba(0,0,0,.18)}'
  + '.lnv-pt{cursor:pointer;transform-box:fill-box;transform-origin:center;opacity:0;animation:lnvPin .55s cubic-bezier(.2,1.3,.3,1) forwards;animation-delay:calc(var(--i)*50ms)}@keyframes lnvPin{from{transform:scale(.2) rotate(-40deg);opacity:0}to{transform:none;opacity:1}}'
  + '.lnv-pt .n{transition:transform .3s;transform-box:fill-box;transform-origin:center}.lnv-pt:hover .n{transform:scale(1.08)}.lnv-pt:hover .o{filter:brightness(1.18)}.lnv-pt.pulse .n{animation:lnvPulse .5s}@keyframes lnvPulse{40%{transform:scale(1.22)}}'
  + '@keyframes lnvPop{from{transform:scale(.4) rotate(-8deg);opacity:0}}@keyframes lnvFade{from{opacity:0}}'
  + '@media (prefers-reduced-motion: reduce){.lnv-bk,.lnv-tr,.lnv-pb,.lnv-cover,.lnv-rc,.lnv-pt,.lnv-num span,.lnv-wheel{transition:none!important;animation:none!important}.lnv-pt{opacity:1}.lnv-eq i{animation:none;height:60%}}'


// The theme's colours as hex (read from :root), so a block can pick light or dark ink for whatever the palette puts under it.
export const themeHex = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
export function useThemeTick() {
  const [n, setN] = useState(0)
  useEffect(() => {
    let t = null
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => setN(x => x + 1), 450) }) // after the card colours have faded
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => { mo.disconnect(); clearTimeout(t) }
  }, [])
  return n
}

// One block: filled with a colour (or gradient) from the colourway, with light or dark ink set from `base`, so every --lv-* inside follows.
