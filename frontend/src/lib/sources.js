// Where a track can be played, and which one this listener prefers
// (2026-10-07, gabriel: "let them pick source"). Each track from the API carries
// `sources` — [{ platform, url, title, full }], best first — found in the
// background (backend/services/trackSources.js). `full` = plays the whole track
// for everyone; Spotify, Deezer and Apple are usually 30-second previews unless
// the listener is signed in to that service.
import { useState, useEffect, useCallback } from 'react'

export const SOURCE_SHORT = { youtube: 'YT', soundcloud: 'SC', bandcamp: 'BC', spotify: 'SP', deezer: 'DZ', apple: 'AM' }
export const SOURCE_NAME = { youtube: 'YouTube', soundcloud: 'SoundCloud', bandcamp: 'Bandcamp', spotify: 'Spotify', deezer: 'Deezer', apple: 'Apple Music' }

const KEY = 'lnv-source'
const EVENT = 'lnv-source-change'
export const getSourcePref = () => { try { return localStorage.getItem(KEY) || '' } catch { return '' } }

/** [preferred platform, setter] — shared by every card on the page. */
export function useSourcePref() {
  const [pref, setPrefState] = useState(getSourcePref)
  useEffect(() => {
    const on = () => setPrefState(getSourcePref())
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  const setPref = useCallback(p => {
    try { localStorage.setItem(KEY, p || '') } catch { /* private mode */ }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [pref, setPref]
}

/** The link to play for a track: the listener's preferred source when the track has it, else its own link. */
export function urlForTrack(t, pref) {
  const own = t.stream_url || t.youtube_url || null
  if (!pref) return own
  return (t.sources || []).find(s => s.platform === pref)?.url || own
}

/** Platform of a URL, for the source chips. */
export function platformOf(url) {
  if (/youtube\.com|youtu\.be/i.test(url || '')) return 'youtube'
  if (/soundcloud\.com/i.test(url || '')) return 'soundcloud'
  if (/bandcamp\.com/i.test(url || '')) return 'bandcamp'
  if (/spotify\.com/i.test(url || '')) return 'spotify'
  if (/deezer\.com/i.test(url || '')) return 'deezer'
  if (/music\.apple\.com/i.test(url || '')) return 'apple'
  return null
}
