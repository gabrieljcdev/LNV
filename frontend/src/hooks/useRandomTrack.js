import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '../lib/api.js'

export function useRandomTrack() {
  return useMutation({
    mutationFn: () => apiFetch('/api/tracks/random'),
  })
}
