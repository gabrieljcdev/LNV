import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Home from './Home'
import { authHeaders, getUser } from '../lib/auth'
import { openWall, useFeedMode } from '../lib/collections'

// A person's address, /u/<username> (2026-10-22): the feed page opened on their wall, shareable by link. The name is looked up without regard to case and the
// address is tidied to the real spelling (/u/AMY -> /u/amy); a name that does not exist says so. Choosing another feed from the switcher takes the address back to /.
const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export default function Profile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const mode = useFeedMode()
  const [state, setState] = useState('loading') // loading | ok | missing
  const opened = useRef(null)                    // whose wall this address opened

  useEffect(() => {
    let live = true
    opened.current = null
    fetch(`${API}/walls/${encodeURIComponent(username)}`, { headers: authHeaders() })
      .then(async r => {
        if (!live) return
        if (r.status === 404) { setState('missing'); return }
        const w = r.ok ? await r.json() : null
        if (!live) return
        if (!w) { setState('ok'); return }
        if (!w.exact) navigate(w.path, { replace: true })   // /u/AMY -> /u/amy
        opened.current = w.username
        openWall(w.username)
        setState('ok')
      })
      .catch(() => { if (live) setState('ok') })
    return () => { live = false }
  }, [username, navigate])

  // Back to another feed: the address stops claiming to be this person's.
  useEffect(() => {
    const who = opened.current
    if (state !== 'ok' || !who) return
    const here = (mode.type === 'wall' && mode.username?.toLowerCase() === who.toLowerCase()) || (mode.type === 'home' && who === getUser())
    if (!here) navigate('/', { replace: true })
  }, [mode, state, navigate])

  if (state === 'missing') {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, fontFamily: "'Barlow', sans-serif", color: 'var(--theme-text-pri)', background: 'var(--theme-bg)', zIndex: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 34 }}>No such person</div>
        <div style={{ color: 'var(--theme-text-sec)', fontSize: 16 }}>Nobody here is called “{username}”.</div>
        <Link to="/" style={{ color: 'var(--theme-accent)', fontWeight: 700 }}>Back to the feed</Link>
      </div>
    )
  }
  return state === 'ok' ? <Home /> : null
}
