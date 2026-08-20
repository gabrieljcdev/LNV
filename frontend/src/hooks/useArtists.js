import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api.js'

export function useArtists() {
  return useQuery({
    queryKey: ['artists'],
    queryFn:  () => apiFetch('/api/artists'),
    staleTime: 1000 * 60 * 10,
  })
}

export function useArtist(name) {
  return useQuery({
    queryKey: ['artist', name],
    queryFn:  () => apiFetch(`/api/artists/${encodeURIComponent(name)}`),
    enabled:  !!name,
  })
}

export function useGenres() {
  return useQuery({
    queryKey: ['genres'],
    queryFn:  () => apiFetch('/api/genres'),
    staleTime: 1000 * 60 * 10,
  })
}
