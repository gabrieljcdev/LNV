import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api.js'
import { getUser } from '../lib/auth.js'

export function useMyCrates() {
  const username = getUser()
  return useQuery({
    queryKey: ['crates', 'mine', username],
    queryFn:  () => apiFetch(`/api/crates/mine?username=${username}`),
    enabled:  !!username,
  })
}

export function usePublicCrates() {
  return useQuery({
    queryKey: ['crates', 'public'],
    queryFn:  () => apiFetch('/api/crates/public'),
  })
}

export function useCrate(id) {
  return useQuery({
    queryKey: ['crate', id],
    queryFn:  () => apiFetch(`/api/crates/${id}`),
    enabled:  !!id,
  })
}

export function useCrateRecords(id) {
  return useQuery({
    queryKey: ['crate-records', id],
    queryFn:  () => apiFetch(`/api/crates/${id}/records`),
    enabled:  !!id,
  })
}

export function useCreateCrate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => apiFetch('/api/crates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crates'] }),
  })
}

export function useAddToCrate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ crateId, postId }) => apiFetch(`/api/crates/${crateId}/records`, {
      method: 'POST',
      body: JSON.stringify({ post_id: postId }),
    }),
    onSuccess: (_, { crateId }) => qc.invalidateQueries({ queryKey: ['crate-records', crateId] }),
  })
}
