// How a listener listens (2026-10-08, gabriel): which services they can play FULL tracks on, so
// the feed offers those first. A site cannot see someone's subscriptions on other services, so
// this is built from three things:
//   1. what they tell us — ticked in the "listen" panel (the order they tick = their priority);
//   2. what the players show — a Spotify embed that reports a 30-second duration is a preview
//      (not signed in as Premium); one that reports the real length is full (TrackPlayer.jsx);
//   3. nothing else: YouTube Premium (no ads) cannot be detected from the page, so it is only
//      what they tell us.
// Kept in the browser (works signed out) and, when signed in, on the account
// (GET/PUT /api/users/me/listening) so it follows them between devices.
import { useState, useEffect, useCallback } from 'react'
import { authHeaders, isLoggedIn } from './auth'
import { platformOf } from './sources'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const KEY = 'lnv-listening'
const EVENT = 'lnv-listening-change'

// Spotify, Deezer and Apple Music embeds play 30-second previews unless the listener is signed in
// there with a subscription; YouTube, SoundCloud and Bandcamp play whole tracks for everyone.
export const PREVIEW_ONLY = new Set(['spotify', 'deezer', 'apple'])

export const LISTEN_SERVICES = [
  { id: 'spotify', name: 'Spotify', plan: 'Premium', note: 'Full tracks need you signed in to Spotify with Premium in this browser.' },
  { id: 'apple', name: 'Apple Music', plan: 'subscription', note: 'Full tracks need you signed in to Apple Music in this browser.' },
  { id: 'deezer', name: 'Deezer', plan: 'Premium', note: 'Full tracks need you signed in to Deezer in this browser.' },
  { id: 'youtube', name: 'YouTube', plan: 'Premium', note: 'Plays in full for everyone — Premium only removes the ads. We cannot detect it, so tell us.' },
  { id: 'soundcloud', name: 'SoundCloud', plan: 'Go+', note: 'Plays in full for most tracks; Go+ unlocks the rest.' },
  { id: 'bandcamp', name: 'Bandcamp', plan: 'fan account', note: 'Plays in full; a fan account lifts the play limit.' },
]

const EMPTY = { have: [], signals: {} }

export function readListening() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    return v && Array.isArray(v.have) ? { have: v.have, signals: v.signals || {} } : EMPTY
  } catch { return EMPTY }
}

let pushTimer = null
function pushToAccount(v) {
  if (!isLoggedIn()) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    fetch(`${API}/users/me/listening`, { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(v) }).catch(() => {})
  }, 600)
}
function writeListening(v, { push = true } = {}) {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT))
  if (push) pushToAccount(v)
}

// Signed in: take the account's copy once per page load (this device's copy goes up if the account has none).
let synced = false
async function syncWithAccount() {
  if (synced || !isLoggedIn()) return
  synced = true
  try {
    const res = await fetch(`${API}/users/me/listening`, { headers: authHeaders() })
    if (!res.ok) return
    const { listening } = await res.json()
    const local = readListening()
    if (listening && (listening.have.length || Object.keys(listening.signals || {}).length)) writeListening(listening, { push: false })
    else if (local.have.length || Object.keys(local.signals).length) pushToAccount(local)
  } catch { /* offline — keep the local copy */ }
}

/** [listening, { toggle, clear }] — shared by every card and the panel. */
export function useListening() {
  const [v, setV] = useState(readListening)
  useEffect(() => {
    const on = () => setV(readListening())
    window.addEventListener(EVENT, on)
    syncWithAccount()
    return () => window.removeEventListener(EVENT, on)
  }, [])
  // Ticking adds a service to the end of their priority list; unticking removes it.
  const toggle = useCallback(id => {
    const cur = readListening()
    writeListening({ ...cur, have: cur.have.includes(id) ? cur.have.filter(x => x !== id) : [...cur.have, id] })
  }, [])
  const clear = useCallback(() => writeListening({ have: [], signals: {} }), [])
  return [v, { toggle, clear }]
}

/** What a player showed: 'full' or 'preview' (Spotify). Called from TrackPlayer, no hook needed. */
export function recordPlayback(service, kind) {
  if (!['full', 'preview'].includes(kind)) return
  const cur = readListening()
  const prev = cur.signals[service] || { full: 0, preview: 0 }
  if (prev.last === kind && prev[kind] >= 3) return // already well established
  writeListening({ ...cur, signals: { ...cur.signals, [service]: { full: prev.full + (kind === 'full' ? 1 : 0), preview: prev.preview + (kind === 'preview' ? 1 : 0), last: kind } } })
}

/** The services to try first, in order: what they ticked, then any service a player has shown them full tracks on. */
export function priorityServices(l) {
  const sig = l.signals || {}
  const seen = Object.entries(sig).filter(([, v]) => v?.last === 'full').map(([k]) => k)
  // Ticked, but its player only ever showed 30-second previews (not signed in here): not tried first
  // until a full track plays — picking it by hand plays it again and re-tests.
  const usable = l.have.filter(p => !(PREVIEW_ONLY.has(p) && sig[p]?.last === 'preview'))
  return [...usable, ...seen.filter(p => !usable.includes(p))]
}

/**
 * The link to play for a track.
 *  1. the source they picked by hand (`pref`), when the track has it;
 *  2. the first service in their priority list that has the track;
 *  3. the track's own link — unless that is a 30-second preview they have no sign-in for and a full source exists;
 *  4. whatever there is.
 */
export function pickUrl(track, listening, pref) {
  const own = track.stream_url || track.youtube_url || null
  const ownP = platformOf(own)
  const list = [...(track.sources || [])]
  if (own && ownP && !list.some(s => s.platform === ownP)) list.push({ platform: ownP, url: own, full: !PREVIEW_ONLY.has(ownP) })
  const by = p => list.find(s => s.platform === p)
  if (pref && by(pref)) return by(pref).url
  const mine = priorityServices(listening || EMPTY)
  for (const p of mine) if (by(p)) return by(p).url
  if (ownP && !(PREVIEW_ONLY.has(ownP) && !mine.includes(ownP))) return own
  const full = list.find(s => !PREVIEW_ONLY.has(s.platform))
  return full ? full.url : own
}
