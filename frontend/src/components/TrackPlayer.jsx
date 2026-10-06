import { useRef, useEffect } from 'react'
import { claimPlayback } from '../lib/playerGuard'

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
export default function TrackPlayer({ src, onEnded, title, autoplay = false }) {
  const ref = useRef(null)
  const endedRef = useRef(onEnded)
  useEffect(() => { endedRef.current = onEnded })
  const isYT = /youtube\.com\/embed\//.test(src)
  const finalSrc = isYT
    ? `${src}${src.includes('?') ? '&' : '?'}enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}${autoplay ? '&autoplay=1' : ''}`
    : src
  // A player started by a click (autoplay) stops every other one on the page.
  useEffect(() => { if (autoplay) claimPlayback(ref.current) }, [finalSrc, autoplay])
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
  return (
    <iframe ref={ref} src={finalSrc}
      style={{ width: '100%', height: '100%', border: 'none' }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen title={title} />
  )
}
