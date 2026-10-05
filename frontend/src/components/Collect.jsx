import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useLayout } from '../context/LayoutContext'
import { isLoggedIn, getUser } from '../lib/auth'
import {
  useFeedMode, setFeedMode, feedModeLabel, openWall, openPlaylistFeed, homeMode,
  usePlaylists, playlistsApi, playableTracks, useHearted, useFollowing, useWall, wallsApi, joinApi, useInCommon,
  useProfile, profileApi, wallLink,
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
          {lists.map(p => <MenuItem key={p.id} onClick={() => addTo(p.id, p.name)}>{p.kind === 'hearted' ? '♥ ' : ''}{p.name} <span style={{ color: 'var(--theme-text-ter)', fontFamily: MONO, fontSize: 10.5 }}>· {p.track_count}{p.role === 'member' ? ` · ${p.owner}’s` : ''}</span></MenuItem>)}
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

// The profile (2026-10-05, from the "LNV Profile Mockup" gabriel picked) —
// the first card on a wall. One card, three views:
// - everyone: picture (an initial for now), name, member since, posts and
//   followers, bio; their sound (top styles), favourite labels (pinned
//   first), top artists, the playlists they chose to show;
// - signed in: follow, who you follow that follows them, In common (alpha);
// - the owner: edit the bio, pin up to 3 labels, tick which playlists show,
//   numbers only they see, and "View as visitor" to check the public card.
// Everything about someone's taste comes from what they chose to post.
// `compact` stacks it for phones.
const PIN_ICON = filled => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 17v5" /><path d="M9 10.8V5h6v5.8l3 3.2H6z" /></svg>
)
export function WallCard({ username, compact = false }) {
  const qc = useQueryClient()
  const { openD3, jumpToPost } = useLayout() || {}
  const { data: p } = useProfile(username)
  const { data: common, isLoading: commonLoading } = useInCommon(p && !p.is_owner ? username : null)
  const [asVisitor, setAsVisitor] = useState(false)
  const [bioDraft, setBioDraft] = useState(null) // null = not editing
  const [pinMenu, setPinMenu] = useState(false)
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
  if (!p) return <div style={shell}><div style={{ fontFamily: MONO, fontSize: 11, color: ter }}>…</div></div>

  const owner = p.is_owner && !asVisitor
  const preview = p.is_owner && asVisitor
  const signedIn = isLoggedIn()
  const since = (() => { try { return new Date(p.member_since.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) } catch { return '' } })()
  const pins = p.labels.filter(l => l.pinned).map(l => l.name)
  const pinsMax = p.pinsMax || 3
  const setPins = list => act(() => profileApi.pins(list))
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

      {owner && p.private && (
        <div style={{ marginTop: 6, padding: 14, borderRadius: 16, border: `1px dashed ${fill(35)}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: ter, marginBottom: 8 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>Only you see this
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            Reposted {p.private.reposted} {p.private.reposted === 1 ? 'time' : 'times'}<br />
            Posted too by {p.private.postedToo} {p.private.postedToo === 1 ? 'person' : 'people'}<br />
            {p.private.replies} {p.private.replies === 1 ? 'reply' : 'replies'} on your posts
          </div>
        </div>
      )}
    </div>
  )

  const labelsSection = (p.labels.length > 0 || owner) && (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3 style={head}>Favourite labels</h3>
        {owner && <span style={{ fontFamily: MONO, fontSize: 10.5, color: ter }}>pin up to {pinsMax}</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, position: 'relative' }}>
        {p.labels.map(l => owner ? (
          <span key={l.name} style={{ ...chip, padding: 0, gap: 0, overflow: 'hidden', background: l.pinned ? pri : 'transparent', color: l.pinned ? 'var(--theme-showcase)' : pri, border: l.pinned ? 0 : `1px dashed ${fill(40)}` }}>
            <button disabled={busy || (!l.pinned && pins.length >= pinsMax)} onClick={() => setPins(l.pinned ? pins.filter(n => n !== l.name) : [...pins, l.name])}
              aria-label={l.pinned ? `Unpin ${l.name}` : `Pin ${l.name}`} title={!l.pinned && pins.length >= pinsMax ? `You can pin ${pinsMax}` : (l.pinned ? 'Unpin' : 'Pin to your profile')}
              style={{ ...plain, color: 'inherit', padding: compact ? '8px 4px 8px 12px' : '6px 4px 6px 11px', display: 'inline-flex' }}>{PIN_ICON(l.pinned)}</button>
            <button onClick={() => openD3?.('labels', { filter: l.name })} style={{ ...plain, color: 'inherit', padding: compact ? '8px 13px 8px 6px' : '6px 12px 6px 6px' }}>{l.name}{!l.pinned && l.count ? ` · ${l.count}` : ''}</button>
          </span>
        ) : (
          <button key={l.name} onClick={() => openD3?.('labels', { filter: l.name })} style={{ ...chip, background: fill(l.pinned ? 18 : 12) }}>
            {l.pinned && PIN_ICON(false)}{l.name}{!l.pinned && l.count ? ` · ${l.count}` : ''}
          </button>
        ))}
        {owner && pins.length < pinsMax && (p.pinChoices || []).some(n => !p.labels.some(l => l.name === n)) && (
          <button onClick={() => setPinMenu(v => !v)} aria-expanded={pinMenu} style={{ ...chip }}>+ pin another label</button>
        )}
        {owner && pinMenu && (
          <div role="menu" style={{ ...MENU, top: 'calc(100% + 6px)', left: 0, maxHeight: 260, overflowY: 'auto' }}>
            {(p.pinChoices || []).filter(n => !p.labels.some(l => l.name === n)).map(n => (
              <MenuItem key={n} onClick={() => { setPinMenu(false); setPins([...pins, n]) }}>{n}</MenuItem>
            ))}
          </div>
        )}
        {owner && p.labels.length === 0 && <span style={{ fontSize: 13, color: ter }}>Labels you post show up here.</span>}
      </div>
    </section>
  )

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
      <h3 style={head}>Playlists — choose what's shown</h3>
      {(p.allPlaylists || []).length === 0 ? (
        <div style={{ fontSize: 13, color: ter }}>No playlists yet — make one here, or ♡ a track to start your Hearted tracks.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {p.allPlaylists.map(pl => (
            <label key={pl.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, background: pl.shown ? fill(12) : 'transparent', border: pl.shown ? 0 : `1px dashed ${fill(30)}`, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={pl.shown} disabled={busy} onChange={e => act(async () => { await profileApi.showPlaylist(pl.id, e.target.checked); qc.invalidateQueries({ queryKey: ['playlists'] }) })}
                style={{ width: 18, height: 18, margin: 0, accentColor: 'var(--theme-text-pri)' }} />
              <span style={{ fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.kind === 'hearted' ? '♥ ' : ''}{pl.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: ter, whiteSpace: 'nowrap' }}>{pl.track_count} tracks · {pl.shown ? 'shown' : 'private'}</span>
            </label>
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
            <span style={{ fontWeight: 700, fontSize: 14 }}>{pl.kind === 'hearted' ? '♥ ' : ''}{pl.name}</span>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: ter }}>{pl.track_count} tracks · listen</span>
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
        <div style={{ fontSize: 13, color: ter }}>{owner ? 'Nobody yet — open a wall you like and follow them.' : 'Not following anyone yet.'}</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {p.follows.names.map(n => (
            <button key={n} onClick={() => openWall(n)} title={`Open ${n}’s wall`} style={chip}>
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
        <div style={{ fontSize: 13, lineHeight: 1.5, color: sec }}>Nothing in common yet — everything on this wall is new to you.</div>
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
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: ter }}>Your sound and top artists come from what you post — they update as you go. Pins and the playlists you tick are your choice; everything else here is just your posting.</p>
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
      {p.artists.length > 0 && (
        <section>
          <h3 style={head}>Top artists</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {p.artists.map(a => <button key={a.name} onClick={() => openD3?.('artists', { filter: a.name })} style={chip}>{a.name}{a.count > 1 ? ` · ${a.count}` : ''}</button>)}
          </div>
        </section>
      )}
      {playlistsSection}
      {followsSection}
      {commonSection}
    </div>
  )

  return <div style={shell}>{identity}{taste}</div>
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
