import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLayout } from '../context/LayoutContext'
import { isLoggedIn, getUser } from '../lib/auth'
import { useFeedMode, useWall, useFollowing, wallsApi, wallLink, openWall, openPlaylistFeed, usePlaylists, playlistsApi, playlistLink, playlistInviteLink } from '../lib/collections'
import { TrackHeart } from './Collect'
import { queue, useQueue, currentTrack } from '../lib/queue'
import { DrawerHead, DrawerBody, SectionHead, Row, Cover, Empty, Loading } from './Drawers'

// ── Walls and playlists drawers (2026-10-03) ─────────────────────────────────
// Walls: your wall and the people you follow. Playlists: lists of tracks
// (♡ fills "Hearted tracks"), shareable read-only, with friends you invite
// adding to them, playable straight through (lib/queue) and viewable as a
// feed. (Favourites were dropped the same day — playlists do that job.)

const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)', LINE = 'var(--theme-border)'
const FILL = 'color-mix(in srgb, var(--theme-text-pri) 7%, transparent)'

const pad = n => '#' + String(n).padStart(2, '0')
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

// The drawer's jump / open / close, as in Drawers.jsx.
function useDrawerNav() {
  const { closeD3, openD3, jumpToPost } = useLayout() || {}
  return { close: closeD3, open: openD3, jump: id => jumpToPost?.(id) }
}

// Walls · Playlists — hop between the two drawers.
function CollectNav({ current }) {
  const { openD3 } = useLayout() || {}
  const items = [['playlists', 'Playlists'], ['walls', 'Walls']]
  return (
    <div style={{ display: 'flex', gap: 14, fontFamily: SANS, fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
      {items.map(([k, l]) => (
        <button key={k} onClick={() => k !== current && openD3?.(k)} aria-current={k === current ? 'page' : undefined}
          style={{ border: 0, background: 'none', padding: 0, cursor: k === current ? 'default' : 'pointer', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
            color: k === current ? 'var(--theme-accent)' : TER, borderBottom: k === current ? '2px solid var(--theme-accent)' : '2px solid transparent', paddingBottom: 2 }}>{l}</button>
      ))}
    </div>
  )
}

const pill = { borderWidth: 1, borderStyle: 'solid', borderColor: LINE, background: 'none', borderRadius: 99, padding: '4px 12px', fontFamily: SANS, fontSize: 13, color: SEC, cursor: 'pointer', whiteSpace: 'nowrap' }
const pillOn = { ...pill, background: 'var(--theme-accent)', borderColor: 'var(--theme-accent)', color: '#fff' }

// Stored as UTC 'YYYY-MM-DD HH:MM:SS'.
const toDate = s => new Date(String(s || '').replace(' ', 'T') + (String(s || '').includes('Z') ? '' : 'Z'))
const savedOn = s => toDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function SignedOut({ title, children }) {
  return <>
    <DrawerHead title={title} count="" />
    <DrawerBody>
      <Empty>{children}</Empty>
      <a href="/login" style={{ ...pillOn, textDecoration: 'none', display: 'inline-block' }}>Sign in</a>
    </DrawerBody>
  </>
}

// ── Walls & following ─────────────────────────────────────────────────────────

export function WallsDrawer() {
  const me = getUser()
  const qc = useQueryClient()
  const { closeD3 } = useLayout() || {}
  const mode = useFeedMode()
  const { data: wall } = useWall(me)
  const { following, isLoading } = useFollowing()
  const [copied, setCopied] = useState(false)
  if (!isLoggedIn()) return <SignedOut title="Walls">Sign in for your own wall — everything you post, numbered from 1 — and to follow other people’s.</SignedOut>
  const showing = mode.type === 'wall' && mode.username === me
  const copy = () => navigator.clipboard?.writeText(wallLink(me)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }, () => window.prompt('Copy this link:', wallLink(me)))
  async function unfollow(f) {
    try { await wallsApi.unfollow(f.username) } catch (err) { window.alert(err.message) }
    qc.invalidateQueries({ queryKey: ['following'] })
    qc.invalidateQueries({ queryKey: ['wall', f.username] })
  }
  return <>
    <DrawerHead title="Walls" count={`following ${following.length}`}><CollectNav current="walls" /></DrawerHead>
    <DrawerBody>
      <SectionHead left="Your wall" right={`signed in as ${me}`} />
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: '14px 16px', background: showing ? FILL : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 19, flex: 1 }}>my wall</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: TER }}>{wall ? `${plural(wall.post_count, 'post')} · ${plural(wall.follower_count, 'follower')}` : ''}</span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 14, color: SEC, margin: '2px 0 10px', lineHeight: 1.45 }}>
          Everything you post, numbered from 1 — anyone can read it. To post, hit + and paste a link; it goes on your wall and the main feed.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => { openWall(me); closeD3?.() }} style={showing ? pillOn : pill}>{showing ? 'showing' : 'open'}</button>
          <button onClick={copy} style={pill}>{copied ? 'link copied ✓' : 'copy wall link'}</button>
        </div>
      </div>

      <SectionHead left="Following" right={following.length ? 'latest post first' : ''} />
      {isLoading ? <Loading />
        : !following.length ? <Empty>You’re not following anyone yet. Click a name on any card to open their wall, then hit “+ follow”.</Empty>
        : following.map(f => {
          const on = mode.type === 'wall' && mode.username === f.username
          return (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Row onClick={() => { openWall(f.username); closeD3?.() }} style={{ flex: 1, minWidth: 0, width: 'auto', margin: '0 0 0 -10px', background: on ? FILL : undefined }}>
                <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--theme-dark3)', display: 'grid', placeItems: 'center', fontFamily: SANS, fontWeight: 800, color: PRI, flexShrink: 0 }}>{f.username[0].toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16 }}>{f.username}</span>
                  <span style={{ fontFamily: SANS, fontStyle: 'italic', fontSize: 13.5, color: SEC }}>{plural(f.post_count, 'post')}{f.latest ? ` · latest ${savedOn(f.latest)}` : ''}</span>
                </span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--theme-accent)' }}>open wall →</span>
              </Row>
              <button onClick={() => unfollow(f)} style={{ ...pill, fontSize: 12 }}>unfollow</button>
            </div>
          )
        })}
    </DrawerBody>
  </>
}

