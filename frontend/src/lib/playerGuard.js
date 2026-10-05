// One player at a time across the whole feed (gabriel, 2026-10-02).
//
// Every player is a cross-origin iframe (YouTube, SoundCloud, Bandcamp,
// Mixcloud), so the page never sees a click on a play button inside one.
// What it does see: clicking into an iframe moves focus to it, and the
// window blurs. That iframe is the one being played; every other iframe
// that may be playing is stopped:
//   YouTube     -> postMessage pauseVideo (embeds carry enablejsapi=1)
//   SoundCloud  -> postMessage { method: 'pause' } (widget API)
//   others      -> no pause API (Bandcamp, Mixcloud): the iframe is
//                  reloaded, which stops it at the start of the track
// Players a card starts itself (autoplay on a track click) claim playback
// the same way, through claimPlayback().

// Iframes that have been clicked into or autoplayed — the only ones that
// can be playing, so the only ones a reload could ever need to stop.
const maybePlaying = new WeakSet()

function stop(frame) {
  const src = frame.getAttribute('src') || ''
  try {
    if (/youtube(-nocookie)?\.com\/embed\//.test(src)) {
      frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*')
    } else if (/w\.soundcloud\.com\/player/.test(src)) {
      frame.contentWindow?.postMessage(JSON.stringify({ method: 'pause' }), '*')
    } else if (maybePlaying.has(frame)) {
      // Same src again restarts the document: playback stops.
      frame.setAttribute('src', src)
      maybePlaying.delete(frame)
    }
  } catch { /* a frame mid-navigation — nothing to stop */ }
}

/** `frame` is now the one playing: stop every other player on the page. */
export function claimPlayback(frame) {
  if (!frame) return
  maybePlaying.add(frame)
  for (const other of document.querySelectorAll('iframe')) {
    if (other !== frame) stop(other)
  }
}

/**
 * Watch for clicks into players. Returns the cleanup.
 * The window blurs on the FIRST click into a player; a click from one player
 * straight into another fires nothing in this page, but document.
 * activeElement switches to the new iframe — so it's also polled.
 */
export function installPlayerGuard() {
  let last = null
  const check = () => {
    const el = document.activeElement
    if (el?.tagName !== 'IFRAME') { last = null; return }
    if (el !== last) { last = el; claimPlayback(el) }
  }
  // activeElement is the iframe only once the focus move settles.
  const onBlur = () => setTimeout(check, 0)
  window.addEventListener('blur', onBlur)
  const poll = setInterval(check, 400)
  return () => { window.removeEventListener('blur', onBlur); clearInterval(poll) }
}

/**
 * The player for one track: its own embed when it has one (Bandcamp tracks
 * carry it — their page URL can't be embedded), else built from its link.
 */
export function trackEmbedSrc(track, toEmbedSrc) {
  if (track?.embed_url && /bandcamp\.com\/EmbeddedPlayer/.test(track.embed_url)) return track.embed_url
  return toEmbedSrc(track?.stream_url || track?.youtube_url || '')
}
