// Walls, following and playlists (2026-10-03) — the client side of
// backend/routes/walls.js and playlists.js. Cached lists (['playlists'],
// ['playlists','hearted'], ['following']) feed every heart and menu, so
// they stay in step everywhere.
//
// The model: a main feed; everyone's wall (the posts they made, public);
// following other users to keep their walls a click away; playlists of
// tracks — shareable read-only by link, editable by friends you invite, and
// viewable as a feed of the posts their tracks come from. ♥ on a record
// keeps it on your wall (2026-10-06, joinApi).

import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authHeaders, isLoggedIn, getUser } from './auth'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

async function call(method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(data.error || 'Something went wrong. Try again.'); e.status = r.status; throw e }
  return data
}

// ── which feed is showing ─────────────────────────────────────────────────────
// { type: 'home' } — the home view: signed in, "my feed" (your posts + the
// people you follow); signed out, the front page (the first friend's wall —
// see firstFriend in the backend) |
// { type: 'main' } — everything, every post; a quiet option for the
// hardcore (2026-10-04) | { type: 'wall', username } |
// { type: 'playlist', id?, token?, name } — a playlist viewed as a feed, by
// id (yours / invited) or by its share link's token (anyone).
// Kept in localStorage so the site reopens on the feed you left it on;
// signing in or out starts again from the home view (lib/auth).
const MODE_KEY = 'lnv_feed_mode'
const MAIN = { type: 'main' }
const HOME = { type: 'home' }
export const homeMode = () => HOME
let mode = (() => {
  try {
    const m = JSON.parse(localStorage.getItem(MODE_KEY) || 'null')
    if (!m) return homeMode()
    if (m.type === 'main') return MAIN
    if (m.type === 'home') return HOME
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
  if (m.type === 'home') return isLoggedIn() ? 'my feed' : 'front page'
  return 'everything'
}
export const openWall = username => setFeedMode({ type: 'wall', username })
// Also posted by (2026-10-04): put a release that's already up on your wall
// too, or take it off again. Both return the updated post.
export const joinApi = {
  join: postId => call('POST', `/posts/${postId}/join`),
  leave: postId => call('DELETE', `/posts/${postId}/join`),
}
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
// A profile (2026-10-05): the wall's card — public, with the owner's
// editing choices when it's yours (backend routes/walls.js).
export function useProfile(username) {
  return useQuery({
    queryKey: ['wall', username, 'profile'],
    queryFn: () => call('GET', `/walls/${encodeURIComponent(username)}/profile`),
    enabled: !!username,
    staleTime: 60_000,
  })
}
// Favourites (2026-10-06): ♥ by an artist's, label's or channel's name —
// three lists (artist / label / channel), on your profile. Signed in only.
export function useFavourites() {
  const signedIn = isLoggedIn()
  const q = useQuery({ queryKey: ['favourites'], queryFn: () => call('GET', '/walls/me/favourites'), enabled: signedIn, staleTime: 60_000 })
  const lists = (signedIn && q.data) || { artist: [], label: [], channel: [] }
  const has = (kind, name) => (lists[kind] || []).some(n => n.toLowerCase() === String(name || '').toLowerCase())
  return { lists, has }
}
export const favouritesApi = {
  set: (kind, name, on) => call('PUT', '/walls/me/favourites', { kind, name, on }),
}
export const profileApi = {
  bio: bio => call('PATCH', '/walls/me/profile', { bio }),
  showPlaylist: (id, shown) => call('PUT', `/walls/me/playlists/${id}`, { shown }),
}

// What you and a wall's owner both post (alpha, 2026-10-05) — signed in only.
export function useInCommon(username) {
  const signedIn = isLoggedIn()
  return useQuery({
    queryKey: ['wall', username, 'common'],
    queryFn: () => call('GET', `/walls/${encodeURIComponent(username)}/common`),
    enabled: !!username && signedIn,
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
