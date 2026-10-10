import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLayout } from '../context/LayoutContext'
import { DiscogsSetting } from './DiscogsConnect'
import { askText } from './Dialogs'
import { isLoggedIn, getUser } from '../lib/auth'
import {
  useFeedMode, setFeedMode, feedModeLabel, openWall, openPlaylistFeed, homeMode,
  usePlaylists, playlistsApi, playableTracks, useFollowing, useWall, wallsApi, joinApi, useInCommon,
  useProfile, profileApi, wallLink, useFavourites, favouritesApi, useIntroSettings, introApi, useProperChannels, useFrontPageOwner, communityApi,
} from '../lib/collections'

// Small UI pieces for walls and playlists (2026-10-03):
// ♥ keep a record · ♥ favourite artists, labels, channels ·
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


// "+ list" / "+" — add tracks to one of your playlists (yours or one you've
// been invited to). With several tracks, tick which first (all ticked).
// `tracks` defaults to the post's playable tracks.
export function AddToPlaylistButton({ post, tracks: given, label = '+ list', align = 'left', up = true, style }) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(null) // Set of track indexes; null = all
  const [note, setNote] = useState('')
  const [flash, setFlash] = useState(null) // '✓' after a one-tap add
  const ref = useRef(null)
  const menuRef = useRef(null)
  const qc = useQueryClient()
  const { playlists } = usePlaylists()
  // The menu is drawn over the whole page (a portal), not inside the card:
  // cards clip what spills past their edges, which cut it off (gabriel,
  // 2026-10-06). It sits by the button, kept on screen — above unless
  // there's no room — and closes if anything else scrolls or resizes.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect(), m = menuRef.current
    if (!open || !r || !m) return
    const w = m.offsetWidth, h = m.offsetHeight, gap = 8, vw = window.innerWidth, vh = window.innerHeight
    const left = Math.min(Math.max(gap, align === 'right' ? r.right - w : r.left), vw - w - gap)
    const roomAbove = r.top - gap * 2, roomBelow = vh - r.bottom - gap * 2
    const above = up ? (roomAbove >= Math.min(h, 240) || roomAbove > roomBelow) : roomBelow < Math.min(h, 240) && roomAbove > roomBelow
    Object.assign(m.style, above
      ? { left: `${left}px`, top: 'auto', bottom: `${vh - r.top + gap}px`, maxHeight: `${Math.min(420, roomAbove)}px` }
      : { left: `${left}px`, bottom: 'auto', top: `${r.bottom + 6}px`, maxHeight: `${Math.min(420, roomBelow)}px` })
    m.style.visibility = 'visible'
  }, [open, align, up, note, picked])
  useEffect(() => {
    if (!open) return
    const close = () => { setOpen(false); setNote('') }
    const away = e => { if (!ref.current?.contains(e.target) && !menuRef.current?.contains(e.target)) close() }
    const moved = e => { if (!menuRef.current?.contains(e.target)) close() }
    document.addEventListener('pointerdown', away)
    window.addEventListener('scroll', moved, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('scroll', moved, true)
      window.removeEventListener('resize', close)
    }
  }, [open])
  const tracks = (given || (post ? playableTracks(post) : [])).filter(t => t?.url && t?.title)
  if (!tracks.length) return null
  const chosen = picked ? tracks.filter((_, i) => picked.has(i)) : tracks
  const toggle = i => setPicked(prev => { const s = new Set(prev ?? tracks.map((_, k) => k)); if (s.has(i)) s.delete(i); else s.add(i); return s })
  // Tracks can't be added to the Discogs collection / wantlist lists (they hold records): left out of the menu.
  const lists = playlists.filter(p => p.role && p.release_count == null)
  async function addTo(id, name) {
    if (!chosen.length) return setNote('Tick at least one track.')
    try {
      const r = await playlistsApi.addTracks(id, chosen)
      setNote(r.added ? `Added ${r.added} to “${name}”${r.skipped ? ` (${r.skipped} already there)` : ''}.` : `Already in “${name}”.`)
      qc.invalidateQueries({ queryKey: ['playlists'] })
      qc.invalidateQueries({ queryKey: ['playlist', id] })
    } catch (err) { setNote(err.message) }
  }
  // One tap (2026-10-06, gabriel): a single track goes straight into your
  // default playlist while it's your only one; with more, the menu asks.
  const onlyDefault = lists.length === 1 && lists[0].is_default ? lists[0] : null
  async function quickAdd() {
    try {
      const r = await playlistsApi.addTracks(onlyDefault.id, tracks)
      setFlash(r.added ? '✓' : '·')
      qc.invalidateQueries({ queryKey: ['playlists'] })
      qc.invalidateQueries({ queryKey: ['playlist', onlyDefault.id] })
    } catch (err) { window.alert(err.message) }
    setTimeout(() => setFlash(null), 1600)
  }
  async function addToNew() {
    const name = await askText({ title: 'Name the new playlist', placeholder: 'e.g. Techno, Sunday mornings', ok: 'Create', maxLength: 60 })
    if (!name || !name.trim()) return
    try { const p = await playlistsApi.create(name); await addTo(p.id, p.name) } catch (err) { setNote(err.message) }
  }
  return (
    <span ref={ref} style={{ position: 'relative', flexShrink: 0, display: 'inline-flex' }}>
      <button onClick={e => { e.stopPropagation(); if (!isLoggedIn()) return askToSignIn('make playlists'); if (onlyDefault && tracks.length === 1) return quickAdd(); setOpen(v => !v) }}
        title={flash === '✓' ? `Added to “${onlyDefault?.name}”` : flash ? `Already in “${onlyDefault?.name}”` : onlyDefault && tracks.length === 1 ? `Add to “${onlyDefault.name}”` : tracks.length > 1 ? 'Add tracks to a playlist' : 'Add to a playlist'}
        aria-haspopup={onlyDefault && tracks.length === 1 ? undefined : 'menu'} aria-expanded={onlyDefault && tracks.length === 1 ? undefined : open}
        style={{ ...plain, color: open || flash ? 'var(--theme-accent)' : 'inherit', ...style }}>{flash ? (flash === '✓' ? '✓' : label) : label}</button>
      {flash && <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{flash === '✓' ? `Added to ${onlyDefault?.name}` : `Already in ${onlyDefault?.name}`}</span>}
      {open && createPortal(
        <div ref={menuRef} role="menu" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
          style={{ ...MENU, position: 'fixed', zIndex: 1100, overflowY: 'auto', left: 0, top: 0, visibility: 'hidden' }}>
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
          {lists.map(p => <MenuItem key={p.id} onClick={() => addTo(p.id, p.name)}>{p.name} <span style={{ color: 'var(--theme-text-ter)', fontFamily: MONO, fontSize: 10.5 }}>· {p.track_count}{p.is_default && p.role === 'owner' ? ' · default' : ''}{p.role === 'member' ? ` · ${p.owner}’s` : ''}</span></MenuItem>)}
          <div style={{ height: 1, background: 'var(--theme-border)', margin: '4px 6px' }} />
          <MenuItem muted onClick={addToNew}>+ new playlist…</MenuItem>
          {note && <div style={{ padding: '6px 10px', color: 'var(--theme-accent)', fontFamily: MONO, fontSize: 11 }}>{note}</div>}
        </div>,
        document.body
      )}
    </span>
  )
}

