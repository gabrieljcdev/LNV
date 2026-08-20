import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api.js'

export function useFeedPosts(limit = 50) {
  return useQuery({
    queryKey: ['feed-posts', limit],
    queryFn:  () => apiFetch(`/api/netlink/posts?limit=${limit}`),
  })
}
