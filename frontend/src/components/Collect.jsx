import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLayout } from '../context/LayoutContext'
import { isLoggedIn, getUser } from '../lib/auth'
import {
  useFeedMode, setFeedMode, feedModeLabel, openWall, openPlaylistFeed, homeMode,
  usePlaylists, playlistsApi, playableTracks, useHearted, useFollowing, useWall, wallsApi, joinApi, useInCommon,
} from '../lib/collections'

// Small UI pieces for walls and playlists (2026-10-03):
// ♡ heart a track (→ Hearted tracks) ·
// "+ list" add tracks to a playlist · names that open walls · follow ·
// "main #N" · the feed switcher.

const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const MENU = {
  position: 'absolute', zIndex: 300, minWidth: 220, maxWidth: 280, padding: 6,
  background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', borderRadius: 14,
  boxShadow: '0 8px 24px rgba(0,0,0,0.3)', fontFamily: SANS, fontSize: 13, letterSpacing: 'normal', textTransform: 'none',
}
const MENU_HEAD = { fontFamily: SANS, fontWeight: 600, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--theme-text-ter)', padding: '8px 10px 4px' }
const plain = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', letterSpacing: 'inherit' }

function askToSignIn(what) {
  if (window.confirm(`Sign in to ${what}?`)) window.location.href = '/login'
}

// Closes a menu on a click anywhere outside it.
function useOutside(ref, open, close) {
  useEffect(() => {
    if (!open) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) close() }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [ref, open, close])
}

function MenuItem({ onClick, children, checked, muted }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 0, borderRadius: 9, textAlign: 'left', cursor: 'pointer', font: 'inherit',
        background: h ? 'color-mix(in srgb, var(--theme-accent) 16%, transparent)' : 'transparent', color: muted ? 'var(--theme-text-sec)' : 'var(--theme-text-pri)' }}>
      {checked !== undefined && <span aria-hidden="true" style={{ width: 14, color: 'var(--theme-accent)', fontWeight: 700 }}>{checked ? '✓' : ''}</span>}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </button>
  )
}

// ♡ / ♥ on a track — in or out of your "Hearted tracks" playlist.
export function TrackHeart({ track, size = 13, offColor = 'inherit', style }) {
  const { has, toggle } = useHearted()
  if (!track?.url) return null
  const on = has(track.url)
  return (
    <button onClick={e => { e.stopPropagation(); if (!isLoggedIn()) return askToSignIn('heart tracks'); toggle(track) }}
      aria-pressed={on} title={on ? 'In Hearted tracks — click to remove' : 'Heart this track (adds it to Hearted tracks)'}
      aria-label={on ? `Unheart ${track.title}` : `Heart ${track.title}`}
      style={{ ...plain, display: 'inline-flex', alignItems: 'center', flexShrink: 0, ...style, color: on ? 'var(--theme-accent)' : offColor }}>
      <span aria-hidden="true" style={{ fontSize: size, lineHeight: 1 }}>{on ? '♥' : '♡'}</span>
    </button>
  )
}

