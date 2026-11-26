import { useLayoutEffect, useRef, useState } from 'react'
import { INK_DARK_BG, INK_LIGHT_BG, bgIsDark, useThemeTick } from '../lib/blocksKit'

// One block of the blocks look (see lib/blocksKit.js): filled with a colour, ink picked from it.
export function Blk({ bg, cut, className = '', style, children, ...rest }) {
  const tick = useThemeTick()
  const probe = useRef(null)
  const [dark, setDark] = useState(false)
  const [fill, base] = bg
  useLayoutEffect(() => { if (probe.current) setDark(bgIsDark(probe.current)) }, [tick, base])
  return (
    <section className={`lnv-bk${cut ? ` lnv-cut-${cut}` : ''} ${className}`} style={{ position: 'relative', overflow: 'hidden', background: fill, ...(dark ? INK_DARK_BG : INK_LIGHT_BG), color: 'var(--lv-pri)', transition: 'background .8s', '--blk-bg': base, ...style }} {...rest}>
      <i ref={probe} aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, background: base }} />
      {children}
    </section>
  )
}