// ── Playlists ─────────────────────────────────────────────────────────────────

// One playlist: its tracks (played straight through by the queue —
// lib/queue, QueueBar) and, for its owner, sharing and invites.
// `token`: opened from a share link (read-only unless you're a member).
function PlaylistView({ id, token, onBack }) {
  const qc = useQueryClient()
  const { jump } = useDrawerNav()
  const { closeD3 } = useLayout() || {}
  const { data, isLoading, error } = useQuery({
    queryKey: ['playlist', id || `t:${token}`],
    queryFn: () => (token ? playlistsApi.shared(token) : playlistsApi.get(id)),
  })
  const [copied, setCopied] = useState('')
  const q = useQueue()
  const [showMembers, setShowMembers] = useState(false)
  const pid = data?.id
  const tracks = data?.tracks || []
  // This playlist in the queue, and the track it's on.
  const listMeta = data ? (token && !data.role ? { token, name: data.name } : { id: pid, name: data.name }) : null
  const queued = !!q.list && !!listMeta && (q.list.id ? q.list.id === pid : q.list.token === token)
  const playingId = queued ? currentTrack(q)?.id : null
  // Keep the queue in step when tracks are added, removed or moved.
  useEffect(() => { if (pid && data?.tracks) queue.sync(pid, data.tracks) }, [pid, data])
  const play = (i = 0) => queue.start(listMeta, tracks, i)
  const owner = data?.role === 'owner'
  const canEdit = !!data?.role
  const refresh = () => { qc.invalidateQueries({ queryKey: ['playlist'] }); qc.invalidateQueries({ queryKey: ['playlists'] }) }
  async function run(fn) { try { await fn(); refresh() } catch (err) { window.alert(err.message) } }
  const copy = (what, link) => navigator.clipboard?.writeText(link).then(() => { setCopied(what); setTimeout(() => setCopied(''), 2000) }, () => window.prompt('Copy this link:', link))
  async function shareLink(renew = false) {
    if (renew && !window.confirm('Make a new share link? The old one stops working.')) return
    try { const r = await playlistsApi.share(pid, renew); refresh(); copy('share', playlistLink(r.share_token)) } catch (err) { window.alert(err.message) }
  }
  async function inviteLinkCopy(renew = false) {
    if (renew && !window.confirm('Make a new invite link? The old one stops working; friends who joined stay.')) return
    try { const r = await playlistsApi.invite(pid, renew); refresh(); copy('invite', playlistInviteLink(r.invite_token)) } catch (err) { window.alert(err.message) }
  }
  function viewAsFeed() {
    openPlaylistFeed(token && !canEdit ? { token, name: data.name } : { id: pid, name: data.name })
    closeD3?.()
  }
  if (error) return <><DrawerHead title="Playlist" count="" crumb={onBack ? 'Playlists' : undefined} onBack={onBack} /><DrawerBody><Empty>{error.message}</Empty></DrawerBody></>
  if (isLoading || !data) return <><DrawerHead title="Playlist" count="" crumb={onBack ? 'Playlists' : undefined} onBack={onBack} /><Loading /></>
  const btn = { border: 0, background: 'none', color: TER, cursor: 'pointer', fontFamily: MONO, fontSize: 13, padding: '0 3px' }
  const fromPosts = new Set(tracks.map(t => t.post_id).filter(Boolean)).size
  return <>
    <DrawerHead title={(data.kind === 'hearted' ? '♥ ' : '') + data.name} count={plural(tracks.length, 'track')} crumb={onBack ? 'Playlists' : undefined} onBack={onBack}>
      <div style={{ fontFamily: SANS, fontSize: 13.5, color: SEC }}>
        {owner ? 'yours' : `by ${data.owner}`}{data.member_count ? ` · ${plural(data.member_count, 'friend')} adding` : ''}{!canEdit ? ' · read-only' : ''}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => play(0)} disabled={!tracks.length} style={{ ...pillOn, opacity: tracks.length ? 1 : 0.5 }} title="Plays straight through, one track after another">▶ play all</button>
        <button onClick={() => { if (!q.shuffle) queue.toggleShuffle(); play(Math.floor(Math.random() * tracks.length)) }} disabled={!tracks.length} style={{ ...pill, opacity: tracks.length ? 1 : 0.5 }}>⇄ shuffle</button>
        <button onClick={viewAsFeed} disabled={!fromPosts} title={fromPosts ? `The ${plural(fromPosts, 'post')} these tracks come from, as cards` : 'None of these tracks come from posts yet'} style={{ ...pill, opacity: fromPosts ? 1 : 0.5 }}>view as feed</button>
        {owner && <button onClick={() => shareLink()} style={pill} title="Anyone with this link can listen — read-only">{copied === 'share' ? 'link copied ✓' : 'copy share link'}</button>}
        {owner && <button onClick={() => inviteLinkCopy()} style={pill} title="Friends who open this (signed in) can add tracks">{copied === 'invite' ? 'invite copied ✓' : 'invite friends to add'}</button>}
        {!owner && data.share_token && <button onClick={() => copy('share', playlistLink(data.share_token))} style={pill}>{copied === 'share' ? 'link copied ✓' : 'copy share link'}</button>}
        {owner && <button onClick={() => setShowMembers(v => !v)} style={pill}>{showMembers ? 'done' : 'more'}</button>}
        {data.role === 'member' && <button onClick={() => { if (window.confirm(`Stop adding to “${data.name}”?`)) playlistsApi.leave(pid).then(() => { refresh(); onBack?.() }, err => window.alert(err.message)) }} style={{ ...pill, color: 'var(--theme-accent)' }}>leave</button>}
      </div>
      {owner && showMembers && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => { const n = window.prompt('Rename the playlist', data.name); if (n && n.trim()) run(() => playlistsApi.rename(pid, n)) }} style={pill}>rename</button>
            {data.share_token && <button onClick={() => shareLink(true)} style={pill}>new share link</button>}
            {data.invite_token && <button onClick={() => inviteLinkCopy(true)} style={pill}>new invite link</button>}
            <button onClick={() => { if (window.confirm(`Delete “${data.name}”?`)) playlistsApi.remove(pid).then(() => { qc.invalidateQueries({ queryKey: ['playlists'] }); onBack?.() }, err => window.alert(err.message)) }} style={{ ...pill, color: 'var(--theme-accent)' }}>delete</button>
          </div>
          {(data.members || []).length > 0 && <div>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: TER, margin: '4px 0' }}>Friends adding</div>
            {data.members.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '2px 0', fontFamily: SANS, fontSize: 14.5 }}>
                <b>{m.username}</b>
                <button onClick={() => { if (window.confirm(`Stop ${m.username} adding to “${data.name}”?`)) run(() => playlistsApi.removeMember(pid, m.id)) }} style={{ marginLeft: 'auto', border: 0, background: 'none', color: 'var(--theme-accent)', fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>remove</button>
              </div>
            ))}
          </div>}
        </div>
      )}
    </DrawerHead>
    <DrawerBody>
      {!tracks.length && <Empty>{data.kind === 'hearted' ? 'Hit ♡ next to any track — on a card, in a spotlight — and it lands here.' : 'Empty for now — use “+ list” on a card, or + next to any track, to add some.'}</Empty>}
      {tracks.map((t, i) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Row onClick={() => play(i)} style={{ flex: 1, minWidth: 0, width: 'auto', margin: '0 0 0 -10px', padding: '6px 10px', background: t.id === playingId ? 'color-mix(in srgb, var(--theme-accent) 14%, transparent)' : undefined }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: t.id === playingId ? 'var(--theme-accent)' : TER, minWidth: 24 }}>{t.id === playingId ? '▶' : i + 1}</span>
            <Cover src={t.cover} size={34} radius={8} />
            <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              <span style={{ fontFamily: SANS, fontStyle: 'italic', fontSize: 13.5, color: SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artist}</span>
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: TER }}>{t.duration || ''}</span>
          </Row>
          <TrackHeart track={t} size={15} offColor={TER} style={{ width: 20, justifyContent: 'center' }} />
          {t.post_id && <button onClick={() => jump(t.post_id)} title={`Go to post ${pad(t.post_id)}`} style={btn}>{pad(t.post_id)}</button>}
          {canEdit && <>
            <button onClick={() => run(() => playlistsApi.moveTrack(pid, t.id, -1))} disabled={i === 0} aria-label="Move up" style={{ ...btn, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
            <button onClick={() => run(() => playlistsApi.moveTrack(pid, t.id, 1))} disabled={i === tracks.length - 1} aria-label="Move down" style={{ ...btn, opacity: i === tracks.length - 1 ? 0.3 : 1 }}>↓</button>
            <button onClick={() => run(() => playlistsApi.removeTrack(pid, t.id))} aria-label={`Remove ${t.title}`} style={{ ...btn, color: 'var(--theme-accent)' }}>×</button>
          </>}
        </div>
      ))}
    </DrawerBody>
  </>
}

