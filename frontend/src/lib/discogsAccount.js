import { useQuery } from '@tanstack/react-query'
import { authHeaders, isLoggedIn } from './auth'

// Your Discogs collection and wantlist as playlists (2026-10-08) — backend: routes/discogsAccount.js.
const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

async function call(method, path, body) {
  const res = await fetch(`${API}/discogs-account${path}`, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Discogs account ${res.status}`)
  return data
}

export const discogsAccountApi = {
  status: () => call('GET', ''),
  link: body => call('POST', '/link', body),      // { username, collection, wantlist } -> { code, ... }
  verify: () => call('POST', '/verify'),          // -> { verified, message?, ... }
  sync: () => call('POST', '/sync'),
  unlink: () => call('DELETE', ''),
}

/** The signed-in listener's Discogs link, polled while it imports and while releases are still being checked. */
export function useDiscogsAccount() {
  return useQuery({
    queryKey: ['discogs-account'],
    queryFn: discogsAccountApi.status,
    enabled: isLoggedIn(),
    staleTime: 15000,
    refetchInterval: q => {
      const s = q.state.data
      if (!s?.linked) return false
      if (s.state === 'importing') return 3000
      if (s.state === 'ready' && s.checked && s.checked.done < s.checked.total) return 20000
      return false
    },
  })
}

// The prompt after signing in is shown once: remembered here.
const SEEN = 'lnv-discogs-prompt'
export const discogsPromptSeen = () => { try { return localStorage.getItem(SEEN) === '1' } catch { return true } }
export const markDiscogsPromptSeen = () => { try { localStorage.setItem(SEEN, '1') } catch { /* private mode */ } }
