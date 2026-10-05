import { useEffect, useRef, useState } from 'react'
import { useLayout } from '../context/LayoutContext'
import { usePhone } from '../lib/usePhone'
import { PHONE_NAV_H } from './PhoneNav'
import { claimPlayback } from '../lib/playerGuard'
import { useQueue, queue, currentTrack, platformOf, queueEmbed, seconds, loadYouTube, loadSoundCloud, loadMixcloud } from '../lib/queue'

// The playlist player (2026-10-03): a small floating card, bottom right,
// that plays the queue (lib/queue) straight through — and keeps playing
// while you scroll the feed or open and close drawers. Its own controls:
// previous / next, shuffle, repeat, hide the video, close.

const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"

// One track's player. Tells the queue when the track ends (or can't play).
function Frame({ track, playKey, height }) {
  const ref = useRef(null)
  const [hint, setHint] = useState('')
  const kind = platformOf(track)
  const embed = queueEmbed(track)

  useEffect(() => {
    const frame = ref.current
    let done = false, timer = null
    const ended = () => { if (!done) { done = true; queue.next(true) } }
    const skip = why => { if (!done) { done = true; queue.skip(why) } }
    setHint('')
    if (!embed) {
      const t = setTimeout(() => skip('it can’t play here'), 1200)
      return () => clearTimeout(t)
    }
    claimPlayback(frame) // stop anything playing on the feed
    const cleanups = []
    if (kind === 'youtube') {
      loadYouTube().then(YT => {
        if (done || !ref.current) return
        new YT.Player(ref.current, {
          events: {
            onStateChange: e => { if (e.data === YT.PlayerState.ENDED) ended() },
            // 2 bad id, 5 html5 error, 100 removed, 101/150 embedding not allowed
            onError: e => skip(e.data === 101 || e.data === 150 ? 'its owner doesn’t allow playing it here' : 'YouTube couldn’t play it'),
          },
        })
      })
    } else if (kind === 'soundcloud') {
      loadSoundCloud().then(Widget => {
        if (done || !ref.current) return
        const w = Widget(ref.current)
        w.bind(window.SC.Widget.Events.FINISH, ended)
        w.bind(window.SC.Widget.Events.ERROR, () => skip('SoundCloud couldn’t play it'))
      }).catch(() => setHint('Couldn’t reach SoundCloud — press next when it ends.'))
    } else if (kind === 'mixcloud') {
      loadMixcloud().then(PlayerWidget => {
        if (done || !ref.current) return
        const w = PlayerWidget(ref.current)
        w.ready.then(() => w.events.ended.on(ended))
      }).catch(() => setHint('Couldn’t reach Mixcloud — press next when it ends.'))
    } else if (kind === 'bandcamp') {
      // No API and no autoplay: time it from when you press play in its
      // player (focus moving into the frame), using the stored length.
      const secs = seconds(track.duration)
      setHint(secs ? 'Press play on Bandcamp — the queue moves on when it ends.' : 'Press play on Bandcamp, then next when it ends (no track length to time it).')
      if (secs) {
        const onBlur = () => setTimeout(() => {
          if (!timer && document.activeElement === ref.current) {
            timer = setTimeout(ended, (secs + 2) * 1000)
            setHint('Playing — the queue moves on when it ends.')
          }
        }, 0)
        window.addEventListener('blur', onBlur)
        cleanups.push(() => window.removeEventListener('blur', onBlur))
      }
    }
    return () => { done = true; clearTimeout(timer); cleanups.forEach(f => f()) }
    // playKey restarts the effect (and the frame) for each new track / replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey])

  if (!embed) return <div style={{ padding: '10px 12px', fontFamily: SANS, fontSize: 13, color: 'var(--theme-text-sec)' }}>Can’t play here — skipping…</div>
  return <>
    <div style={{ height, overflow: 'hidden', transition: 'height 0.2s' }}>
      <iframe key={playKey} ref={ref} src={embed.src} title={track.title} allow="autoplay; encrypted-media"
        style={{ display: 'block', width: '100%', height: embed.h, border: 0 }} />
    </div>
    {hint && <div style={{ padding: '6px 12px 0', fontFamily: MONO, fontSize: 10.5, color: 'var(--theme-accent)' }}>{hint}</div>}
  </>
}

function Ctl({ onClick, label, on, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={on}
      style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--theme-border)', background: on ? 'var(--theme-accent)' : 'transparent', color: on ? '#fff' : 'var(--theme-text-pri)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1, fontSize: 12, display: 'grid', placeItems: 'center', flexShrink: 0, padding: 0 }}>{children}</button>
  )
}

export default function QueueBar() {
  const q = useQueue()
  const { setCurrentTrack, openD3 } = useLayout() || {}
  const [small, setSmall] = useState(false)
  const phone = usePhone()
  const track = currentTrack(q)
  // Starting the queue closes the random-track player (one player at a time).
  useEffect(() => { if (track) setCurrentTrack?.(null) }, [track, setCurrentTrack])
  if (!q.list) return null
  const total = q.order.length
  const upNext = q.pos >= 0 && q.pos + 1 < total ? q.tracks[q.order[q.pos + 1]] : (q.repeat === 'all' && total ? q.tracks[q.order[0]] : null)
  const kind = track ? platformOf(track) : null
  const embed = track ? queueEmbed(track) : null
  const videoH = small ? 0 : (embed?.h || 0)
  return (
    <div role="region" aria-label="Playlist player"
      // Phones: full width, just above the bottom nav (2026-10-05).
      style={{ position: 'fixed', right: 16, bottom: 64, zIndex: 60, width: 320, ...(phone ? { left: 8, right: 8, width: 'auto', bottom: `calc(${PHONE_NAV_H + 8}px + env(safe-area-inset-bottom))` } : null), background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', borderRadius: 18, boxShadow: '0 10px 30px rgba(0,0,0,0.35)', overflow: 'hidden', fontFamily: SANS, color: 'var(--theme-text-pri)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '10px 12px 6px' }}>
        <button onClick={() => openD3?.('playlists', q.list.id ? { open: q.list.id } : { token: q.list.token })} title="Open the playlist"
          style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 600, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--theme-text-ter)', flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ▶ {q.list.name}
        </button>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--theme-text-ter)' }}>{q.pos >= 0 ? `${q.pos + 1} / ${total}` : `${total} tracks`}</span>
        <button onClick={() => setSmall(v => !v)} aria-label={small ? 'Show the player' : 'Hide the player'} title={small ? 'Show the player' : 'Hide the player (keeps playing)'}
          style={{ border: 0, background: 'none', color: 'var(--theme-text-sec)', cursor: 'pointer', fontSize: 12, padding: 0 }}>{small ? '▴' : '▾'}</button>
        <button onClick={queue.close} aria-label="Close the player" title="Stop and close"
          style={{ border: 0, background: 'none', color: 'var(--theme-text-sec)', cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1 }}>×</button>
      </div>
      {track ? <Frame key={`${q.pos}:${q.nonce}:${track.id}`} track={track} playKey={`${q.pos}:${q.nonce}:${track.id}`} height={videoH} />
        : <div style={{ padding: '6px 12px', fontSize: 13, color: 'var(--theme-text-sec)' }}>{q.note || 'Stopped.'}</div>}
      <div style={{ padding: '8px 12px 4px', minWidth: 0 }}>
        {track && <div style={{ fontWeight: 700, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}{track.artist && <span style={{ fontWeight: 400, fontStyle: 'italic', color: 'var(--theme-text-sec)' }}> — {track.artist}</span>}</div>}
        {track && <div style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--theme-text-ter)', marginTop: 2 }}>
          {kind || 'link'}{track.duration ? ` · ${track.duration}` : ''}{upNext ? ` · next: ${upNext.title}` : ''}
        </div>}
        {track && q.note && <div style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--theme-accent)', marginTop: 4 }}>{q.note}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 12px 12px' }}>
        <Ctl onClick={queue.prev} label="Previous track" disabled={q.pos <= 0}>⏮</Ctl>
        {q.pos >= 0
          ? <Ctl onClick={queue.stop} label="Stop">■</Ctl>
          : <Ctl onClick={() => queue.start(q.list, q.tracks, q.order[0] ?? 0)} label="Play from the top">▶</Ctl>}
        <Ctl onClick={() => queue.next(false)} label="Next track" disabled={q.pos < 0}>⏭</Ctl>
        <span style={{ flex: 1 }} />
        <Ctl onClick={queue.toggleShuffle} label={q.shuffle ? 'Shuffle on' : 'Shuffle off'} on={q.shuffle}>⇄</Ctl>
        <Ctl onClick={queue.cycleRepeat} label={q.repeat === 'off' ? 'Repeat off' : q.repeat === 'all' ? 'Repeat the playlist' : 'Repeat this track'} on={q.repeat !== 'off'}>{q.repeat === 'one' ? '↻1' : '↻'}</Ctl>
      </div>
    </div>
  )
}