// `open`: a playlist id to open straight away; `token`: a shared playlist's
// link (read-only unless you were invited).
export function PlaylistsDrawer({ open: initialId, token }) {
  const { playlists, isLoading } = usePlaylists()
  const qc = useQueryClient()
  const [openId, setOpenId] = useState(initialId || null)
  const [shareToken, setShareToken] = useState(token || null)
  const [name, setName] = useState('')
  if (shareToken) return <PlaylistView token={shareToken} onBack={isLoggedIn() ? () => setShareToken(null) : undefined} />
  if (!isLoggedIn()) return <SignedOut title="Playlists">Sign in to make playlists from the tracks on the feed, heart tracks, and invite friends to add to them.</SignedOut>
  if (openId) return <PlaylistView id={openId} onBack={() => setOpenId(null)} />
  async function create(e) {
    e.preventDefault()
    if (!name.trim()) return
    try { const p = await playlistsApi.create(name); setName(''); qc.invalidateQueries({ queryKey: ['playlists'] }); setOpenId(p.id) } catch (err) { window.alert(err.message) }
  }
  const mine = playlists.filter(p => p.role === 'owner'), theirs = playlists.filter(p => p.role === 'member')
  const rowOf = p => (
    <Row key={p.id} onClick={() => setOpenId(p.id)}>
      <span style={{ display: 'flex', flexShrink: 0 }}>
        {(p.covers.length ? p.covers : [null]).slice(0, 3).map((c, i) => <span key={i} style={{ width: 30, height: 30, borderRadius: 8, marginLeft: i ? -10 : 0, border: '2px solid var(--theme-bg)', background: c ? `var(--theme-dark2) center/cover no-repeat url("${c}")` : 'var(--theme-dark2)' }} />)}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.kind === 'hearted' ? '♥ ' : ''}{p.name}</span>
        <span style={{ fontFamily: SANS, fontStyle: 'italic', fontSize: 13.5, color: SEC }}>
          {p.role === 'member' ? `by ${p.owner}` : p.share_token ? 'shared' : 'private'}{p.member_count ? ` · ${plural(p.member_count, 'friend')} adding` : ''}
        </span>
      </span>
      <span style={{ fontFamily: MONO, fontSize: 12.5, color: TER }}>{plural(p.track_count, 'track')}</span>
    </Row>
  )
  return <>
    <DrawerHead title="Playlists" count={plural(playlists.length, 'playlist')}><CollectNav current="playlists" /></DrawerHead>
    <DrawerBody>
      <form onSubmit={create} style={{ display: 'flex', gap: 8, margin: '6px 0 14px' }}>
        <label style={{ flex: 1, display: 'flex', alignItems: 'center', background: FILL, border: `1px solid ${LINE}`, borderRadius: 99, padding: '7px 14px' }}>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Name a new playlist…" aria-label="New playlist name"
            style={{ border: 0, outline: 0, background: 'none', flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 15, color: PRI }} />
        </label>
        <button type="submit" disabled={!name.trim()} style={{ ...pillOn, opacity: name.trim() ? 1 : 0.5 }}>make it</button>
      </form>
      {isLoading ? <Loading /> : <>
        {!mine.length && <Empty>No playlists yet. Make one here, hit ♡ on any track for “Hearted tracks”, or “+ list” on a card.</Empty>}
        {mine.map(rowOf)}
        {theirs.length > 0 && <><SectionHead left="Friends’ playlists you add to" />{theirs.map(rowOf)}</>}
      </>}
    </DrawerBody>
  </>
}
