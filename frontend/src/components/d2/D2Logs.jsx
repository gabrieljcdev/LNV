import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api.js'
import { D2Header } from './D2Artists.jsx'

export default function D2Logs() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['logs'],
    queryFn:  () => apiFetch('/api/logs'),
  })

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <D2Header>Activity Log</D2Header>
      {isLoading && (
        <div style={{ fontFamily: 'VT323, monospace', fontSize: 13, color: 'var(--grey-text)', letterSpacing: 1 }}>
          LOADING...
        </div>
      )}
      {(logs ?? []).map((log, i) => (
        <div key={i} style={{
          padding: '6px 0',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          <span style={{ fontSize: 12, color: 'var(--charcoal)' }}>{log.action || log.message}</span>
          <span style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'var(--grey-text)', letterSpacing: 1 }}>
            {log.username ?? 'system'} · {formatTime(log.created_at)}
          </span>
        </div>
      ))}
    </div>
  )
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString()
}
