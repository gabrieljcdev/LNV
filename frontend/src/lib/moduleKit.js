// The Module look (?cards=module, 14 Oct 2026, gabriel's pick of mockup36), shared by the post card (Feed.jsx), the landing (WelcomeCard),
// the profile (WallCard) and the sign-in page: a dark frame of tight matte tiles, one hot tile, a turntable disc. Opt-in: ?cards=module turns it on,
// ?cards=blocks turns it off; both are remembered. The query is read here too so /login?cards=module works as a first visit.
export const MODULE_CARDS = (() => {
  try {
    const q = new URLSearchParams(window.location.search).get('cards')
    if (q === 'blocks' || q === 'module') localStorage.setItem('lnv-cards', q)
    return localStorage.getItem('lnv-cards') === 'module'
  } catch { return false }
})()

// [fill, base] pairs for <Blk bg>: the matte light tile, the hot (accent) tile, the dark tile.
export const M = {
  TILE: ['linear-gradient(180deg, color-mix(in srgb, var(--theme-light2) 50%, #fff), var(--theme-light2) 58%)', 'var(--theme-light2)'],
  HOT: ['var(--theme-accent)', 'var(--theme-accent)'],
  DARK: ['var(--theme-dark3)', 'var(--theme-dark3)'],
}

// The dark frame the tiles sit in (padding and gap 7).
export const modFrame = { background: 'var(--theme-dark1)', borderRadius: 40, padding: 7, boxSizing: 'border-box' }

export const MODULE_CSS = `
.lnv-mod .lnv-bk{border-radius:26px}
.lnv-mod .lnv-bk:hover{transform:none!important;box-shadow:none!important}
.mod-metal{background:linear-gradient(180deg,#fbfcfb,#edf0ee);color:#1b1b1b;cursor:pointer}
.mod-disc{position:absolute;right:-50px;top:50%;width:230px;height:230px;margin-top:-115px;border-radius:50%;background:conic-gradient(from 0deg,#f2f2f2,#9d9d9d 12%,#fafafa 25%,#8a8a8a 37%,#f2f2f2 50%,#a3a3a3 62%,#fafafa 75%,#8f8f8f 87%,#f2f2f2);animation:modSpin 6s linear infinite paused}
.mod-disc::after{content:'';position:absolute;inset:0;border-radius:50%;background:repeating-radial-gradient(circle,transparent 0 5px,rgba(0,0,0,.04) 5px 6px)}
.mod-metal.on .mod-disc,.mod-disc.spin{animation-play-state:running}
@keyframes modSpin{to{transform:rotate(360deg)}}
.mod-hatch{position:relative;border:1.5px solid color-mix(in srgb,var(--lv-pri) 55%,transparent);border-radius:12px;background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--lv-pri) 78%,transparent) 0 2px,transparent 2px 8px);overflow:hidden}
.mod-hatch.on::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--lv-pri) 38%,transparent),transparent);animation:modSweep 1.6s ease-in-out infinite}
@keyframes modSweep{from{transform:translateY(-100%)}to{transform:translateY(100%)}}
.mod-cplay{position:absolute;left:16px;bottom:16px;width:56px;height:56px;border-radius:50%;background:var(--theme-accent);color:#fff;display:grid;place-items:center;font-size:18px;padding-left:3px;box-shadow:0 10px 22px -6px rgba(0,0,0,.5);transition:transform .25s cubic-bezier(.2,.9,.3,1.4)}
.mod-cplay:hover{transform:scale(1.1)}
.mod-tr{transition:background .2s,padding .25s}.mod-tr:hover{background:color-mix(in srgb,var(--lv-pri) 7%,transparent);padding-left:8px}
.mod-sr{transition:background .2s}.mod-sr:hover{background:color-mix(in srgb,var(--lv-pri) 9%,transparent)}
`
