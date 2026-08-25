import { useEffect, useRef } from 'react'

const DAYS    = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']
const getPeriod = (h) => {
  if (h >= 21 || h < 5)  return 'NIGHT'
  if (h >= 18)           return 'EVENING'
  if (h >= 12)           return 'AFTERNOON'
  return 'MORNING'
}

export default function Clock() {
  const clockRef    = useRef(null)
  const datetimeRef = useRef(null)

  useEffect(() => {
    function tick() {
      const now = new Date()
      const h   = String(now.getHours()).padStart(2, '0')
      const m   = String(now.getMinutes()).padStart(2, '0')
      const s   = String(now.getSeconds()).padStart(2, '0')
      if (clockRef.current)    clockRef.current.textContent    = `${h}:${m}:${s}`
      if (datetimeRef.current) datetimeRef.current.textContent =
        `${DAYS[now.getDay()]} · ${getPeriod(now.getHours())}`
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    // Opacity is owned by Feed.jsx's clockWrapRef (the parent wrapper in
    // FeedIntro) — scroll-driven, not a mount animation. See Feed.jsx's
    // "Landing-panel clock" effect: invisible at rest, fades in as the
    // feed scrolls, same pace as Strip.jsx's FADE wordmark.
    <div>
      {/* Same treatment as PostCard's plate numeral (DESIGN_BASE in
          Feed.jsx: numeralSize 7rem, weight 900, lineHeight 0.78,
          letterSpacing -0.03em, Barlow) — this is the same numeral
          language as the post cards, not a separate clock style.
          Color is --theme-sidebar (the nav strip's own background
          token), not a text token — gabriel wants the clock to carry
          the strip's color across into the panel, shifting with it
          across the 8 time-of-day palettes. */}
      <div
        ref={clockRef}
        style={{
          fontFamily:    "'Barlow',sans-serif",
          fontWeight:    900,
          fontSize:      '7rem',
          color:         'var(--theme-sidebar)',
          letterSpacing: '-0.03em',
          lineHeight:    0.78,
        }}
      />
      {/* Day / time-of-day line — reverted to its previous colour
          (--theme-text-sec) per gabriel's ask; only the clock numeral
          above uses --theme-sidebar. */}
      <div
        ref={datetimeRef}
        style={{
          fontFamily:    "'VT323',monospace",
          fontSize:      15,
          letterSpacing: 2,
          color:         'var(--theme-text-sec)',
          textTransform: 'uppercase',
          marginTop:     8,
        }}
      />
    </div>
  )
}