// On "my feed", a post from someone you follow: a small "following" tag
// beside their name, so it's told apart from your own.
export function FollowedTag({ post, style }) {
  if (!post.followedFrom) return null
  return (
    <span title={`From ${post.followedFrom}, who you follow`}
      style={{ flexShrink: 0, fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff', background: 'var(--theme-accent)', borderRadius: 99, padding: '2px 7px', whiteSpace: 'nowrap', alignSelf: 'center', ...style }}>following</span>
  )
}

// ♥ (2026-10-06): keep a record — it goes on your wall and into your
// followers' feeds; tap again to take it off. One act for what were
// "post it too" and repost: every record is already here, so you keep it
// rather than post it again. The count is how many people have it on their
// wall; on your own post the heart is simply on. Who else has it shows as
// "& dan" beside the poster (AlsoPosted).
export function HeartButton({ post, size, style }) {
  const qc = useQueryClient()
  const me = getUser()
  const [mine, setMine] = useState(null) // local answer until the feed refreshes
  const [busy, setBusy] = useState(false)
  const others = post.alsoPostedBy || []
  const own = !!me && post.user?.username === me
  const had = others.includes(me)
  const on = own || (mine ?? had)
  const count = 1 + others.length + (mine === true && !had ? 1 : 0) - (mine === false && had ? 1 : 0)
  async function click(e) {
    e.stopPropagation()
    if (own) return
    if (!isLoggedIn()) return askToSignIn('keep records in your feed')
    setBusy(true)
    try {
      await (on ? joinApi.leave(post.id) : joinApi.join(post.id))
      setMine(!on)
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['wall'] })
    } catch (err) { window.alert(err.message) }
    setBusy(false)
  }
  return (
    <button onClick={click} disabled={busy} aria-pressed={on}
      title={own ? 'Your post — it’s in your feed' : on ? 'In your feed — tap to take it out' : 'Keep it — in your feed and your followers’ feeds'}
      style={{ ...plain, whiteSpace: 'nowrap', cursor: own ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, ...style, ...(on ? { color: 'var(--theme-accent)' } : null) }}>
      <span style={size ? { fontSize: size } : null}>{on ? '♥' : '♡'}</span>{count > 1 ? ` ${count}` : ''}
    </button>
  )
}

// ♥ by an artist's, label's or channel's name (2026-10-06): add it to
// your favourite artists / labels / channels — three lists, on your
// profile. Tap again to take it off. Visitors are asked to sign in.
// Channels (2026-10-05): only proper ones (useProperChannels) get a ♡ —
// one already ♥'d keeps its ♥ so it can still be taken off.
export function FavHeart({ kind, name, size, onChange, onColor = 'var(--theme-accent)', style }) {
  const qc = useQueryClient()
  const { has } = useFavourites()
  const proper = useProperChannels()
  const [busy, setBusy] = useState(false)
  if (!name) return null
  const on = has(kind, name)
  if (kind === 'channel' && !on && !proper.has(name.toLowerCase())) return null
  const what = { artist: 'artists', label: 'labels', channel: 'channels' }[kind]
  async function click(e) {
    e.stopPropagation()
    if (!isLoggedIn()) return askToSignIn(`keep favourite ${what}`)
    setBusy(true)
    try {
      qc.setQueryData(['favourites'], await favouritesApi.set(kind, name, !on))
      qc.invalidateQueries({ queryKey: ['wall'] })
      onChange?.()
    } catch (err) { window.alert(err.message) }
    setBusy(false)
  }
  return (
    <button onClick={click} disabled={busy} aria-pressed={on}
      aria-label={on ? `Remove ${name} from your favourite ${what}` : `Add ${name} to your favourite ${what}`}
      title={on ? `In your favourite ${what} — tap to remove` : `Add to your favourite ${what}`}
      style={{ ...plain, lineHeight: 1, opacity: busy ? 0.5 : 1, fontSize: size, ...style, ...(on && onColor ? { color: onColor } : null) }}>{on ? '♥' : '♡'}</button>
  )
}

