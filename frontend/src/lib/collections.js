// Favourites, walls, following and playlists (2026-10-03) — the client side
// of backend/routes/favourites.js, walls.js and playlists.js. Cached lists
// (['favourites'], ['playlists'], ['playlists','hearted'], ['following'])
// feed every star, heart and menu, so they stay in step everywhere.
//
// The model: a main feed; everyone's wall (the posts they made, public);
// following other users to keep their walls a click away; playlists of
// tracks — shareable read-only by link, editable by friends you invite, and
// viewable as a feed of the posts their tracks come from. ♡ on a track puts
// it in your "Hearted tracks" playlist; ☆ saves a record, artist or label to
// your favourites (the digging history).

import { useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authHeaders, isLoggedIn, getUser } from './auth'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

async function call(method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(data.error || 'Something went wrong. Try again.'); e.status = r.status; throw e }
  return data
}

// ── keys ──────────────────────────────────────────────────────────────────────
// Must match the backend's: artists and labels by lower-cased name (how the
// drawers group them), records as post:<id> / release:<id> / master:<id>.
export const nameKey = name => String(name || '').trim().toLowerCase()
export const favKey = (kind, keyOrName) => kind === 'record' ? keyOrName : nameKey(keyOrName)

// ── favourites (☆) ────────────────────────────────────────────────────────────
export function useFavourites() {
  const signedIn = isLoggedIn()
  const q = useQuery({
    queryKey: ['favourites'],
    queryFn: () => call('GET', '/favourites').then(d => d.items),
    enabled: signedIn,
    staleTime: 60_000,
  })
  const items = signedIn ? (q.data || []) : []
  const index = new Set(items.map(i => `${i.kind}|${i.key}`))
  return { items, isLoading: signedIn && q.isLoading, has: (kind, key) => index.has(`${kind}|${favKey(kind, key)}`) }
}

// Save / unsave, updating every star at once.
export function useToggleFavourite() {
  const qc = useQueryClient()
  return async function toggle(fav, on) {
    const key = favKey(fav.kind, fav.key ?? fav.name)
    const prev = qc.getQueryData(['favourites']) || []
    qc.setQueryData(['favourites'], on
      ? [{ ...fav, key, meta: fav.meta || {}, created_at: new Date().toISOString().slice(0, 19).replace('T', ' ') }, ...prev.filter(i => !(i.kind === fav.kind && i.key === key))]
      : prev.filter(i => !(i.kind === fav.kind && i.key === key)))
    try {
      if (on) await call('POST', '/favourites', { ...fav, key })
      else await call('DELETE', '/favourites', { kind: fav.kind, key, name: fav.name })
    } catch (err) {
      qc.setQueryData(['favourites'], prev)
      window.alert(`Couldn't save that: ${err.message}`)
    } finally {
      qc.invalidateQueries({ queryKey: ['favourites'] })
    }
  }
}

export const favouritesApi = { fresh: () => call('GET', '/favourites/fresh') }

// ── which feed is showing ─────────────────────────────────────────────────────
// { type: 'home' } — "my feed": your posts + the people you follow; the
// home view once signed in (the main feed is the home view for visitors) |
// { type: 'main' } | { type: 'wall', username } |
// { type: 'playlist', id?, token?, name } — a playlist viewed as a feed, by
// id (yours / invited) or by its share link's token (anyone).
// Kept in localStorage so the site reopens on the feed you left it on;
// signing in or out starts again from the home view (lib/auth).
const MODE_KEY = 'lnv_feed_mode'
const MAIN = { type: 'main' }
export const homeMode = () => (isLoggedIn() ? { type: 'home' } : MAIN)
let mode = (() => {
  try {
    const m = JSON.parse(localStorage.getItem(MODE_KEY) || 'null')
    if (!m) return homeMode()
    if (m.type === 'main') return MAIN
    if (m.type === 'home' && isLoggedIn()) return m
    if (m.type === 'wall' && m.username) return m
    if (m.type === 'playlist' && (m.token || (m.id && isLoggedIn()))) return m
    return homeMode()
  } catch { return homeMode() }
})()
const listeners = new Set()

export function setFeedMode(next) {
  mode = next && next.type !== 'main' ? next : MAIN
  try { localStorage.setItem(MODE_KEY, JSON.stringify(mode)) } catch { /* ignore */ }
  listeners.forEach(l => l())
}
export const goHome = () => setFeedMode(homeMode())

export function useFeedMode() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => mode)
}

export function feedModeLabel(m) {
  if (m.type === 'wall') return m.username === getUser() ? 'my wall' : `${m.username}’s wall`
  if (m.type === 'playlist') return `▶ ${m.name || 'playlist'}`
  if (m.type === 'home') return 'my feed'
  return 'main feed'
}
export const openWall = username => setFeedMode({ type: 'wall', username })
export const openPlaylistFeed = p => setFeedMode({ type: 'playlist', id: p.id || undefined, token: p.token || undefined, name: p.name })

