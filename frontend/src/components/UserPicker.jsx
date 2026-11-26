import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FollowButton } from './Collect'
import { openWall } from '../lib/collections'

// People search (2026-10-22), backed by GET /api/users/search?q= (username, display name, post count; never an email).
// UserSearch: the box in the Community tab. MentionSuggest: the @-picker under a note while typing "@na…".

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)', LINE = 'var(--theme-border)'

function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}
function useFindUsers(q) {
  const dq = useDebounced(q.trim())
  return useQuery({
    queryKey: ['user-search', dq],
    queryFn: () => fetch(`${API}/users/search?q=${encodeURIComponent(dq)}`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`search ${r.status}`)))),
    enabled: dq.length > 0, staleTime: 30_000,
  })
}

export function UserSearch({ onOpen }) {
  const [q, setQ] = useState('')
  const { data, isFetching, isError } = useFindUsers(q)
  const users = q.trim() ? data?.users || [] : []
  return (
    <div style={{ marginBottom: 16 }}>
      <input value={q} onChange={e => setQ(e.target.value.slice(0, 40))} placeholder="Find a person by name…" aria-label="Find a person by name"
        style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${LINE}`, borderRadius: 99, outline: 'none', padding: '9px 16px', background: 'none', color: PRI, fontFamily: SANS, fontSize: 15 }} />
      {q.trim() && (
        <div style={{ marginTop: 6 }}>
          {isError ? <p style={{ fontFamily: SANS, fontSize: 14, color: SEC, margin: '8px 0' }}>Couldn’t search just now.</p>
            : users.length === 0 ? <p style={{ fontFamily: SANS, fontSize: 14, color: SEC, margin: '8px 0' }}>{isFetching ? 'Searching…' : 'No one by that name.'}</p>
            : users.map(u => (
              <div key={u.username} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: `1px solid ${LINE}` }}>
                <button onClick={() => { openWall(u.username); onOpen?.() }} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontFamily: SANS, fontSize: 16, fontWeight: 700, color: PRI }}>{u.username}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: TER }}>{u.display_name && u.display_name !== u.username ? `${u.display_name} · ` : ''}{u.postCount} {u.postCount === 1 ? 'record' : 'records'}</span>
                </button>
                <FollowButton username={u.username} />
              </div>))}
        </div>
      )}
    </div>
  )
}

// While the note ends in "@xyz", offer people whose name starts that way; picking one finishes the name.
const TAIL = /(^|\s)@([A-Za-z0-9_.-]{1,30})$/
export function MentionSuggest({ text, onChange, max = 300 }) {
  const m = TAIL.exec(text || '')
  const { data } = useFindUsers(m ? m[2] : '')
  const users = m ? (data?.users || []).filter(u => u.username.toLowerCase().startsWith(m[2].toLowerCase())).slice(0, 5) : []
  if (!m || users.length === 0 || (users.length === 1 && users[0].username === m[2])) return null
  const pick = name => onChange((text.slice(0, m.index + m[1].length) + '@' + name + ' ').slice(0, max))
  return (
    <div role="listbox" aria-label="People to tag" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {users.map(u => (
        <button key={u.username} role="option" aria-selected="false" onMouseDown={e => e.preventDefault()} onClick={() => pick(u.username)}
          style={{ border: `1px solid ${LINE}`, borderRadius: 99, background: 'none', color: PRI, padding: '4px 11px', fontFamily: SANS, fontSize: 13.5, cursor: 'pointer' }}>@{u.username}</button>))}
    </div>
  )
}
