import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMyCrates, usePublicCrates, useCreateCrate } from '../../hooks/useCrates.js'
import { isLoggedIn, getUser } from '../../lib/auth.js'

export default function D2Crates() {
  const [tab, setTab]         = useState('mine') // 'mine' | 'public'
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const navigate              = useNavigate()
  const mine                  = useMyCrates()
  const pub                   = usePublicCrates()
  const createCrate           = useCreateCrate()

  const crates = tab === 'mine' ? (mine.data ?? []) : (pub.data ?? [])
  const shown  = crates.slice(0, 8)

  function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    createCrate.mutate(
      { name: newName.trim(), user_id: sessionStorage.getItem('userId'), is_public: 0 },
      {
        onSuccess: () => {
          setNewName('')
          setCreating(false)
        },
      }
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 16px' }}>
      <Header title="Crates" />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['mine', 'public'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily:    'VT323, monospace',
              fontSize:      13,
              letterSpacing: 1,
              padding:       '3px 10px',
              borderRadius:  100,
              background:    tab === t ? 'var(--charcoal)' : 'transparent',
              color:         tab === t ? 'var(--white)'    : 'var(--grey-text)',
              border:        tab === t ? 'none' : '1px solid var(--border)',
              cursor:        'pointer',
              textTransform: 'uppercase',
            }}
          >
            {t === 'mine' ? 'Mine' : 'Public'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {shown.length === 0 && (
          <div style={{ fontFamily: 'VT323, monospace', fontSize: 13, color: 'var(--grey-text)', letterSpacing: 1 }}>
            {tab === 'mine' ? 'No crates yet.' : 'No public crates.'}
          </div>
        )}
        {shown.map(crate => (
          <CrateRow key={crate.id} crate={crate} onClick={() => navigate(`/crate/${crate.id}`)} />
        ))}
      </div>

      {isLoggedIn() && tab === 'mine' && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {creating ? (
            <form onSubmit={handleCreate} style={{ display: 'flex', gap: 6 }}>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Crate name..."
                style={{
                  flex: 1, padding: '5px 8px', borderRadius: 4,
                  border: '1px solid var(--grey-mid)', fontSize: 13,
                  fontFamily: 'Barlow, sans-serif',
                }}
              />
              <button type="submit" style={orangeBtn}>+</button>
              <button type="button" onClick={() => setCreating(false)} style={ghostBtn}>✕</button>
            </form>
          ) : (
            <button onClick={() => setCreating(true)} style={{ ...ghostBtn, width: '100%', justifyContent: 'center' }}>
              + New crate
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CrateRow({ crate, onClick }) {
  const pct = crate.record_count > 0
    ? Math.min(100, Math.round((crate.record_count / 50) * 100))
    : 0

  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--charcoal)' }}>
          {crate.name}
        </span>
        <span style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: 'var(--grey-text)', letterSpacing: 1 }}>
          {crate.record_count ?? 0}
        </span>
      </div>
      <div style={{
        height: 2, background: 'var(--grey-light)',
        borderRadius: 2, marginTop: 5, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'var(--pastel-blue-dark)',
          borderRadius: 2,
        }} />
      </div>
    </div>
  )
}

function Header({ title }) {
  return (
    <div style={{
      fontFamily: 'VT323, monospace',
      fontSize: 11,
      letterSpacing: 2,
      color: 'var(--grey-text)',
      textTransform: 'uppercase',
      marginBottom: 14,
      paddingBottom: 8,
      borderBottom: '1px solid var(--border)',
    }}>
      {title}
    </div>
  )
}

const orangeBtn = {
  background: 'var(--orange)', color: 'white', border: 'none',
  borderRadius: 4, padding: '5px 10px', cursor: 'pointer', fontSize: 13,
}
const ghostBtn = {
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 4, padding: '5px 10px', cursor: 'pointer', fontSize: 13,
  color: 'var(--grey-text)', display: 'flex', alignItems: 'center',
}