// "+ list" / "+" — add tracks to one of your playlists (yours or one you've
// been invited to). With several tracks, tick which first (all ticked).
// `tracks` defaults to the post's playable tracks.
export function AddToPlaylistButton({ post, tracks: given, label = '+ list', align = 'left', up = true, style }) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(null) // Set of track indexes; null = all
  const [note, setNote] = useState('')
  const ref = useRef(null)
  const qc = useQueryClient()
  const { playlists } = usePlaylists()
  useOutside(ref, open, () => { setOpen(false); setNote('') })
  const tracks = (given || (post ? playableTracks(post) : [])).filter(t => t?.url && t?.title)
  if (!tracks.length) return null
  const chosen = picked ? tracks.filter((_, i) => picked.has(i)) : tracks
  const toggle = i => setPicked(prev => { const s = new Set(prev ?? tracks.map((_, k) => k)); if (s.has(i)) s.delete(i); else s.add(i); return s })
  const lists = playlists.filter(p => p.role)
  async function addTo(id, name) {
    if (!chosen.length) return setNote('Tick at least one track.')
    try {
      const r = await playlistsApi.addTracks(id, chosen)
      setNote(r.added ? `Added ${r.added} to “${name}”${r.skipped ? ` (${r.skipped} already there)` : ''}.` : `Already in “${name}”.`)
      qc.invalidateQueries({ queryKey: ['playlists'] })
      qc.invalidateQueries({ queryKey: ['playlist', id] })
    } catch (err) { setNote(err.message) }
  }
  async function addToNew() {
    const name = window.prompt('Name the new playlist')
    if (!name || !name.trim()) return
    try { const p = await playlistsApi.create(name); await addTo(p.id, p.name) } catch (err) { setNote(err.message) }
  }
  return (
    <span ref={ref} style={{ position: 'relative', flexShrink: 0, display: 'inline-flex' }}>
      <button onClick={e => { e.stopPropagation(); if (!isLoggedIn()) return askToSignIn('make playlists'); setOpen(v => !v) }}
        title={tracks.length > 1 ? 'Add tracks to a playlist' : 'Add to a playlist'} aria-haspopup="menu" aria-expanded={open}
        style={{ ...plain, color: open ? 'var(--theme-accent)' : 'inherit', ...style }}>{label}</button>
      {open && (
        <div role="menu" onClick={e => e.stopPropagation()} style={{ ...MENU, ...(up ? { bottom: 'calc(100% + 8px)' } : { top: 'calc(100% + 6px)' }), [align === 'right' ? 'right' : 'left']: 0, maxHeight: 420, overflowY: 'auto' }}>
          {tracks.length > 1 && <>
            <div style={MENU_HEAD}>Tracks</div>
            {tracks.map((t, i) => (
              <MenuItem key={i} checked={picked ? picked.has(i) : true} onClick={() => toggle(i)}>
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--theme-text-ter)' }}>{t.position || i + 1}</span> {t.title}
              </MenuItem>
            ))}
          </>}
          <div style={MENU_HEAD}>{tracks.length > 1 ? `Add ${chosen.length} to` : `Add “${tracks[0].title}” to`}</div>
          {lists.length === 0 && <div style={{ padding: '4px 10px 6px', color: 'var(--theme-text-sec)' }}>No playlists yet.</div>}
          {lists.map(p => <MenuItem key={p.id} onClick={() => addTo(p.id, p.name)}>{p.kind === 'hearted' ? '♥ ' : ''}{p.name} <span style={{ color: 'var(--theme-text-ter)', fontFamily: MONO, fontSize: 10.5 }}>· {p.track_count}{p.role === 'member' ? ` · ${p.owner}’s` : ''}</span></MenuItem>)}
          <div style={{ height: 1, background: 'var(--theme-border)', margin: '4px 6px' }} />
          <MenuItem muted onClick={addToNew}>+ new playlist…</MenuItem>
          {note && <div style={{ padding: '6px 10px', color: 'var(--theme-accent)', fontFamily: MONO, fontSize: 11 }}>{note}</div>}
        </div>
      )}
    </span>
  )
}

