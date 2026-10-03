// The playlist queue (2026-10-03): plays a playlist straight through, one
// track after another, across YouTube, SoundCloud, Mixcloud and Bandcamp.
// One queue for the whole site (a tiny store, like the feed mode in
// lib/collections), played by QueueBar — which sits outside the drawers, so
// the music keeps going while you browse.
//
// How each player says a track has ended:
//   YouTube     IFrame Player API, ENDED state (errors → skip)
//   SoundCloud  Widget API, FINISH event (errors → skip)
//   Mixcloud    Widget API, `ended` event
//   Bandcamp    no API: the track's stored length, timed from when you press
//               play (its player can't autoplay)
// Anything else can't play in the page and is skipped.

import { useSyncExternalStore } from 'react'

let state = {
  list: null,        // { id?, token?, name }
  tracks: [],        // playlist tracks (as the API returns them)
  order: [],         // indexes into tracks, in play order (shuffled or not)
  pos: -1,           // place in `order`; -1 = stopped
  shuffle: false,
  repeat: 'off',     // 'off' | 'all' | 'one'
  nonce: 0,          // bumps to restart the same track (repeat one)
  note: '',
}
const listeners = new Set()
function set(patch) { state = { ...state, ...patch }; listeners.forEach(l => l()) }

export function useQueue() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => state)
}
export const currentTrack = s => (s.pos >= 0 ? s.tracks[s.order[s.pos]] || null : null)

function shuffled(n, first) {
  const rest = [...Array(n).keys()].filter(i => i !== first)
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]] }
  return first == null ? rest : [first, ...rest]
}

export const queue = {
  // Play `list` from track index `start`.
  start(list, tracks, start = 0) {
    if (!tracks.length) return
    const order = state.shuffle ? shuffled(tracks.length, start) : [...tracks.keys()]
    set({ list, tracks, order, pos: order.indexOf(start), nonce: state.nonce + 1, note: '' })
  },
  // `auto`: the track ended by itself (repeat-one replays it).
  next(auto = false) {
    if (state.pos < 0) return
    if (auto && state.repeat === 'one') return set({ nonce: state.nonce + 1 })
    if (state.pos + 1 < state.order.length) return set({ pos: state.pos + 1, note: '' })
    if (state.repeat === 'all') {
      const order = state.shuffle ? shuffled(state.tracks.length, null) : state.order
      return set({ order, pos: 0, nonce: state.nonce + 1 })
    }
    set({ pos: -1, note: 'End of the playlist.' })
  },
  prev() { if (state.pos > 0) set({ pos: state.pos - 1, note: '' }) },
  // Something can't play: say so and move on.
  skip(reason) {
    const t = currentTrack(state)
    queue.next(false)
    set({ note: `Skipped “${t?.title || 'a track'}” — ${reason}` })
  },
  toggleShuffle() {
    const on = !state.shuffle
    if (state.pos < 0) return set({ shuffle: on })
    const cur = state.order[state.pos]
    const order = on ? shuffled(state.tracks.length, cur) : [...state.tracks.keys()]
    set({ shuffle: on, order, pos: order.indexOf(cur) })
  },
  cycleRepeat() { set({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' }) },
  stop() { set({ pos: -1, note: '' }) },
  close() { set({ list: null, tracks: [], order: [], pos: -1, note: '' }) },
  // The playlist changed (tracks added / removed / moved) while it plays:
  // keep the current track playing and the rest in the new order.
  sync(listId, tracks) {
    if (!state.list?.id || state.list.id !== listId || state.pos < 0) return
    const curId = currentTrack(state)?.id
    const at = tracks.findIndex(t => t.id === curId)
    if (at < 0) return set({ tracks, order: [...tracks.keys()], pos: -1, note: 'The track playing was removed.' })
    const order = state.shuffle ? shuffled(tracks.length, at) : [...tracks.keys()]
    set({ tracks, order, pos: order.indexOf(at) })
  },
}

// ── players ───────────────────────────────────────────────────────────────────

export function platformOf(t) {
  const u = t?.url || ''
  if (/(?:youtube\.com|youtu\.be)/i.test(u)) return 'youtube'
  if (/soundcloud\.com/i.test(u)) return 'soundcloud'
  if (/mixcloud\.com/i.test(u)) return 'mixcloud'
  if (t?.embed_url && /bandcamp\.com\/EmbeddedPlayer/i.test(t.embed_url)) return 'bandcamp'
  return null
}

// The embed for a track, set up to autoplay and to report back.
export function queueEmbed(t) {
  const u = t.url || ''
  switch (platformOf(t)) {
    case 'youtube': {
      const id = u.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/)?.[1]
      return id ? { src: `https://www.youtube.com/embed/${id}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&origin=${encodeURIComponent(window.location.origin)}`, h: 180 } : null
    }
    case 'soundcloud':
      return { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u)}&auto_play=true&color=%23e85d04&hide_related=true&show_comments=false&visual=false`, h: 120 }
    case 'mixcloud':
      return { src: `https://www.mixcloud.com/widget/iframe/?hide_cover=1&mini=1&autoplay=1&feed=${encodeURIComponent(u.replace(/^https?:\/\/(www\.)?mixcloud\.com/i, ''))}`, h: 60 }
    case 'bandcamp':
      return { src: t.embed_url.replace(/size=large/, 'size=small'), h: 42 }
    default:
      return null
  }
}

// "5:35" / "1:02:03" → seconds (0 if unknown).
export function seconds(d) {
  const parts = String(d || '').trim().split(':').map(Number)
  if (!parts.length || parts.some(n => !Number.isFinite(n))) return 0
  return parts.reduce((s, n) => s * 60 + n, 0)
}

const scripts = {}
function loadScript(src, ready) {
  if (ready()) return Promise.resolve(ready())
  if (!scripts[src]) {
    scripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = () => resolve(ready())
      s.onerror = reject
      document.head.appendChild(s)
    })
  }
  return scripts[src]
}

// YouTube's API calls a global when it's ready; chain onto it (Feed.jsx and
// PlayerContext load the same API the same way).
let ytReady = null
export function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!ytReady) {
    ytReady = new Promise(resolve => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement('script')
        s.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(s)
      }
      // Already loaded by someone else between the check and now.
      const t = setInterval(() => { if (window.YT?.Player) { clearInterval(t); resolve(window.YT) } }, 300)
    })
  }
  return ytReady
}
export const loadSoundCloud = () => loadScript('https://w.soundcloud.com/player/api.js', () => window.SC?.Widget)
export const loadMixcloud = () => loadScript('https://widget.mixcloud.com/media/js/widgetApi.js', () => window.Mixcloud?.PlayerWidget)
