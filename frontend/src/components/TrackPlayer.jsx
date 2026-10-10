import { useRef, useEffect } from 'react'
import { claimPlayback, registerSpotify } from '../lib/playerGuard'
import { recordPlayback } from '../lib/listening'

// ── TrackPlayer (2026-09-25) ─────────────────────────────────────────────────
// An embed iframe that can say when its track has finished, so an album
// plays through. YouTube only — via the official IFrame Player API
// (loaded once, on first use), attached to our own iframe (enablejsapi=1),
// which needs no DOM swap. Other platforms render as a plain iframe:
// SoundCloud's widget API could do the same later; Bandcamp's embed gives no
// end signal. The player is never destroy()ed here — React owns the iframe
// and removes it itself (destroy() would pull it out from under React).
let ytApiPromise = null
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!ytApiPromise) {
    ytApiPromise = new Promise(resolve => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
    })
  }
  return ytApiPromise
}
// Spotify (2026-10-08): its embed is created through Spotify's own iFrame API so we can see what
// it plays. A preview reports a 30-second duration, a full track its real length — which tells us
// whether this listener is signed in to Spotify with Premium (lib/listening.js recordPlayback).
let spApiPromise = null
function loadSpotifyApi() {
  if (window.__lnvSpotifyApi) return Promise.resolve(window.__lnvSpotifyApi)
  if (!spApiPromise) {
    spApiPromise = new Promise(resolve => {
      const prev = window.onSpotifyIframeApiReady
      window.onSpotifyIframeApiReady = api => { window.__lnvSpotifyApi = api; prev?.(api); resolve(api) }
      const s = document.createElement('script')
      s.src = 'https://open.spotify.com/embed/iframe-api/v1'
      s.async = true
      document.body.appendChild(s)
    })
  }
  return spApiPromise
}
export default function TrackPlayer({ src, onEnded, title, autoplay = false }) {
  const ref = useRef(null)
  const spHolder = useRef(null)
  const spMatch = src.match(/open\.spotify\.com\/embed\/(track|album)\/([A-Za-z0-9]+)/)
  const isSp = !!spMatch
  const endedRef = useRef(onEnded)
  useEffect(() => { endedRef.current = onEnded })
  const isYT = /youtube\.com\/embed\//.test(src)
  const finalSrc = isYT
    ? `${src}${src.includes('?') ? '&' : '?'}enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}${autoplay ? '&autoplay=1' : ''}`
    : src
  // A player started by a click (autoplay) stops every other one on the page.
  useEffect(() => { if (autoplay) claimPlayback(isSp ? spHolder.current : ref.current) }, [finalSrc, autoplay, isSp])
  useEffect(() => {
    if (!isYT) return
    let cancelled = false
    loadYouTubeApi().then(YT => {
      if (cancelled || !ref.current) return
      new YT.Player(ref.current, {
        events: { onStateChange: e => { if (e.data === YT.PlayerState.ENDED) endedRef.current?.() } },
      })
    })
    return () => { cancelled = true }
  }, [finalSrc, isYT])
  useEffect(() => {
    if (!isSp) return undefined
    let cancelled = false, ctrl = null, inner = null, reported = false, unregister = null, wasPlaying = false, lastPos = 0, lastDur = 0, ended = false
    loadSpotifyApi().then(api => {
      if (cancelled || !spHolder.current) return
      inner = document.createElement('div')
      spHolder.current.appendChild(inner)
      api.createController(inner, { uri: `spotify:${spMatch[1]}:${spMatch[2]}`, width: '100%', height: '100%' }, c => {
        if (cancelled) { try { c.destroy?.() } catch { /* gone */ } return }
        ctrl = c
        unregister = registerSpotify(c, spHolder.current)
        c.addListener('playback_update', e => {
          const d = e?.data
          // Pressed play inside the Spotify embed: everything else on the page stops.
          const nowPlaying = !!d && !d.isPaused
          if (nowPlaying && !wasPlaying) claimPlayback(spHolder.current, c)
          wasPlaying = nowPlaying
          // The track finished: it stops by itself with the position at (or reset from) the very end.
          if (d && !ended && d.duration) {
            const nearEnd = lastDur > 0 && lastPos >= lastDur - 2500
            if ((d.isPaused && nearEnd && d.position < lastPos - 1000) || (d.position >= d.duration - 400 && d.position > 0)) {
              ended = true
              endedRef.current?.()
            }
            if (!ended) { lastPos = d.position; lastDur = d.duration }
          }
          if (reported || !d || d.isPaused || !d.duration) return
          reported = true
          recordPlayback('spotify', d.duration >= 29000 && d.duration <= 31500 ? 'preview' : 'full')
        })
        if (autoplay) c.addListener('ready', () => { try { c.play() } catch { /* needs a click */ } })
      })
    })
    return () => { cancelled = true; unregister?.(); try { ctrl?.destroy?.() } catch { /* already gone */ } inner?.remove() }
  }, [finalSrc, isSp]) // eslint-disable-line react-hooks/exhaustive-deps
  if (isSp) return <div ref={spHolder} style={{ width: '100%', height: '100%' }} />
  return (
    <iframe ref={ref} src={finalSrc}
      style={{ width: '100%', height: '100%', border: 'none' }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen title={title} />
  )
}
