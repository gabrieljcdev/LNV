const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
import { catalogueTotalsOptions, discogsRecordsOptions } from './discogsAccount'
import { isLoggedIn } from './auth'

// The drawers' main list (every post as a compact summary). Shared by the drawers and the prefetch below.
export const browseQueryOptions = {
  queryKey: ['posts', 'browse'],
  queryFn: async () => { const r = await fetch(`${API}/posts/browse`); if (!r.ok) throw new Error(r.status); return r.json() },
  staleTime: 60_000,
}

// Drawers used to start their requests when you opened them, so they came up blank for a moment. These are the lists
// the Artists / Labels / Genres / Live drawers need; fetching them once the page is idle means a drawer opens with its
// data already in the cache. prefetchQuery does nothing while the data is still fresh (each query's staleTime).
export function prefetchDrawers(qc) {
  qc.prefetchQuery(browseQueryOptions)
  qc.prefetchQuery(catalogueTotalsOptions)
  if (isLoggedIn()) qc.prefetchQuery(discogsRecordsOptions)
}