// On "my feed", a post from someone you follow: a small "following" tag
// beside their name, so it's told apart from your own.
// On a wall or in my feed, a post that's there because someone reposted it
// says so instead (2026-10-05): "↻ dan" — dan opens their wall; the card's
// own name is still who posted it, so you meet them through dan.
export function FollowedTag({ post, style }) {
  if (post.viaRepost) return (
    <span title={`Reposted by ${post.viaRepost}`}
      style={{ flexShrink: 0, display: 'inline-flex', gap: 4, alignItems: 'baseline', fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.06em', color: '#fff', background: 'var(--theme-accent)', borderRadius: 99, padding: '2px 8px', whiteSpace: 'nowrap', alignSelf: 'center', ...style }}>
      ↻ <WallLink name={post.viaRepost} style={{ color: '#fff' }} />
    </span>
  )
  if (!post.followedFrom) return null
  return (
    <span title={`From ${post.followedFrom}, who you follow`}
      style={{ flexShrink: 0, fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff', background: 'var(--theme-accent)', borderRadius: 99, padding: '2px 7px', whiteSpace: 'nowrap', alignSelf: 'center', ...style }}>following</span>
  )
}

// ↻ repost (2026-10-05): share someone else's post — onto your wall and
// into your followers' feeds, with "↻ you" on the card. Tap again to undo.
// Not on your own posts, nor ones you posted too (they're on your wall).
export function RepostButton({ post, style }) {
  const qc = useQueryClient()
  const me = getUser()
  const [mine, setMine] = useState(null) // local answer until the feed refreshes
  const [busy, setBusy] = useState(false)
  const reposters = post.repostedBy || []
  if (post.user?.username === me || (post.alsoPostedBy || []).includes(me)) return null
  const on = mine ?? reposters.includes(me)
  const count = reposters.length + (mine === true && !reposters.includes(me) ? 1 : 0) - (mine === false && reposters.includes(me) ? 1 : 0)
  async function click(e) {
    e.stopPropagation()
    if (!isLoggedIn()) return askToSignIn('repost this')
    setBusy(true)
    try {
      await (on ? joinApi.unrepost(post.id) : joinApi.repost(post.id))
      setMine(!on)
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['wall'] })
    } catch (err) { window.alert(err.message) }
    setBusy(false)
  }
  return (
    <button onClick={click} disabled={busy} aria-pressed={on}
      title={on ? 'You reposted this — tap to undo' : 'Repost — share it with the people who follow you'}
      style={{ ...plain, whiteSpace: 'nowrap', opacity: busy ? 0.5 : 1, ...style, ...(on ? { color: 'var(--theme-accent)' } : null) }}>
      ↻ {on ? 'reposted' : 'repost'}{count > 0 ? ` · ${count}` : ''}
    </button>
  )
}

// A username on a card: opens their wall.
export function WallLink({ name, style }) {
  if (!name) return null
  return (
    <button onClick={e => { e.stopPropagation(); openWall(name) }} title={`Open ${name}’s wall`}
      style={{ ...plain, color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }}>{name}</button>
  )
}

// Who wrote a reply (2026-10-05): their name opens their wall, and a quiet
// "+ follow" sits beside it when you don't follow them yet — replies are
// where people meet, so following someone is one tap from what they said.
// Not shown on your own replies, nor to visitors (the wall has the button).
export function CommentAuthor({ name, style }) {
  const qc = useQueryClient()
  const { following } = useFollowing()
  const [state, setState] = useState(null) // null | 'busy' | 'done'
  if (!name) return <span style={style}>anon</span>
  const me = getUser()
  const offer = isLoggedIn() && name !== me && (state === 'done' || !following.some(f => f.username === name))
  async function follow(e) {
    e.stopPropagation()
    setState('busy')
    try { await wallsApi.follow(name); setState('done') } catch (err) { setState(null); window.alert(err.message) }
    qc.invalidateQueries({ queryKey: ['following'] })
    qc.invalidateQueries({ queryKey: ['wall', name] })
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexShrink: 0, ...style }}>
      <WallLink name={name} style={{ fontWeight: 700, color: 'var(--theme-text-pri)' }} />
      {offer && (state === 'done'
        ? <span style={{ fontFamily: MONO, fontSize: '0.8em', color: 'var(--theme-text-ter)' }}>✓ following</span>
        : <button onClick={follow} disabled={state === 'busy'} title={`Follow ${name}`}
            style={{ ...plain, fontFamily: MONO, fontSize: '0.8em', color: 'var(--theme-accent)', opacity: state === 'busy' ? 0.5 : 1 }}>+ follow</button>)}
    </span>
  )
}

