import { useListening, LISTEN_SERVICES, PREVIEW_ONLY } from '../lib/listening'

// "How do you listen?" in the window shown after signing in (2026-10-23, gabriel: "prompt what platform priority order"). The same list as the listen panel
// (lib/listening.js, kept on the account): tick the services you listen on, then put them in order, best first. A track plays from the first of them it has; if
// nothing is ticked, full-length sources (YouTube, SoundCloud, Bandcamp) come first. Shown in its own step, before the Discogs step.
const SANS = "'Barlow', sans-serif"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)', LINE = 'var(--theme-border)'
const pill = { border: `1px solid ${LINE}`, background: 'none', color: PRI, borderRadius: 99, padding: '5px 14px', fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const pillOn = { ...pill, border: 0, background: 'var(--theme-accent)', color: '#fff' }
const arrow = off => ({ border: `1px solid ${LINE}`, background: 'none', color: PRI, borderRadius: 8, width: 28, height: 28, cursor: off ? 'default' : 'pointer', opacity: off ? 0.3 : 1, fontSize: 14, lineHeight: 1 })

export function ListenPrompt({ onDone }) {
  const [listening, { toggle, move }] = useListening()
  const have = listening.have
  const rest = LISTEN_SERVICES.filter(s => !have.includes(s.id))
  const byId = id => LISTEN_SERVICES.find(s => s.id === id)
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onDone() }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Where do you listen?"
        style={{ width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 20, padding: '22px 24px', background: 'var(--theme-dark3)', border: `1px solid ${LINE}`, color: PRI, fontFamily: SANS, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 20, flex: 1 }}>Where do you listen?</div>
          <button onClick={onDone} aria-label="Close" style={{ border: 0, background: 'none', color: SEC, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: SEC, margin: '8px 0 14px' }}>
          Tick the services you use, then put them in order, best first. A track plays from the first one it has. You can change this any time from the listen button.
        </div>

        {have.length > 0 && <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          {have.map((id, i) => {
            const s = byId(id)
            if (!s) return null
            return (
              <div key={id} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto auto auto', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: 'color-mix(in srgb, var(--theme-accent) 16%, transparent)' }}>
                <b style={{ fontSize: 13, color: 'var(--theme-accent)' }}>{i + 1}</b>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{s.name} <span style={{ fontWeight: 400, fontSize: 12, color: TER }}>{PREVIEW_ONLY.has(id) ? 'previews unless signed in' : 'plays in full'}</span></span>
                <button onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Move ${s.name} up`} style={arrow(i === 0)}>↑</button>
                <button onClick={() => move(id, 1)} disabled={i === have.length - 1} aria-label={`Move ${s.name} down`} style={arrow(i === have.length - 1)}>↓</button>
                <button onClick={() => toggle(id)} aria-label={`Remove ${s.name}`} style={{ ...arrow(false), color: SEC }}>×</button>
              </div>
            )
          })}
        </div>}

        {rest.length > 0 && <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: TER, margin: '4px 0 6px', fontWeight: 600 }}>{have.length ? 'Add another' : 'Tick the ones you use'}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {rest.map(s => <button key={s.id} onClick={() => toggle(s.id)} title={s.note} style={pill}>+ {s.name}</button>)}
        </div>

        <div style={{ fontSize: 12.5, lineHeight: 1.45, color: TER, margin: '14px 0' }}>
          If you tick none, we play full-length sources first (YouTube, SoundCloud, Bandcamp). YouTube Premium can't be detected, so tick YouTube if you have it.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onDone} style={pillOn}>{have.length ? 'Save and continue' : 'Skip for now'}</button>
        </div>
      </div>
    </div>
  )
}
