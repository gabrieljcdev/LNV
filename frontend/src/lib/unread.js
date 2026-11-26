import { useQuery } from '@tanstack/react-query'
import { authHeaders, isLoggedIn } from './auth'

// The notifications bell's number (2026-10-22). Polled gently (a minute), only while signed in.
const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
export function useUnread() {
  return useQuery({
    queryKey: ['notif-unread'],
    queryFn: () => fetch(`${API}/notifications/unread-count`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : { unread: 0 })),
    enabled: isLoggedIn(), refetchInterval: 60_000, staleTime: 30_000,
  }).data?.unread || 0
}