// ── walls + following ─────────────────────────────────────────────────────────
export function useWall(username) {
  return useQuery({
    queryKey: ['wall', username],
    queryFn: () => call('GET', `/walls/${encodeURIComponent(username)}`),
    enabled: !!username,
    staleTime: 60_000,
  })
}
export function useFollowing() {
  const signedIn = isLoggedIn()
  const q = useQuery({
    queryKey: ['following'],
    queryFn: () => call('GET', '/walls/me/following').then(d => d.following),
    enabled: signedIn,
    staleTime: 60_000,
  })
  return { following: signedIn ? (q.data || []) : [], isLoading: signedIn && q.isLoading }
}
export const wallsApi = {
  follow: username => call('POST', `/walls/${encodeURIComponent(username)}/follow`),
  unfollow: username => call('DELETE', `/walls/${encodeURIComponent(username)}/follow`),
}
export const wallLink = username => `${window.location.origin}/?wall=${encodeURIComponent(username)}`

// ── playlists ─────────────────────────────────────────────────────────────────
export function usePlaylists() {
  const signedIn = isLoggedIn()
  const q = useQuery({
    queryKey: ['playlists'],
    queryFn: () => call('GET', '/playlists').then(d => d.playlists),
    enabled: signedIn,
    staleTime: 60_000,
  })
  return { playlists: signedIn ? (q.data || []) : [], isLoading: signedIn && q.isLoading }
}
export const playlistsApi = {
  create: name => call('POST', '/playlists', { name }),
  get: id => call('GET', `/playlists/${id}`),
  shared: token => call('GET', `/playlists/shared/${encodeURIComponent(token)}`),
  rename: (id, name) => call('PATCH', `/playlists/${id}`, { name }),
  remove: id => call('DELETE', `/playlists/${id}`),
  share: (id, renew = false) => call('POST', `/playlists/${id}/share`, { renew }),
  invite: (id, renew = false) => call('POST', `/playlists/${id}/invite`, { renew }),
  preview: token => call('GET', `/playlists/join/${encodeURIComponent(token)}`),
  join: token => call('POST', `/playlists/join/${encodeURIComponent(token)}`),
  leave: id => call('POST', `/playlists/${id}/leave`),
  removeMember: (id, userId) => call('DELETE', `/playlists/${id}/members/${userId}`),
  addTracks: (id, tracks) => call('POST', `/playlists/${id}/tracks`, { tracks }),
  removeTrack: (id, trackId) => call('DELETE', `/playlists/${id}/tracks/${trackId}`),
  moveTrack: (id, trackId, dir) => call('POST', `/playlists/${id}/tracks/${trackId}/move`, { dir }),
}
export const playlistLink = token => `${window.location.origin}/?playlist=${token}`
export const playlistInviteLink = token => `${window.location.origin}/?playlistinvite=${token}`

// ♡ on a track: in / out of your "Hearted tracks" playlist (made on first use).
export function useHearted() {
  const signedIn = isLoggedIn()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['playlists', 'hearted'],
    queryFn: () => call('GET', '/playlists/hearted'),
    enabled: signedIn,
    staleTime: 60_000,
  })
  const urls = new Set(signedIn ? (q.data?.urls || []) : [])
  async function toggle(track) {
    const on = !urls.has(track.url)
    const prev = qc.getQueryData(['playlists', 'hearted'])
    qc.setQueryData(['playlists', 'hearted'], old => ({ ...(old || {}), urls: on ? [...(old?.urls || []), track.url] : (old?.urls || []).filter(u => u !== track.url) }))
    try {
      if (on) await call('POST', '/playlists/hearted', { track })
      else await call('DELETE', '/playlists/hearted', { url: track.url })
    } catch (err) {
      qc.setQueryData(['playlists', 'hearted'], prev)
      window.alert(`Couldn't save that: ${err.message}`)
    } finally {
      qc.invalidateQueries({ queryKey: ['playlists'] })
      qc.invalidateQueries({ queryKey: ['playlist'] })
    }
  }
  return { has: url => urls.has(url), toggle }
}

// A post's track as a playlist entry.
export function trackFrom(post, t) {
  const artist = post.artists?.[0]?.artist_name || post.artists?.[0]?.name || ''
  return { post_id: post.id, position: t.position || null, title: t.title, artist, url: t.stream_url || t.youtube_url || '', embed_url: t.embed_url || null, duration: t.duration || null, cover: post.thumb_image || post.cover_image || null }
}

// The playable tracks of a post, as playlist entries: each tracklist row
// with a link, or — a set, a single with no tracklist — the post itself.
export function playableTracks(post) {
  const rows = (post.tracks || []).map(t => trackFrom(post, t)).filter(t => t.url && t.title)
  if (rows.length) return rows
  return post.stream_url ? [{ ...trackFrom(post, { title: post.title, stream_url: post.stream_url, embed_url: post.embed_url }), position: null }] : []
}
