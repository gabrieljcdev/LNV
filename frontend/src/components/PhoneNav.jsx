import { useState, useRef, useEffect } from 'react'
import { useLayout } from '../context/LayoutContext'
import { getUser, logout, isAdmin } from '../lib/auth'
import { goHome, homeMode, useFeedMode, showMyProfile } from '../lib/collections'
import { queue } from '../lib/queue'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const SANS = "'Barlow', sans-serif"

// The phone's nav (2026-10-05): the strip's tabs along the bottom, in thumb
// reach — home, the browse drawers, + to post, and "more" for the rest
// (about, playlists & walls, a random track, admin, your account).
const TABS = [
  { id: 'home', label: 'home' },
  { id: 'artists', label: 'artists' },
  { id: 'labels', label: 'labels' },
  { id: 'post', label: '+' },
  { id: 'live', label: 'live sets' },
  { id: 'community', label: 'community' }, // in genres' place (2026-10-06)
  { id: 'more', label: 'more' },
]

export const PHONE_NAV_H = 58

export default function PhoneNav() {
  const { d3Content, openD3, closeD3, setCurrentTrack } = useLayout()
  const feedMode = useFeedMode()
  const user = getUser()
  const [more, setMore] = useState(false)
  const moreRef = useRef(null)
  useEffect(() => {
    if (!more) return
    const h = e => { if (!moreRef.current?.contains(e.target) && !e.target.closest?.('[data-more]')) setMore(false) }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [more])

  function tap(id) {
    setMore(false)
    if (id === 'home') { closeD3(); goHome(); return }
    if (id === 'post') { closeD3(); window.dispatchEvent(new Event('lnv:compose')); return }
    if (id === 'more') { setMore(v => !v); return }
    d3Content === id ? closeD3() : openD3(id)
  }
  async function random() {
    setMore(false)
    try {
      const data = await (await fetch(`${API}/tracks/random`)).json()
      if (!data.youtube_url) return
      queue.close() // one player at a time: the random track replaces the playlist
      setCurrentTrack({ title: data.title, artist: data.artist + ' — ' + data.album, youtubeUrl: data.youtube_url, postId: data.post_id, albumArt: data.cover_image || data.thumb_image || null })
    } catch (err) { console.error('Random error:', err) }
  }
  const open = id => { setMore(false); openD3(id) }
  const atHome = !d3Content && feedMode.type === homeMode().type

  const item = { display: 'block', width: '100%', textAlign: 'left', padding: '13px 16px', border: 0, borderRadius: 12, background: 'none', color: 'var(--theme-text-pri)', fontFamily: SANS, fontSize: 16, cursor: 'pointer', textDecoration: 'none' }
  return (
    <nav aria-label="Main" style={{ position: 'relative', zIndex: 50, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 2, height: PHONE_NAV_H, padding: '0 6px env(safe-area-inset-bottom)', boxSizing: 'content-box', background: 'var(--theme-dark3)', borderTop: '1px solid var(--theme-border)' }}>
      {TABS.map(t => {
        if (t.id === 'post') return (
          <button key={t.id} onClick={() => tap(t.id)} aria-label="New post"
            style={{ width: 46, height: 46, flexShrink: 0, borderRadius: '50%', border: 'none', background: 'var(--theme-accent)', color: '#fff', fontSize: 24, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>+</button>
        )
        const on = t.id === 'home' ? atHome : t.id === 'more' ? more : d3Content === t.id
        return (
          <button key={t.id} onClick={() => tap(t.id)} aria-pressed={on} data-more={t.id === 'more' ? '' : undefined}
            style={{ flex: '1 1 0', minWidth: 0, height: 34, padding: '0 2px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: SANS, fontWeight: 600, fontSize: 12, letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              background: on ? 'var(--theme-accent)' : 'transparent', color: on ? '#fff' : 'var(--theme-text-ter)' }}>
            {t.id === 'home' && user ? 'my feed' : t.label}
          </button>
        )
      })}
      {more && (
        <div ref={moreRef} role="menu" style={{ position: 'absolute', right: 8, bottom: `calc(100% + 8px)`, width: 240, padding: 6, background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', borderRadius: 18, boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }}>
          {user && <button style={{ ...item, fontWeight: 700 }} onClick={() => { setMore(false); closeD3(); showMyProfile() }}>My profile <span style={{ fontWeight: 400, color: 'var(--theme-text-ter)' }}>· {user}</span></button>}
          {user && <button style={item} onClick={() => open('playlists')}>Playlists &amp; following</button>}
          <button style={item} onClick={random}>▶ A random track</button>
          <button style={item} onClick={() => open('about')}>About</button>
          {user && isAdmin() && <button style={item} onClick={() => open('admin')}>⚙ Admin</button>}
          <div style={{ height: 1, background: 'var(--theme-border)', margin: '4px 8px' }} />
          {user
            ? <button style={{ ...item, color: 'var(--theme-text-sec)' }} onClick={async () => { await logout(); window.location.href = '/' }}>Sign out <span style={{ opacity: 0.7 }}>· {user}</span></button>
            : <a style={item} href="/login">Sign in or join</a>}
        </div>
      )}
    </nav>
  )
}
