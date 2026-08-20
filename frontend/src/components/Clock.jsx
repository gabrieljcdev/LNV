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
    <div>
      <div
        ref={clockRef}
        style={{
          fontFamily:    'Barlow, sans-serif',
          fontWeight:    900,
          fontSize:      52,
          color:         'var(--charcoal)',
          letterSpacing: -2,
          lineHeight:    1,
        }}
      />
      <div
        ref={datetimeRef}
        style={{
          fontFamily:    'VT323, monospace',
          fontSize:      13,
          letterSpacing: 2,
          color:         'var(--grey-text)',
          textTransform: 'uppercase',
          marginTop:     6,
        }}
      />
    </div>
  )
}
