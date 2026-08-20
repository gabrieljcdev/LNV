import { useNavigate } from 'react-router-dom'
import { getUser, isLoggedIn, logout } from '../../lib/auth.js'
import { D2Header } from './D2Artists.jsx'

export default function D2Profile() {
  const navigate  = useNavigate()
  const username  = getUser()
  const loggedIn  = isLoggedIn()

  if (!loggedIn) {
    return (
      <div style={{ padding: 16 }}>
        <D2Header>Profile</D2Header>
        <p style={{ fontSize: 13, color: 'var(--grey-text)', marginBottom: 12 }}>
          Sign in to access your profile.
        </p>
        <button
          onClick={() => navigate('/login')}
          style={{
            background: 'var(--charcoal)', color: 'white',
            border: 'none', borderRadius: 4,
            padding: '7px 16px', cursor: 'pointer',
            fontFamily: 'VT323, monospace', fontSize: 14,
            letterSpacing: 1, textTransform: 'uppercase',
          }}
        >
          Login
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      <D2Header>Profile</D2Header>

      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'var(--pastel-blue)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: 16, color: 'var(--charcoal)',
        }}>
          {username[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--charcoal)' }}>{username}</div>
          <div style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: 'var(--grey-text)', letterSpacing: 1 }}>
            MEMBER
          </div>
        </div>
      </div>

      <button
        onClick={() => { logout(); window.location.reload() }}
        style={{
          background: 'transparent', color: 'var(--grey-text)',
          border: '1px solid var(--border)', borderRadius: 4,
          padding: '5px 12px', cursor: 'pointer',
          fontFamily: 'VT323, monospace', fontSize: 13,
          letterSpacing: 1, textTransform: 'uppercase',
        }}
      >
        Sign out
      </button>
    </div>
  )
}