// Also posted by (2026-10-04): "& dan" after the poster's name — everyone
// else who posted this release, first one named, the rest as "+2". If
// you're one of them, "you" takes it off your wall again.
export function AlsoPosted({ post, style }) {
  const qc = useQueryClient()
  const names = post.alsoPostedBy || []
  if (!names.length) return null
  const me = getUser()
  const first = names.includes(me) ? me : names[0]
  const rest = names.length - 1
  async function leave(e) {
    e.stopPropagation()
    if (!window.confirm('Take this off your wall?')) return
    try { await joinApi.leave(post.id); qc.invalidateQueries({ queryKey: ['posts'] }); qc.invalidateQueries({ queryKey: ['wall'] }) }
    catch (err) { window.alert(err.message) }
  }
  return (
    <span title={`Also posted by ${names.join(', ')}`} style={{ display: 'inline-flex', gap: 4, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', ...style }}>
      <span aria-hidden="true" style={{ opacity: 0.6 }}>&amp;</span>
      {first === me
        ? <button onClick={leave} title="You posted this too — take it off your wall" style={{ ...plain, color: 'inherit' }}>you</button>
        : <WallLink name={first} />}
      {rest > 0 && <span style={{ opacity: 0.6 }}>+{rest}</span>}
    </span>
  )
}

// On a wall or playlist feed the big number is the post's place in that
// feed; this is its main-feed number, and goes to it there (Feed.jsx).
export function MainNumber({ post, style }) {
  if (post.feedNumber == null) return null
  return (
    <button onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('lnv:jump-main', { detail: post.id })) }}
      title={`Post #${post.id} in everything — go there`}
      style={{ ...plain, color: 'inherit', whiteSpace: 'nowrap', ...style }}>main #{String(post.id).padStart(2, '0')}</button>
  )
}

