import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DrawerHead, DrawerBody } from './Drawers'
import { authHeaders } from '../lib/auth'
import { openWall } from '../lib/collections'
import { useLayout } from '../context/LayoutContext'

// Notifications (2026-10-22): followed, tagged (@), replied to, kept. Backend: routes/notifications.js. A row opens the person's feed; a tag
// can be taken off with "Remove my tag" (DELETE /posts/:id/mentions/me, or .../comments/:commentId/mentions/me).

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)', LINE = 'var(--theme-border)'

const call = async (path, options = {}) => {
  const r = await fetch(`${API}${path}`, { headers: authHeaders(), ...options })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Something went wrong (${r.status})`)
  return j
}
const VERB = { follow: 'followed you', mention: 'tagged you in', reply: 'replied to', keep: 'kept' }
const ago = at => {
  const s = Math.max(0, (Date.now() - new Date(String(at).replace(' ', 'T') + 'Z').getTime()) / 1000)
  return s < 3600 ? `${Math.max(1, Math.floor(s / 60))} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`
}

export function NotificationsDrawer() {
  const { closeD3 } = useLayout() || {}
  const qc = useQueryClient()
  const [removed, setRemoved] = useState({})
  const list = useQuery({ queryKey: ['notifications'], queryFn: () => call('/notifications?limit=40'), staleTime: 0 })
  const rows = list.data?.notifications || []
  const refresh = () => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['notif-unread'] }) }
  const readAll = async () => { await call('/notifications/read', { method: 'POST', body: JSON.stringify({ all: true }) }).catch(() => {}); refresh() }
  const open = async n => {
    if (!n.read) call('/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [n.id] }) }).then(refresh).catch(() => {})
    if (n.actor_username) { openWall(n.actor_username); closeD3?.() }
  }
  const untag = async n => {
    try { await call(n.comment_id ? `/posts/${n.post_id}/comments/${n.comment_id}/mentions/me` : `/posts/${n.post_id}/mentions/me`, { method: 'DELETE' }); setRemoved(r => ({ ...r, [n.id]: true })) } catch { /* leave the button */ }
  }

  return <>
    <DrawerHead title="Notifications" count="" action={list.data?.unread > 0 ? (
      <button onClick={readAll} style={{ alignSelf: 'center', border: `1px solid ${LINE}`, background: 'none', color: PRI, borderRadius: 99, padding: '5px 12px', fontFamily: SANS, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Mark all read</button>
    ) : null} />
    <DrawerBody>
      {list.isLoading ? <p style={{ fontFamily: MONO, fontSize: 12, color: TER }}>Loading…</p>
        : list.isError ? <p style={{ fontFamily: SANS, fontSize: 14, color: SEC }}>{list.error.message}</p>
        : rows.length === 0 ? <p style={{ fontFamily: SANS, fontSize: 15, color: SEC }}>Nothing yet. You will see here when someone follows you, tags you, replies, or keeps something you posted.</p>
        : rows.map(n => (
          <div key={n.id} style={{ padding: '11px 0', borderTop: `1px solid ${LINE}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 7, flexShrink: 0, background: n.read ? 'transparent' : 'var(--theme-accent)' }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <button onClick={() => open(n)} style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: SANS, fontSize: 15, lineHeight: 1.4, color: SEC }}>
                <b style={{ color: PRI }}>{n.actor}</b> {VERB[n.kind] || n.kind}{n.kind !== 'follow' && n.post_title ? <> <b style={{ color: PRI }}>{n.post_title}</b></> : null}
              </button>
              {n.snippet && <div style={{ fontFamily: SANS, fontSize: 14, color: SEC, margin: '3px 0 0' }}>“{n.snippet}”{n.private ? ' (private)' : ''}</div>}
              <div style={{ fontFamily: MONO, fontSize: 11, color: TER, marginTop: 3, display: 'flex', gap: 12, alignItems: 'center' }}>
                <span>{ago(n.at)}</span>
                {n.kind === 'mention' && n.post_id && (removed[n.id] ? <span>tag removed</span> : (
                  <button onClick={() => untag(n)} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--theme-accent)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Remove my tag</button>))}
              </div>
            </div>
          </div>
        ))}
    </DrawerBody>
  </>
}
