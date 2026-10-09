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

/** { artist: { [discogsId]: total }, label: { ... } } — the size of each crawled catalogue, for the Artists and Labels tabs. */
export function useCatalogueTotals() {
  return useQuery({
    queryKey: ['catalogue-totals'],
    queryFn: async () => { const r = await fetch(`${API}/discogs/catalogue-totals`); return r.ok ? r.json() : { artist: {}, label: {} } },
    staleTime: 5 * 60 * 1000,
  })
}

/** Your imported records with artist / label ids — the Artists and Labels tabs list these beside the posts. */
export function useDiscogsRecords() {
  return useQuery({
    queryKey: ['discogs-records'],
    queryFn: () => call('GET', '/records'),
    enabled: isLoggedIn(),
    staleTime: 60000,
  })
}

/** An imported record shaped like the compact post the drawers group (Drawers.jsx), flagged `discogsOnly`. */
export const discogsPseudoPosts = (records = []) => records.map(r => ({
  id: -r.discogs_id, discogsOnly: true, discogs_id: r.discogs_id, lists: r.lists || [],
  title: r.title, post_title: null, year: r.year || null, cover: r.cover || null, post_type: 'album',
  channel: null, platform: null, stream_url: null, created_at: null, track_count: 0, genres: [],
  artists: (r.artists || []).map(a => a.name),
  artist_ids: Object.fromEntries((r.artists || []).filter(a => a.id).map(a => [a.name, a.id])),
  labels: r.label ? [{ name: r.label, catno: r.catno || '', id: r.label_id || null }] : [],
}))

// The prompt after signing in is shown once: remembered here.
const SEEN = 'lnv-discogs-prompt'
export const discogsPromptSeen = () => { try { return localStorage.getItem(SEEN) === '1' } catch { return true } }
export const markDiscogsPromptSeen = () => { try { localStorage.setItem(SEEN, '1') } catch { /* private mode */ } }