// Follow / unfollow someone (shown beside the switcher on their wall).
export function FollowButton({ username }) {
  const qc = useQueryClient()
  const { data: wall } = useWall(username)
  const [busy, setBusy] = useState(false)
  if (!wall || wall.is_owner) return null
  const on = !!wall.following
  async function click() {
    if (!isLoggedIn()) return askToSignIn(`follow ${username}`)
    setBusy(true)
    try { await (on ? wallsApi.unfollow(username) : wallsApi.follow(username)) } catch (err) { window.alert(err.message) }
    qc.invalidateQueries({ queryKey: ['wall', username] })
    qc.invalidateQueries({ queryKey: ['following'] })
    setBusy(false)
  }
  return (
    <button onClick={click} disabled={busy} title={on ? `You follow ${username} — click to unfollow` : `Follow ${username}`}
      style={{ background: on ? 'var(--theme-dark3)' : 'var(--theme-accent)', border: '1px solid var(--theme-border)', borderRadius: 99, padding: '7px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', cursor: 'pointer',
        color: on ? 'var(--theme-text-pri)' : '#fff', fontFamily: SANS, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', opacity: busy ? 0.6 : 1 }}>
      {on ? '✓ following' : '+ follow'}{wall.follower_count ? <span style={{ opacity: 0.7, fontWeight: 400 }}> · {wall.follower_count}</span> : null}
    </button>
  )
}

// The first card on a wall (2026-10-05): whose it is, posts and followers,
// follow — and, for someone else's, what you both post (alpha): shared
// artists and labels, rarest first, and records you've both posted. Each
// name opens its drawer; a record goes to its post. `compact` for phones.
export function WallCard({ username, compact = false }) {
  const { openD3, jumpToPost } = useLayout() || {}
  const { data: wall } = useWall(username)
  const { data: common, isLoading } = useInCommon(username)
  const own = !!wall?.is_owner
  const head = { fontFamily: SANS, fontWeight: 600, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--theme-text-ter)', margin: '0 0 8px' }
  const chip = { ...plain, fontFamily: SANS, fontSize: 13, color: 'var(--theme-text-pri)', background: 'color-mix(in srgb, var(--theme-text-pri) 10%, transparent)', padding: '5px 11px', borderRadius: 99 }
  const names = (list, kind) => list.items.length > 0 && (
    <div style={{ marginBottom: 16 }}>
      <div style={head}>{kind} · {list.total}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {list.items.map(n => (
          <button key={n.name} onClick={() => openD3?.(kind, { filter: n.name })} title={`${n.posters} ${n.posters === 1 ? 'person posts' : 'people post'} ${n.name} — open the drawer`} style={chip}>{n.name}</button>
        ))}
      </div>
    </div>
  )
  const nothing = common && !common.self && !common.artists.total && !common.labels.total && !common.records.total
  return (
    <div style={compact ? { padding: '22px 20px' } : { width: 460, height: '100%', boxSizing: 'border-box', padding: '90px 44px 40px', overflowY: 'auto', background: 'var(--theme-showcase)', transition: 'background 0.8s' }}>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: compact ? 34 : 44, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--theme-text-pri)', overflowWrap: 'anywhere' }}>{username}</div>
      <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--theme-text-ter)' }}>
        {wall ? `${wall.post_count} ${wall.post_count === 1 ? 'post' : 'posts'} · ${wall.follower_count} ${wall.follower_count === 1 ? 'follower' : 'followers'}` : '…'}
      </div>
      <div style={{ marginTop: 16, minHeight: 34 }}>
        {own ? <span style={{ fontFamily: SANS, fontSize: 13, color: 'var(--theme-text-sec)' }}>Your wall — everything you post, numbered from 1.</span> : <FollowButton username={username} />}
      </div>
      {!own && (
        <div style={{ marginTop: 28, borderTop: '1px solid var(--theme-border)', paddingTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, color: 'var(--theme-text-pri)' }}>In common with you</span>
            <span title="Alpha — an early, experimental feature" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--theme-showcase)', background: 'var(--theme-text-pri)', borderRadius: 99, padding: '2px 7px' }}>α ALPHA</span>
          </div>
          {!isLoggedIn() ? (
            <button onClick={() => askToSignIn('see what you have in common')} style={{ ...plain, fontFamily: SANS, fontSize: 13, color: 'var(--theme-text-sec)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Sign in to see what you both post</button>
          ) : isLoading || !common ? (
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--theme-text-ter)' }}>…</div>
          ) : nothing ? (
            <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.5, color: 'var(--theme-text-sec)' }}>Nothing in common yet — everything on this wall is new to you.</div>
          ) : (<>
            {names(common.artists, 'artists')}
            {names(common.labels, 'labels')}
            {common.records.items.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={head}>records you both posted · {common.records.total}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {common.records.items.map(r => (
                    <button key={r.id} onClick={() => jumpToPost?.(r.id)} title={`${r.title} — go to it`}
                      style={{ ...plain, width: 56, height: 56, borderRadius: 10, background: r.cover ? `var(--theme-dark2) center/cover no-repeat url("${r.cover}")` : 'var(--theme-dark2)' }} />
                  ))}
                </div>
              </div>
            )}
          </>)}
          <p style={{ margin: '14px 0 0', fontFamily: SANS, fontSize: 11.5, lineHeight: 1.5, color: 'var(--theme-text-ter)' }}>
            Matched only on what you both chose to post — records, artists and labels, the rarer the higher. No likes, plays or listening data.
          </p>
        </div>
      )}
    </div>
  )
}

