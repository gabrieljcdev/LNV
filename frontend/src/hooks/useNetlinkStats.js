import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api.js'

export function useNetlinkStats() {
  return useQuery({
    queryKey: ['netlink-stats'],
    queryFn:  () => apiFetch('/api/netlink/stats'),
    staleTime: 1000 * 60,
  })
}