// A username on a card: opens their wall.
export function WallLink({ name, style }) {
  if (!name) return null
  return (
    <button onClick={e => { e.stopPropagation(); openWall(name) }} title={`Open ${name}’s feed`}
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
    if (!window.confirm('Take this out of your feed?')) return
    try { await joinApi.leave(post.id); qc.invalidateQueries({ queryKey: ['posts'] }); qc.invalidateQueries({ queryKey: ['wall'] }) }
    catch (err) { window.alert(err.message) }
  }
  return (
    <span title={`Also posted by ${names.join(', ')}`} style={{ display: 'inline-flex', gap: 4, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', ...style }}>
      <span aria-hidden="true" style={{ opacity: 0.6 }}>&amp;</span>
      {first === me
        ? <button onClick={leave} title="You posted this too — take it out of your feed" style={{ ...plain, color: 'inherit' }}>you</button>
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

// The profile (2026-10-05, from the "LNV Profile Mockup" gabriel picked) —
// the first card on a wall. One card, three views:
// - everyone: picture (an initial for now), name, member since, posts and
//   followers, bio; their sound (top styles), labels, artists and channels
//   (their ♥ favourites first), the playlists they chose to show;
// - signed in: follow, who you follow that follows them, In common (alpha);
// - the owner: edit the bio, un-♥ favourites, tick which playlists show,
//   numbers only they see, and "View as visitor" to check the public card.
// Everything about someone's taste comes from what they chose to post.
// `compact` stacks it for phones.
export function WallCard({ username, compact = false, friends }) {
  const qc = useQueryClient()
  const { openD3, jumpToPost } = useLayout() || {}
  const { data: p } = useProfile(username)
  const { data: common, isLoading: commonLoading } = useInCommon(p && !p.is_owner ? username : null)
  const [asVisitor, setAsVisitor] = useState(false)
  const [bioDraft, setBioDraft] = useState(null) // null = not editing
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [newList, setNewList] = useState(null) // null = closed; else the name being typed
  const refresh = () => qc.invalidateQueries({ queryKey: ['wall', username, 'profile'] })
  async function act(fn) {
    setBusy(true)
    try { await fn(); await refresh() } catch (err) { window.alert(err.message) }
    setBusy(false)
  }

  const pri = 'var(--theme-text-pri)', sec = 'var(--theme-text-sec)', ter = 'var(--theme-text-ter)'
  const fill = n => `color-mix(in srgb, var(--theme-text-pri) ${n}%, transparent)`
  const head = { margin: '0 0 9px', fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: ter }
  const chip = { ...plain, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: compact ? 14 : 13, color: pri, padding: compact ? '8px 13px' : '6px 12px', borderRadius: 99, background: fill(12) }
  const shell = compact
    ? { padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20, color: pri, fontFamily: SANS }
    : { width: 800, height: '100%', boxSizing: 'border-box', padding: '90px 48px 40px', overflowY: 'auto', background: 'var(--theme-showcase)', transition: 'background 0.8s', color: pri, fontFamily: SANS, display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', gap: 44, alignContent: 'start' }
  const cardTag = { 'data-profile-card': username === getUser() ? 'me' : 'other' } // "My profile" scrolls here (Feed.jsx)
  if (!p) return <div {...cardTag} style={shell}><div style={{ fontFamily: MONO, fontSize: 11, color: ter }}>…</div></div>

  const owner = p.is_owner && !asVisitor
  const preview = p.is_owner && asVisitor
  const signedIn = isLoggedIn()
  const since = (() => { try { return new Date(p.member_since.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) } catch { return '' } })()
  const max = Math.max(1, ...p.sound.map(x => x.count))
  const sectionTitle = (t, note) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: compact ? 16 : 17, fontWeight: 700 }}>{t}</h2>
      {note && <span style={{ fontFamily: MONO, fontSize: 10.5, color: ter }}>{note}</span>}
    </div>
  )

  const identity = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {preview && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12, background: fill(12), fontSize: 13 }}>
          <span style={{ flex: 1 }}>How others see your profile</span>
          <button onClick={() => setAsVisitor(false)} style={{ ...plain, fontWeight: 700, color: pri, textDecoration: 'underline', textUnderlineOffset: 3 }}>Back to editing</button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: compact ? 'center' : 'flex-start', flexDirection: compact ? 'row' : 'column', gap: 14 }}>
        <div aria-hidden="true" style={{ flexShrink: 0, width: compact ? 64 : 88, height: compact ? 64 : 88, borderRadius: '50%', background: pri, color: 'var(--theme-showcase)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 32 : 44, fontWeight: 900 }}>{p.username.charAt(0).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: compact ? 38 : 52, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}>{p.username}</h1>
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: ter, lineHeight: 1.6 }}>
            {!compact && since && <>Member since {since}<br /></>}
            {p.post_count} {p.post_count === 1 ? 'post' : 'posts'} · {p.follower_count} {p.follower_count === 1 ? 'follower' : 'followers'}
          </div>
        </div>
      </div>
      {bioDraft != null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: ter }} htmlFor={`bio-${username}`}>A line about your sound</label>
          <textarea id={`bio-${username}`} value={bioDraft} maxLength={280} rows={3} autoFocus onChange={e => setBioDraft(e.target.value)}
            style={{ resize: 'vertical', borderRadius: 12, border: `1px solid ${fill(30)}`, background: fill(8), color: pri, padding: '10px 12px', fontFamily: SANS, fontSize: 16, lineHeight: 1.45 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button disabled={busy} onClick={() => act(async () => { await profileApi.bio(bioDraft); setBioDraft(null) })}
              style={{ border: 0, borderRadius: 99, padding: '9px 18px', background: pri, color: 'var(--theme-showcase)', fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setBioDraft(null)} style={{ ...plain, color: sec, fontSize: 14 }}>Cancel</button>
            <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10.5, color: ter }}>{280 - bioDraft.length}</span>
          </div>
        </div>
      ) : p.bio ? (
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: sec, overflowWrap: 'anywhere' }}>{p.bio}</p>
      ) : owner ? (
        <button onClick={() => setBioDraft('')} style={{ ...plain, textAlign: 'left', fontSize: 15, fontStyle: 'italic', color: ter }}>Add a line about your sound…</button>
      ) : null}

      {owner ? (bioDraft == null && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setBioDraft(p.bio || '')} style={{ border: 0, borderRadius: 99, padding: '11px 20px', background: pri, color: 'var(--theme-showcase)', fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Edit profile</button>
          <button onClick={() => setAsVisitor(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${fill(40)}`, borderRadius: 99, padding: '10px 16px', background: 'transparent', color: pri, fontFamily: SANS, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>View as visitor
          </button>
        </div>
      )) : preview ? (
        <button disabled title="Visitors can follow you here" style={{ alignSelf: 'flex-start', border: 0, borderRadius: 99, padding: '11px 22px', background: pri, color: 'var(--theme-showcase)', fontFamily: SANS, fontSize: 14, fontWeight: 700, opacity: 0.7 }}>+ follow</button>
      ) : signedIn ? (
        <div style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: compact ? 'center' : 'flex-start', gap: 12 }}>
          <FollowButton username={username} />
          {p.followedBy?.total > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: ter }}>
              Followed by {p.followedBy.names.join(' and ')}{p.followedBy.total > p.followedBy.names.length ? ` and ${p.followedBy.total - p.followedBy.names.length} other${p.followedBy.total - p.followedBy.names.length === 1 ? '' : 's'}` : ''} you follow
            </span>
          )}
        </div>
      ) : (<>
        <button onClick={() => askToSignIn(`follow ${username}`)} style={{ alignSelf: 'flex-start', border: `1px solid ${fill(50)}`, borderRadius: 99, padding: '10px 20px', background: 'transparent', color: pri, fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Sign in to follow</button>
        <button onClick={() => { navigator.clipboard?.writeText(wallLink(username)).then(() => setCopied(true)).catch(() => {}) }}
          style={{ ...plain, alignSelf: 'flex-start', fontFamily: MONO, fontSize: 11, color: ter, textAlign: 'left' }}>{copied ? '✓ link copied' : 'Copy a link to this profile'}</button>
      </>)}

      {owner && friends && (
        // My feed's switch (2026-10-06): you + who you follow, or just you.
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: fill(10), cursor: 'pointer' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>Friends' posts</span>
            <span style={{ display: 'block', fontSize: 12, color: ter, marginTop: 2 }}>{friends.on ? 'Your feed: you + who you follow' : 'Your feed: just your posts'}</span>
          </span>
          <input type="checkbox" role="switch" checked={friends.on} onChange={e => friends.set(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
          <span aria-hidden="true" style={{ flexShrink: 0, width: 42, height: 24, borderRadius: 99, background: friends.on ? pri : fill(25), position: 'relative', transition: 'background 0.2s' }}>
            <span style={{ position: 'absolute', top: 3, left: friends.on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: friends.on ? 'var(--theme-showcase)' : pri, transition: 'left 0.2s' }} />
          </span>
        </label>
      )}
      {owner && friends && <IntroSettings pri={pri} ter={ter} fill={fill} />}
      {owner && friends && <BoardsSetting pri={pri} ter={ter} fill={fill} />}
      {owner && friends && <DiscogsSetting pri={pri} ter={ter} fill={fill} />}

      {owner && p.private && (
        <div style={{ marginTop: 6, padding: 14, borderRadius: 16, border: `1px dashed ${fill(35)}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: ter, marginBottom: 8 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>Only you see this
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            ♥ by {p.private.hearted} {p.private.hearted === 1 ? 'person' : 'people'}<br />
            {p.private.replies} {p.private.replies === 1 ? 'reply' : 'replies'} on your posts
          </div>
        </div>
      )}
    </div>
  )

  // A list led by favourites (♥): labels, artists, channels. Owners can
  // un-♥ from here; everyone else just opens the drawer.
  const favChips = (list, kind, drawer) => list.map(x => (
    <span key={x.name} style={{ ...chip, padding: 0, gap: 0, overflow: 'hidden', background: x.favourite ? fill(20) : fill(12) }}>
      {x.favourite && (owner
        ? <FavHeart kind={kind} name={x.name} onChange={refresh} onColor={pri} style={{ padding: compact ? '8px 2px 8px 12px' : '6px 2px 6px 11px', color: pri }} />
        : <span aria-label="favourite" style={{ padding: compact ? '8px 0 8px 12px' : '6px 0 6px 11px' }}>♥</span>)}
      <button onClick={() => openD3?.(drawer, { filter: x.name })} style={{ ...plain, color: pri, padding: compact ? '8px 13px 8px 7px' : '6px 12px 6px 7px', paddingLeft: x.favourite ? undefined : (compact ? 13 : 12) }}>
        {x.name}{!x.favourite && x.count > 1 ? ` · ${x.count}` : ''}
      </button>
    </span>
  ))
  const favSection = (title, list, kind, drawer, emptyOwner) => (list.length > 0 || owner) && (
    <section>
      <h3 style={head}>{title}</h3>
      {list.length === 0
        ? <div style={{ fontSize: 13, color: ter }}>{emptyOwner}</div>
        : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{favChips(list, kind, drawer)}</div>}
    </section>
  )
  const labelsSection = favSection('Favourite labels', p.labels, 'label', 'labels', 'Labels you post or ♥ show up here.')
  const artistsSection = favSection(owner ? 'Your artists' : 'Artists', p.artists, 'artist', 'artists', 'Artists you post or ♥ show up here.')
  const channelsSection = favSection('Favourite channels', p.channels || [], 'channel', 'live', '♥ a channel on its spotlight to keep it here.')

  // A new playlist from the profile (2026-10-05): made, shown on the
  // profile (untick to keep it private), then opened to add tracks.
  async function createList(e) {
    e.preventDefault()
    const name = (newList || '').trim()
    if (!name) return
    await act(async () => {
      const made = await playlistsApi.create(name)
      await profileApi.showPlaylist(made.id, true)
      setNewList(null)
      qc.invalidateQueries({ queryKey: ['playlists'] })
      openD3?.('playlists', { open: made.id })
    })
  }
  const newListForm = newList == null ? (
    <button onClick={() => setNewList('')} style={{ ...chip, alignSelf: 'flex-start', marginTop: 8 }}>+ new playlist</button>
  ) : (
    <form onSubmit={createList} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
      <label htmlFor={`newlist-${username}`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>New playlist name</label>
      <input id={`newlist-${username}`} autoFocus value={newList} maxLength={80} placeholder="Name it — e.g. Sunday sides" onChange={e => setNewList(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') setNewList(null) }}
        style={{ flex: 1, minWidth: 0, borderRadius: 99, border: `1px solid ${fill(30)}`, background: fill(8), color: pri, padding: '8px 14px', fontFamily: SANS, fontSize: 16 }} />
      <button type="submit" disabled={busy || !newList.trim()} style={{ border: 0, borderRadius: 99, padding: '9px 16px', background: pri, color: 'var(--theme-showcase)', fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: newList.trim() ? 1 : 0.5 }}>Create</button>
      <button type="button" onClick={() => setNewList(null)} style={{ ...plain, color: sec, fontSize: 14 }}>Cancel</button>
    </form>
  )

  const playlistsSection = owner ? (
    <section style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Your playlists open in the drawer, as for visitors (2026-10-06, gabriel);
          every playlist is public for now — privacy comes later. */}
      <h3 style={head}>Your playlists</h3>
      {(p.allPlaylists || []).length === 0 ? (
        <div style={{ fontSize: 13, color: ter }}>No playlists yet — make one here, or use “+” on any track.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {p.allPlaylists.map(pl => (
            <button key={pl.id} onClick={() => openD3?.('playlists', { open: pl.id })}
              style={{ ...plain, display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 14px', borderRadius: 14, background: fill(12), color: pri, fontSize: 14, textAlign: 'left' }}>
              <span style={{ fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: ter, whiteSpace: 'nowrap' }}>{pl.release_count != null ? `${pl.release_count} record${pl.release_count === 1 ? '' : 's'}` : `${pl.track_count} tracks`}{pl.is_default ? ' · default' : ''} · open</span>
            </button>
          ))}
        </div>
      )}
      {newListForm}
    </section>
  ) : p.playlists.length > 0 && (
    <section>
      <h3 style={head}>Playlists</h3>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {p.playlists.map(pl => (
          <button key={pl.id} onClick={() => openD3?.('playlists', { token: pl.share_token })}
            style={{ ...plain, display: 'flex', flexDirection: compact ? 'row' : 'column', justifyContent: 'space-between', alignItems: compact ? 'baseline' : 'flex-start', gap: 3, padding: compact ? '13px 14px' : 12, borderRadius: compact ? 14 : 16, background: fill(12), color: pri, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{pl.name}</span>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: ter }}>{pl.release_count != null ? `${pl.release_count} record${pl.release_count === 1 ? '' : 's'}` : `${pl.track_count} tracks`} · listen</span>
          </button>
        ))}
      </div>
    </section>
  )

  // Who they follow (2026-10-05): like someone's wall, explore who they
  // follow — each name opens that wall. Public, like a friends list.
  const followsSection = (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3 style={head}>Following · {p.follows.total}</h3>
        {owner && <button onClick={() => openD3?.('walls')} style={{ ...plain, fontFamily: MONO, fontSize: 10.5, color: ter, textDecoration: 'underline', textUnderlineOffset: 3 }}>manage</button>}
      </div>
      {p.follows.total === 0 ? (
        <div style={{ fontSize: 13, color: ter }}>{owner ? 'Nobody yet — open someone’s feed you like and follow them.' : 'Not following anyone yet.'}</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {p.follows.names.map(n => (
            <button key={n} onClick={() => openWall(n)} title={`Open ${n}’s feed`} style={chip}>
              <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', background: fill(30), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>{n.charAt(0).toUpperCase()}</span>{n}
            </button>
          ))}
          {p.follows.total > p.follows.names.length && <span style={{ fontFamily: MONO, fontSize: 11, color: ter, alignSelf: 'center' }}>+ {p.follows.total - p.follows.names.length} more</span>}
        </div>
      )}
    </section>
  )

  const commonSection = !p.is_owner ? (
    <section style={{ borderTop: `1px solid ${fill(18)}`, paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>In common with you</h2>
        <span title="Alpha — an early, experimental feature" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--theme-showcase)', background: pri, borderRadius: 99, padding: '2px 7px' }}>α ALPHA</span>
      </div>
      {!signedIn ? (
        <button onClick={() => askToSignIn('see what you have in common')} style={{ ...plain, fontSize: 14, color: sec, textDecoration: 'underline', textUnderlineOffset: 3 }}>Sign in to see what you both post</button>
      ) : commonLoading || !common ? (
        <div style={{ fontFamily: MONO, fontSize: 11, color: ter }}>…</div>
      ) : !common.artists.total && !common.labels.total && !common.records.total ? (
        <div style={{ fontSize: 13, lineHeight: 1.5, color: sec }}>Nothing in common yet — everything in this feed is new to you.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {common.labels.items.map(n => <button key={'l' + n.name} onClick={() => openD3?.('labels', { filter: n.name })} title={`${n.posters} ${n.posters === 1 ? 'person posts' : 'people post'} ${n.name}`} style={chip}>{n.name}</button>)}
          {common.artists.items.map(n => <button key={'a' + n.name} onClick={() => openD3?.('artists', { filter: n.name })} title={`${n.posters} ${n.posters === 1 ? 'person posts' : 'people post'} ${n.name}`} style={chip}>{n.name}</button>)}
          {common.records.items.map(r => (
            <button key={'r' + r.id} onClick={() => jumpToPost?.(r.id)} title={`${r.title} — you both posted it`} aria-label={`${r.title} — you both posted it`}
              style={{ ...plain, width: 40, height: 40, borderRadius: 8, background: r.cover ? `var(--theme-dark2) center/cover no-repeat url("${r.cover}")` : 'var(--theme-dark2)' }} />
          ))}
        </div>
      )}
      <p style={{ margin: '12px 0 0', fontSize: 11.5, lineHeight: 1.5, color: ter }}>Matched only on what you both chose to post — the rarer, the higher. No likes, plays or listening data.</p>
    </section>
  ) : preview ? (
    <section style={{ borderTop: `1px solid ${fill(18)}`, paddingTop: 16, fontSize: 13, color: ter }}>Signed-in visitors see what they have in common with you here.</section>
  ) : (
    <section style={{ borderTop: `1px solid ${fill(18)}`, paddingTop: 16 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: ter }}>Your sound and top artists come from what you post — they update as you go. Your ♥ favourites and the playlists you tick are your choice; everything else here is just your posting.</p>
    </section>
  )

  const taste = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
      <section>
        {sectionTitle(owner ? 'Your sound' : 'Their sound', owner ? 'worked out from what you post' : 'from what they post')}
        {p.sound.length === 0 ? (
          <div style={{ fontSize: 13, color: ter }}>{owner ? 'Post a few records and your sound shows up here.' : 'Nothing posted yet.'}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `${compact ? 96 : 110}px minmax(0, 1fr) 28px`, gap: '7px 12px', alignItems: 'center', fontSize: 14 }}>
            {p.sound.map(g => [
              <button key={g.name + 'n'} onClick={() => openD3?.('genres', { filter: g.name })} style={{ ...plain, color: pri, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</button>,
              <div key={g.name + 'b'} aria-hidden="true" style={{ height: 8, borderRadius: 99, background: fill(55), width: `${Math.max(8, (g.count / max) * 100)}%` }} />,
              <span key={g.name + 'c'} style={{ fontFamily: MONO, fontSize: 11, textAlign: 'right' }}>{g.count}</span>,
            ])}
          </div>
        )}
      </section>
      {labelsSection}
      {artistsSection}
      {channelsSection}
      {playlistsSection}
      {followsSection}
      {commonSection}
    </div>
  )

  return <div {...cardTag} style={shell}>{identity}{taste}</div>
}

// The welcome (2026-10-05, gabriel): signed out, the front page opens on
// this card where your profile would be — what the site is, how it works,
// what an account adds, and the way in (create an account / log in).
// Same shell as WallCard; `compact` is the phone slide.
export function WelcomeCard({ compact = false }) {
  const { openD3 } = useLayout() || {}
  const owner = useFrontPageOwner()
  const pri = 'var(--theme-text-pri)', sec = 'var(--theme-text-sec)', ter = 'var(--theme-text-ter)'
  const fill = n => `color-mix(in srgb, var(--theme-text-pri) ${n}%, transparent)`
  const head = { margin: '0 0 10px', fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: ter }
  const list = { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: compact ? 15 : 14.5, lineHeight: 1.45, color: sec }
  const b = t => <b style={{ color: pri, fontWeight: 700 }}>{t}</b>
  const kbd = { fontFamily: MONO, fontSize: 12, border: `1px solid ${fill(35)}`, borderRadius: 4, padding: '0 5px', color: pri }
  const shell = compact
    ? { padding: '26px 20px 24px', display: 'flex', flexDirection: 'column', gap: 24, color: pri, fontFamily: SANS }
    : { width: 800, height: '100%', boxSizing: 'border-box', padding: '90px 48px 40px', overflowY: 'auto', background: 'var(--theme-showcase)', transition: 'background 0.8s', color: pri, fontFamily: SANS, display: 'grid', gridTemplateColumns: '270px minmax(0, 1fr)', gap: 44, alignContent: 'start' }

  const intro = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span style={head}>Welcome</span>
      <h1 style={{ margin: 0, fontSize: compact ? 40 : 52, fontWeight: 900, lineHeight: 0.95, letterSpacing: '-0.02em' }}>Late Night Vibes</h1>
      <p style={{ margin: 0, fontSize: compact ? 17 : 17.5, lineHeight: 1.5, color: sec }}>A record shelf you scroll sideways. Discover other people, listen to their collections, and build the database together.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
        <a href="/login?tab=create" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 99, background: pri, color: 'var(--theme-showcase)', fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>Create an account</a>
        <a href="/login" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 99, border: `1px solid ${fill(45)}`, color: pri, fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>Log in</a>
      </div>
    </div>
  )

  // The front page is someone's own wall (the first friend's) — say so.
  const wall = (
    <section style={{ padding: compact ? '14px 16px' : '16px 18px', borderRadius: 16, background: fill(12), fontSize: compact ? 15 : 15.5, lineHeight: 1.5, color: sec }}>
      You're looking at {owner ? <button onClick={() => openWall(owner)} style={{ ...plain, color: pri, fontWeight: 700 }}>{owner}'s</button> : 'my'} feed — the records I've posted and kept. Make an account and you get a feed of your own.
    </section>
  )

  const how = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
      {wall}
      <section>
        <h2 style={head}>How it works</h2>
        <ul style={list}>
          <li>{compact ? b('Swipe') : b('Scroll sideways')} through the posts.</li>
          <li>{b(compact ? 'Tap a cover' : 'Click a cover')} to play it.</li>
          <li>{b('Every post has a number')} — {compact ? 'search it to jump there.' : <>press <kbd style={kbd}>/</kbd> and type it to jump there.</>}</li>
        </ul>
      </section>
      <section>
        <h2 style={head}>With an account</h2>
        <ul style={list}>
          <li>{b('Post')} a record from a link, with a line on why.</li>
          <li>{b('Discover users')} and listen to their collections: follow people, make playlists, bring in your Discogs.</li>
          <li>{b('Add a link')} to a track with no player. It's a community-built database, so every link you find plays for everyone.</li>
        </ul>
      </section>
      <button onClick={() => openD3?.('about')} style={{ ...plain, alignSelf: 'flex-start', fontSize: 14, color: pri, textDecoration: 'underline', textUnderlineOffset: 3 }}>More in About →</button>
    </div>
  )

  return <div data-profile-card="welcome" style={shell}>{intro}{how}</div>
}

// An introduction (alpha, 2026-10-05, from the "LNV Introductions Mockup"
// gabriel picked — the phone design, a narrower card on desktop): someone
// my feed suggests you follow, always with the reason. × says no to them
// for good (undo-able here and on your profile); "why?" spells the rules
// out. Logged as seen once it's mostly on screen (the admin view).
// `placeholder` cards (dev only, Feed.jsx) show the feel without an account
// behind them: nothing is sent. `compact` is the phone slide.
export function IntroCard({ intro, compact = false, placeholder = false }) {
  const qc = useQueryClient()
  const { jumpToPost } = useLayout() || {}
  const [view, setView] = useState('card') // card | why | gone
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef(null)
  const name = intro.username

  useEffect(() => {
    const el = rootRef.current
    if (!el || placeholder) return
    let done = false
    const io = new IntersectionObserver(entries => {
      if (done || !entries.some(e => e.isIntersecting)) return
      done = true
      io.disconnect()
      introApi.seen(name).catch(() => {})
    }, { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [name, placeholder])

  async function act(fn) {
    if (placeholder) return
    setBusy(true)
    try { await fn() } catch (err) { window.alert(err.message) }
    setBusy(false)
  }
  const dismiss = () => { setView('gone'); act(async () => { await introApi.dismiss(name); qc.invalidateQueries({ queryKey: ['introductions', 'settings'] }) }) }
  const undo = () => { setView('card'); act(async () => { await introApi.undismiss(name); qc.invalidateQueries({ queryKey: ['introductions', 'settings'] }) }) }
  const follow = () => {
    const next = !following
    setFollowing(next)
    act(async () => {
      await (next ? wallsApi.follow(name) : wallsApi.unfollow(name))
      qc.invalidateQueries({ queryKey: ['following'] })
      qc.invalidateQueries({ queryKey: ['wall', name] })
    })
  }
  const open = () => placeholder ? window.alert('A placeholder introduction — there’s no account behind it yet.') : openWall(name)

  const pri = 'var(--theme-text-pri)', sec = 'var(--theme-text-sec)', ter = 'var(--theme-text-ter)'
  const fill = n => `color-mix(in srgb, var(--theme-text-pri) ${n}%, transparent)`
  const mono = { fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: ter, whiteSpace: 'nowrap' }
  const shell = compact
    ? { minHeight: '100%', boxSizing: 'border-box', padding: '22px 20px 18px', display: 'flex', flexDirection: 'column', gap: 18, color: pri, fontFamily: SANS }
    : { width: view === 'gone' ? 150 : 460, height: '100%', boxSizing: 'border-box', padding: view === 'gone' ? '90px 16px 32px' : '90px 36px 32px', overflowY: 'auto', background: 'var(--theme-showcase)', transition: 'background 0.8s, width 0.3s', color: pri, fontFamily: SANS, display: 'flex', flexDirection: 'column', gap: 22 }

  if (view === 'gone') return (
    <div ref={rootRef} role="status" style={{ ...shell, alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start', textAlign: 'center', gap: 12, fontSize: compact ? 17 : 14, lineHeight: 1.45 }}>
      <span>Okay — we won't introduce <b>{name}</b> again.</span>
      <button onClick={undo} disabled={busy} style={{ ...plain, color: pri, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3, padding: 8, fontSize: compact ? 16 : 14 }}>undo</button>
      {compact && <span style={{ fontFamily: MONO, fontSize: 11, color: ter }}>swipe on for the next post ›</span>}
    </div>
  )

  const since = (() => { try { return new Date(intro.member_since.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) } catch { return '' } })()
  const s = intro.social, c = intro.common
  const others = s.total - s.names.length
  const who = s.names.length === 1 && !others ? s.names[0]
    : others ? `${s.names.join(', ')} and ${others} other${others === 1 ? '' : 's'}` : s.names.join(' and ')
  const nameLink = n => <button key={n} onClick={() => openWall(n)} style={{ ...plain, color: pri, fontWeight: 700 }}>{n}</button>
  const reasonText = { fontSize: compact ? 18 : 20, lineHeight: 1.35 }
  const reasonNote = { display: 'block', fontFamily: MONO, fontSize: 11, color: ter, marginTop: 2 }
  const extra = [c.more ? `+ ${c.more} more` : '', c.records ? `${c.records} record${c.records === 1 ? '' : 's'} you both have` : ''].filter(Boolean).join(' · ')

  return (
    <section ref={rootRef} aria-label={`An introduction: ${name}`} style={shell}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span title="Alpha — an early, experimental feature" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--theme-showcase)', background: pri, borderRadius: 99, padding: '2px 7px', whiteSpace: 'nowrap' }}>α ALPHA</span>
        <span style={{ ...mono, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{compact ? 'Introduction' : 'An introduction'}</span>
        {placeholder && <span title="Dev only — shows the feel until real matches exist" style={{ fontFamily: MONO, fontSize: 9.5, color: ter, border: `1px dashed ${fill(40)}`, borderRadius: 99, padding: '1px 7px', whiteSpace: 'nowrap' }}>{compact ? 'demo' : 'placeholder'}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={dismiss} aria-label={`Not for me — don't introduce ${name} again`} title={`Not for me — don't introduce ${name} again`}
          style={{ ...plain, flexShrink: 0, width: compact ? 44 : 40, height: compact ? 44 : 40, borderRadius: '50%', border: `1px solid ${fill(30)}`, color: pri, fontSize: 19, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div aria-hidden="true" style={{ flexShrink: 0, width: compact ? 64 : 80, height: compact ? 64 : 80, borderRadius: '50%', background: pri, color: 'var(--theme-showcase)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 32 : 40, fontWeight: 900 }}>{name.charAt(0).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <button onClick={open} style={{ ...plain, color: pri, fontSize: compact ? 40 : 52, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em', overflowWrap: 'anywhere', textAlign: 'left' }}>{name}</button>
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: ter }}>
            {intro.post_count} {intro.post_count === 1 ? 'post' : 'posts'}{since ? ` · since ${since}` : ''}
          </div>
        </div>
      </div>
      {intro.bio && <p style={{ margin: '-6px 0 0', fontSize: 15, lineHeight: 1.5, color: sec, overflowWrap: 'anywhere' }}>{intro.bio}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {s.total > 0 && (
          <div style={reasonText}>
            {s.names.map((n, i) => <span key={n}>{i > 0 ? (i === s.names.length - 1 && !others ? ' and ' : ', ') : ''}{nameLink(n)}</span>)}
            {others ? ` and ${others} other${others === 1 ? '' : 's'}` : ''} {s.total === 1 ? 'follows' : 'follow'} {name}
            <span style={reasonNote}>you follow {who}</span>
          </div>
        )}
        {(c.names.length > 0 || c.records > 0) && (
          <div style={reasonText}>
            {c.names.length > 0
              ? <>you both post {c.names.map((n, i) => <span key={n.name}>{i > 0 ? ' and ' : ''}<b>{n.name}</b></span>)}</>
              : <>you both have {c.records} of the same record{c.records === 1 ? '' : 's'}</>}
            {c.names.length > 0 && extra && <span style={reasonNote}>{extra}</span>}
          </div>
        )}
      </div>

      {intro.latest?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={mono}>Latest in {name}'s feed</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {intro.latest.map(r => (
              <button key={r.id} onClick={() => jumpToPost?.(r.id)} title={r.title} aria-label={`Go to ${r.title}`}
                style={{ ...plain, aspectRatio: '1', borderRadius: 8, background: r.cover ? `var(--theme-dark2) center/cover no-repeat url("${r.cover}")` : fill(20) }} />
            ))}
          </div>
        </div>
      )}

      {view === 'why' && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: sec }}>
          Only from what you both chose to post, and who you follow — rarer names count for more. No likes, plays or replies are used, and your feed's order never changes: an introduction slots in at most once every eight cards. The rules, and the switch to turn these off, are on your profile and in About.
        </p>
      )}

      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={follow} disabled={busy} style={{ flex: 1, height: 48, border: following ? `1px solid ${fill(50)}` : 0, borderRadius: 99, background: following ? 'transparent' : pri, color: following ? pri : 'var(--theme-showcase)', fontFamily: SANS, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
          {following ? '✓ following' : '+ follow'}
        </button>
        <button onClick={open} style={{ flex: 1, height: 48, border: `1px solid ${fill(30)}`, borderRadius: 99, background: 'transparent', color: pri, fontFamily: SANS, fontSize: 16, cursor: 'pointer' }}>open feed</button>
      </div>
      <button onClick={() => setView(view === 'why' ? 'card' : 'why')} aria-expanded={view === 'why'}
        style={{ ...plain, alignSelf: 'center', color: pri, fontFamily: MONO, fontSize: 11, textDecoration: 'underline', textUnderlineOffset: 3, padding: 8 }}>
        {view === 'why' ? 'hide why' : `why ${name}?`}
      </button>
    </section>
  )
}

// Your introductions setting (2026-10-05), on your profile under Friends'
// posts: on/off, and the people you said no to, each with undo.
function IntroSettings({ pri, ter, fill }) {
  const qc = useQueryClient()
  const st = useIntroSettings()
  const [busy, setBusy] = useState(false)
  if (!st) return null
  const on = !st.off
  async function act(fn) {
    setBusy(true)
    try { await fn() } catch (err) { window.alert(err.message) }
    await qc.invalidateQueries({ queryKey: ['introductions'] })
    setBusy(false)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: fill(10), cursor: 'pointer' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700 }}>Introductions
            <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--theme-showcase)', background: pri, borderRadius: 99, padding: '1px 6px' }}>α</span></span>
          <span style={{ display: 'block', fontSize: 12, color: ter, marginTop: 2 }}>{on ? 'Now and then, someone to follow — always with why' : 'Off — your feed is only posts'}</span>
        </span>
        <input type="checkbox" role="switch" checked={on} disabled={busy} onChange={e => act(() => introApi.setOff(!e.target.checked))} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
        <span aria-hidden="true" style={{ flexShrink: 0, width: 42, height: 24, borderRadius: 99, background: on ? pri : fill(25), position: 'relative', transition: 'background 0.2s' }}>
          <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: on ? 'var(--theme-showcase)' : pri, transition: 'left 0.2s' }} />
        </span>
      </label>
      {st.dismissed.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '0 4px' }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: ter }}>Said no to:</span>
          {st.dismissed.map(n => (
            <button key={n} disabled={busy} onClick={() => act(() => introApi.undismiss(n))} title={`Undo — ${n} can be introduced again`}
              style={{ ...plain, fontSize: 12.5, color: pri, padding: '4px 10px', borderRadius: 99, background: fill(12) }}>{n} · undo</button>
          ))}
        </div>
      )}
    </div>
  )
}