// Which feed is showing: the main feed, a wall (yours or someone's), or a
// playlist viewed as a feed. Sits beside the search box. `style` moves it
// (the phone top bar, 2026-10-05); `menuLeft` opens the menu from its left edge;
// `noFollow` leaves following to the wall's own card (WallCard).
export function FeedSwitcher({ style, menuLeft = false, noFollow = false }) {
  const mode = useFeedMode()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { openD3 } = useLayout() || {}
  const { following } = useFollowing()
  const { playlists } = usePlaylists()
  const signedIn = isLoggedIn()
  const me = getUser()
  useOutside(ref, open, () => setOpen(false))
  const pick = m => { setFeedMode(m); setOpen(false) }
  const isOn = m => m.type === mode.type && (m.type !== 'wall' || m.username === mode.username) && (m.type !== 'playlist' || (m.id && m.id === mode.id))
  const otherWall = mode.type === 'wall' && mode.username !== me
  const lists = playlists.filter(p => p.track_count > 0).slice(0, 8)
  const atHome = mode.type === homeMode().type
  return (
    <div ref={ref} style={{ position: 'absolute', top: 16, right: 352, zIndex: 100, display: 'flex', gap: 8, alignItems: 'center', ...style }}>
      {otherWall && !noFollow && <FollowButton username={mode.username} />}
      <button onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open} title="Choose a feed"
        style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 240, background: atHome ? 'var(--theme-dark3)' : 'var(--theme-accent)', border: '1px solid var(--theme-border)', borderRadius: 99, padding: '7px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', cursor: 'pointer',
          color: atHome ? 'var(--theme-text-pri)' : '#fff', fontFamily: SANS, fontSize: 12.5, fontWeight: 600 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feedModeLabel(mode)}</span>
        <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.8 }}>▼</span>
      </button>
      {open && (
        <div role="menu" style={{ ...MENU, top: 'calc(100% + 8px)', ...(menuLeft ? { left: 0 } : { right: 0 }), maxHeight: '70vh', overflowY: 'auto' }}>
          <MenuItem checked={isOn({ type: 'home' })} onClick={() => pick({ type: 'home' })}>{signedIn ? 'my feed' : 'front page'} <span style={{ color: 'var(--theme-text-ter)', fontFamily: MONO, fontSize: 10.5 }}>· {signedIn ? 'you + who you follow' : 'start here'}</span></MenuItem>
          {signedIn ? <MenuItem checked={isOn({ type: 'wall', username: me })} onClick={() => pick({ type: 'wall', username: me })}>my wall <span style={{ color: 'var(--theme-text-ter)', fontFamily: MONO, fontSize: 10.5 }}>· your posts</span></MenuItem>
            : <MenuItem muted onClick={() => askToSignIn('get your own wall')}>my wall — sign in</MenuItem>}
          {otherWall && <MenuItem checked onClick={() => setOpen(false)}>{feedModeLabel(mode)}</MenuItem>}
          {mode.type === 'playlist' && !mode.id && <MenuItem checked onClick={() => setOpen(false)}>{feedModeLabel(mode)}</MenuItem>}
          {signedIn && <>
            <div style={MENU_HEAD}>Following</div>
            {following.length === 0 && <div style={{ padding: '4px 10px 6px', color: 'var(--theme-text-sec)' }}>No one yet — open someone’s wall and follow them.</div>}
            {following.map(f => <MenuItem key={f.id} checked={isOn({ type: 'wall', username: f.username })} onClick={() => pick({ type: 'wall', username: f.username })}>{f.username} <span style={{ color: 'var(--theme-text-ter)', fontFamily: MONO, fontSize: 10.5 }}>· {f.post_count}</span></MenuItem>)}
            <div style={MENU_HEAD}>Playlists as a feed</div>
            {lists.length === 0 && <div style={{ padding: '4px 10px 6px', color: 'var(--theme-text-sec)' }}>None with tracks yet.</div>}
            {lists.map(p => <MenuItem key={p.id} checked={isOn({ type: 'playlist', id: p.id })} onClick={() => { openPlaylistFeed(p); setOpen(false) }}>{p.kind === 'hearted' ? '♥ ' : ''}{p.name}</MenuItem>)}
            <div style={{ height: 1, background: 'var(--theme-border)', margin: '4px 6px' }} />
            <MenuItem muted onClick={() => { setOpen(false); openD3?.('playlists') }}>playlists…</MenuItem>
            <MenuItem muted onClick={() => { setOpen(false); openD3?.('walls') }}>walls & following…</MenuItem>
          </>}
          {/* Everything, every post, unfiltered (2026-10-04): kept for the
              hardcore, but deliberately quiet — feeds are you + who you follow. */}
          <div style={{ height: 1, background: 'var(--theme-border)', margin: '4px 6px' }} />
          <MenuItem muted checked={isOn({ type: 'main' })} onClick={() => pick({ type: 'main' })}>everything <span style={{ fontFamily: MONO, fontSize: 10.5 }}>· every post, unfiltered</span></MenuItem>
        </div>
      )}
    </div>
  )
}
