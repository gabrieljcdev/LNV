import { useState, useEffect, useRef } from 'react'
import { useListening, LISTEN_SERVICES, PREVIEW_ONLY } from '../lib/listening'

// "How do you listen?" (2026-10-08, gabriel). A small round button beside the theme button; its
// panel lists the services a listener can play full tracks on. What they tick is played first
// where a track has it (lib/listening.js pickUrl); the order they tick them is their priority.
// Spotify is also learned from playback: if its player shows full-length tracks the panel says so
// and it counts as ticked; if it only ever shows 30-second previews the panel says that too.
export default function ListeningSettings() {
  const [open, setOpen] = useState(false)
  const [listening, { toggle, clear }] = useListening()
  const box = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const have = listening.have
  const sig = listening.signals || {}
  const order = id => have.indexOf(id) + 1
  const status = s => {
    const sg = sig[s.id]
    if (!sg) return null
    if (sg.last === 'full') return { text: 'played full tracks here', good: true }
    if (PREVIEW_ONLY.has(s.id)) return { text: 'only 30-second previews so far, so not played first — sign in to ' + s.name + ' in this browser, then play one from its chip', good: false }
    return null
  }
  const mono = { fontFamily: 'VT323, monospace', letterSpacing: '0.06em' }

  return (
    <div ref={box} style={{ position: 'absolute', bottom: 16, right: 60, zIndex: 100 }}>
      {open && (
        <div role="dialog" aria-label="How do you listen?"
          style={{ position: 'absolute', bottom: 46, right: 0, width: 320, padding: '16px 16px 12px', borderRadius: 16, background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', boxShadow: '0 20px 50px rgba(0,0,0,0.35)', color: 'var(--theme-text-pri)', fontFamily: 'Barlow, sans-serif' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>How do you listen?</div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--theme-text-sec)', margin: '4px 0 10px' }}>
            Tick what you pay for or are signed in to. We play from those first, where a track has them — the order you tick is the order we try.
          </div>
          {LISTEN_SERVICES.map(s => {
            const on = have.includes(s.id)
            const st = status(s)
            return (
              <button key={s.id} onClick={() => toggle(s.id)} aria-pressed={on} title={s.note}
                style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', gap: 10, alignItems: 'start', width: '100%', textAlign: 'left', padding: '8px 6px', margin: 0, background: 'none', border: 'none', borderTop: '1px solid var(--theme-border)', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, border: '1.5px solid ' + (on ? 'var(--theme-showcase)' : 'var(--theme-text-ter)'), background: on ? 'var(--theme-showcase)' : 'transparent', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{on ? order(s.id) : ''}</span>
                <span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name} <span style={{ fontWeight: 400, color: 'var(--theme-text-ter)', fontSize: 12 }}>{s.plan}</span></span>
                  {st && <span style={{ display: 'block', fontSize: 11, marginTop: 2, color: st.good ? 'var(--theme-accent)' : 'var(--theme-text-ter)' }}>{st.good ? '✓ ' : ''}{st.text}</span>}
                </span>
              </button>
            )
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--theme-border)', fontSize: 11, color: 'var(--theme-text-ter)' }}>
            <span>YouTube Premium can't be detected — tick it if you have it.</span>
            {(have.length > 0 || Object.keys(sig).length > 0) && <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--theme-text-sec)', textDecoration: 'underline', font: 'inherit', fontSize: 11, flexShrink: 0, marginLeft: 8 }}>reset</button>}
          </div>
        </div>
      )}
      <button onClick={() => setOpen(v => !v)} aria-label="How do you listen?" aria-expanded={open}
        style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', cursor: 'pointer', color: have.length ? 'var(--theme-accent)' : 'var(--theme-text-sec)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>♪</button>
      <div style={{ fontSize: 8, textAlign: 'center', color: 'var(--theme-text-ter)', marginTop: 3, ...mono }}>{have.length ? have[0].toUpperCase().slice(0, 5) : 'LISTEN'}</div>
    </div>
  )
}