// On the Community boards or not (2026-10-06) — on your profile, under
// Introductions. Off: you still see the boards, you just aren't on them.
function BoardsSetting({ pri, ter, fill }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['community', 'me'], queryFn: () => communityApi.me(), enabled: isLoggedIn(), staleTime: 60_000 })
  const [busy, setBusy] = useState(false)
  if (!data) return null
  const on = !data.off
  async function flip(next) {
    setBusy(true)
    try { qc.setQueryData(['community', 'me'], await communityApi.set(!next)); qc.invalidateQueries({ queryKey: ['community'] }) } catch (err) { window.alert(err.message) }
    setBusy(false)
  }
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: fill(10), cursor: 'pointer' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700 }}>Community boards
          <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--theme-showcase)', background: pri, borderRadius: 99, padding: '1px 6px' }}>α</span></span>
        <span style={{ display: 'block', fontSize: 12, color: ter, marginTop: 2 }}>{on ? 'You can show up on the boards' : 'Off — you see the boards, you’re not on them'}</span>
      </span>
      <input type="checkbox" role="switch" checked={on} disabled={busy} onChange={e => flip(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
      <span aria-hidden="true" style={{ flexShrink: 0, width: 42, height: 24, borderRadius: 99, background: on ? pri : fill(25), position: 'relative', transition: 'background 0.2s' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: on ? 'var(--theme-showcase)' : pri, transition: 'left 0.2s' }} />
      </span>
    </label>
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
    <div ref={ref} data-float-top="" style={{ position: 'absolute', top: 16, right: 352, zIndex: 100, display: 'flex', gap: 8, alignItems: 'center', ...style }}>
      {otherWall && !noFollow && <FollowButton username={mode.username} />}
      <button onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open} title="Choose a feed"
        style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 240, background: atHome ? 'var(--theme-dark3)' : 'var(--theme-accent)', border: '1px solid var(--theme-border)', borderRadius: 99, padding: '7px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', cursor: 'pointer',
          color: atHome ? 'var(--theme-text-pri)' : '#fff', fontFamily: SANS, fontSize: 12.5, fontWeight: 600 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feedModeLabel(mode)}</span>
        <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.8 }}>▼</span>
      </button>
      {open && (
        <div role="menu" style={{ ...MENU, top: 'calc(100% + 8px)', ...(menuLeft ? { left: 0 } : { right: 0 }), maxHeight: '70vh', overflowY: 'auto' }}>
          <MenuItem checked={isOn({ type: 'home' })} onClick={() => pick(homeMode())}>{signedIn ? 'my feed' : 'front page'} <span style={{ color: 'var(--theme-text-ter)', fontFamily: MONO, fontSize: 10.5 }}>· {!signedIn ? 'start here' : mode.type === 'home' && mode.friends === false ? 'just your posts' : 'you + who you follow'}</span></MenuItem>
          {otherWall && <MenuItem checked onClick={() => setOpen(false)}>{feedModeLabel(mode)}</MenuItem>}
          {mode.type === 'playlist' && !mode.id && <MenuItem checked onClick={() => setOpen(false)}>{feedModeLabel(mode)}</MenuItem>}
          {signedIn && <>
            <div style={MENU_HEAD}>Playlists as a feed</div>
            {lists.length === 0 && <div style={{ padding: '4px 10px 6px', color: 'var(--theme-text-sec)' }}>None with tracks yet.</div>}
            {lists.map(p => <MenuItem key={p.id} checked={isOn({ type: 'playlist', id: p.id })} onClick={() => { openPlaylistFeed(p); setOpen(false) }}>{p.name}</MenuItem>)}
            <div style={{ height: 1, background: 'var(--theme-border)', margin: '4px 6px' }} />
            <MenuItem muted onClick={() => { setOpen(false); openD3?.('playlists') }}>playlists…</MenuItem>
            <MenuItem muted onClick={() => { setOpen(false); openD3?.('walls') }}>following…</MenuItem>
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
