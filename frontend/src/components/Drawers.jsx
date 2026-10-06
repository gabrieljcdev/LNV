import { useState, useEffect } from 'react'
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useLayout } from '../context/LayoutContext'
import { releaseTag, roleGroup, ROLE_PILL, cleanLabelName } from '../lib/catalogue'
import { FavHeart } from './Collect'
import ReleasePreview from './ReleasePreview'

// ── Browse drawers (2026-10-01) ───────────────────────────────────────────────
// Artists, labels, genres, live sets and About — rendered inside ContentPanel
// via openD3(id, { filter: name }), where `filter` opens straight to that
// name's detail. Built from the "LNV Drawers" mockup gabriel approved:
// one header (title, count, filter box, sort chips), rows instead of pill
// walls, and every post shown with its number, jumping the feed to it.
//
// All four lists come from one call (GET /posts/browse, every post as a
// compact summary) and are grouped here. Its query key starts with 'posts',
// so anything that refreshes the feed after a post/edit/delete refreshes
// these too.

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)', LINE = 'var(--theme-border)'
const FILL = 'color-mix(in srgb, var(--theme-text-pri) 7%, transparent)'
const HOVER = 'color-mix(in srgb, var(--theme-accent) 14%, transparent)'
const PADX = 34

// Discogs' top-level genres; every other tag a post carries is a style.
const TOP_GENRES = new Set(['Blues', 'Brass & Military', "Children's", 'Classical', 'Electronic', 'Folk, World, & Country', 'Funk / Soul', 'Hip Hop', 'Jazz', 'Latin', 'Non-Music', 'Pop', 'Reggae', 'Rock', 'Stage & Screen'])
const isVarious = n => /^various( artists)?$/i.test((n || '').trim())
const pad = n => '#' + String(n).padStart(2, '0')
const uniq = a => [...new Set(a.filter(Boolean))]
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

function useBrowse() {
  return useQuery({
    queryKey: ['posts', 'browse'],
    queryFn: async () => { const r = await fetch(`${API}/posts/browse`); if (!r.ok) throw new Error(r.status); return r.json() },
    staleTime: 60_000,
  })
}

// Same rule as Feed.jsx's isLiveSetPost: typed as one, or titled like one.
const isLiveSet = p => p.post_type === 'livemix' || /\|\s*.+\d{4}|\bb2b\b|dj set|live at|session/i.test(p.title || '')

// Who played, where, and when — from the channel field when the poster
// filled it in, otherwise read out of the title, which is where older sets
// keep it:  "DJ | Where - Date",  "DJ / Date / Time" (artist = the venue),
// "Where in-store session with DJ".
function liveInfo(p) {
  const artist = p.artists[0] || ''
  const t = p.title || ''
  let dj = artist, where = p.channel || '', date = ''
  if (t.includes('|')) {
    const [a, rest] = [t.slice(0, t.indexOf('|')).trim(), t.slice(t.indexOf('|') + 1).trim()]
    dj = a || artist
    const m = rest.match(/^(.*?)\s+-\s+(.*)$/)
    if (!where) where = m ? m[1] : rest
    date = m ? m[2] : ''
  } else if (/\swith\s/i.test(t)) {
    dj = t.split(/\swith\s/i).pop().trim()
    where = where || artist
  } else if (t.includes(' / ')) {
    const parts = t.split(' / ').map(s => s.trim())
    dj = parts[0]; where = where || artist; date = parts.slice(1).join(' · ')
  }
  return { dj: dj || artist || t, where: where || '—', date }
}

// ── shared pieces ─────────────────────────────────────────────────────────────

function useDrawerNav() {
  const { closeD3, openD3, jumpToPost } = useLayout() || {}
  return { close: closeD3, open: openD3, jump: id => jumpToPost?.(id) }
}

export function DrawerHead({ title, count, crumb, onBack, filter, setFilter, action, children }) {
  const { close } = useDrawerNav()
  return (
    <div style={{ padding: `28px 30px 6px ${PADX}px`, display: 'grid', gap: 14, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        {crumb && (
          <button onClick={onBack} style={{ border: `1px solid ${LINE}`, background: 'none', borderRadius: 99, padding: '3px 10px', fontFamily: MONO, fontSize: 12.5, color: SEC, cursor: 'pointer', flexShrink: 0 }}>← {crumb}</button>
        )}
        <h2 style={{ margin: 0, fontFamily: SANS, fontWeight: 900, fontSize: 34.5, letterSpacing: '-0.02em', lineHeight: 1, color: PRI, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h2>
        {action}
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: TER, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{count}</span>
        <button onClick={close} aria-label="Close" style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${LINE}`, background: FILL, color: SEC, cursor: 'pointer', fontSize: 17, flexShrink: 0, alignSelf: 'center' }}>×</button>
      </div>
      {setFilter && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: FILL, border: `1px solid ${LINE}`, borderRadius: 99, padding: '7px 14px' }}>
          <span aria-hidden="true" style={{ color: TER }}>⌕</span>
          <input autoFocus value={filter} onChange={e => setFilter(e.target.value)} placeholder={`Filter ${title.toLowerCase()}…`} aria-label={`Filter ${title.toLowerCase()}`}
            style={{ border: 0, outline: 0, background: 'none', flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 15, color: PRI }} />
          {filter && <button onClick={() => setFilter('')} aria-label="Clear filter" style={{ border: 0, background: 'none', color: TER, cursor: 'pointer', padding: 0 }}>×</button>}
        </label>
      )}
      {children}
    </div>
  )
}

export function DrawerBody({ children }) {
  return <div data-inner-scroll="" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `6px 30px 34px ${PADX}px`, scrollbarWidth: 'thin', scrollbarColor: `${LINE} transparent`, overscrollBehavior: 'contain' }}>{children}</div>
}

function Chips({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)} aria-pressed={value === k}
          style={{ border: `1px solid ${value === k ? PRI : LINE}`, background: value === k ? PRI : 'none', color: value === k ? 'var(--theme-bg)' : SEC, borderRadius: 99, padding: '3px 10px', fontFamily: SANS, fontSize: 13, cursor: 'pointer' }}>{label}</button>
      ))}
    </div>
  )
}

const SectionHead = ({ left, right }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontWeight: 600, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: TER, margin: '20px 0 6px' }}><span>{left}</span><span>{right}</span></div>
)

function Row({ onClick, children, style }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: 'calc(100% + 20px)', margin: '0 -10px', padding: '8px 10px', border: 0, borderRadius: 12, background: h ? HOVER : 'none', textAlign: 'left', cursor: 'pointer', color: PRI, ...style }}>
      {typeof children === 'function' ? children(h) : children}
    </button>
  )
}

const Cover = ({ src, size, radius = 10, round }) => (
  <span style={{ width: size, height: size, flexShrink: 0, borderRadius: round ? '50%' : radius, background: src ? `var(--theme-dark2) center/cover no-repeat url("${src}")` : 'linear-gradient(135deg, var(--theme-dark2), var(--theme-dark1))' }} />
)

function CoverStack({ posts }) {
  return (
    <span style={{ display: 'flex', flexShrink: 0 }}>
      {posts.slice(0, 3).map((p, i) => (
        <span key={p.id} style={{ width: 26, height: 26, borderRadius: 7, marginLeft: i ? -9 : 0, border: '2px solid var(--theme-bg)', background: p.cover ? `var(--theme-dark2) center/cover no-repeat url("${p.cover}")` : 'var(--theme-dark2)' }} />
      ))}
    </span>
  )
}

// A post: number, cover, artist / title, something on the right. Jumps the
// feed to it (and closes the drawer).
function PostRow({ post, right }) {
  const { jump } = useDrawerNav()
  const artist = post.artists.filter(a => !isVarious(a))[0] || post.artists[0] || ''
  return (
    <Row onClick={() => jump(post.id)}>
      {h => <>
        <span style={{ fontFamily: MONO, fontSize: 14, color: TER, minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>{pad(post.id)}</span>
        <Cover src={post.cover} size={42} />
        <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artist || post.title}</span>
          <span style={{ fontFamily: SANS, fontStyle: 'italic', fontSize: 15, color: SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artist ? post.title : ''}</span>
        </span>
        <span style={{ textAlign: 'right', fontFamily: MONO, fontSize: 12, color: TER, whiteSpace: 'nowrap', lineHeight: 1.5 }}>
          {right}<br /><span style={{ color: 'var(--theme-accent)', opacity: h ? 1 : 0 }}>go to post →</span>
        </span>
      </>}
    </Row>
  )
}

function Tags({ names, kind = 'genres' }) {
  const { open } = useDrawerNav()
  if (!names.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {names.map(n => (
        <button key={n.name ?? n} onClick={() => open(kind, { filter: n.name ?? n })}
          style={{ fontFamily: SANS, fontSize: 12.5, padding: '3px 10px', borderRadius: 99, background: FILL, color: SEC, border: 0, cursor: 'pointer' }}>
          {n.name ?? n}{n.count != null && <span style={{ opacity: 0.6 }}> {n.count}</span>}
        </button>
      ))}
    </div>
  )
}

const Empty = ({ children }) => <p style={{ fontFamily: SANS, fontSize: 15, color: SEC, padding: '20px 0', margin: 0 }}>{children}</p>
const Loading = () => <p style={{ fontFamily: MONO, fontSize: 12.5, color: TER, padding: `24px ${PADX}px`, margin: 0 }}>Loading…</p>

const matches = (q, ...fields) => !q || fields.some(f => String(f || '').toLowerCase().includes(q.toLowerCase()))

// Artists or labels: A–Z with letter headings, most posted, or recently posted.
function NameList({ groups, sort, filter, sub, onOpen, noun }) {
  let rows = [...groups.entries()].filter(([name, ps]) => matches(filter, name, sub(ps)))
  rows.sort(sort === 'count' ? (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
    : sort === 'new' ? (a, b) => b[1][0].id - a[1][0].id
    : (a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
  if (!rows.length) return <Empty>No {noun} match “{filter}”.</Empty>
  let last = ''
  return rows.map(([name, ps]) => {
    const L = sort === 'az' ? (name.normalize('NFD')[0] || '').toUpperCase() : ''
    const letter = L && L !== last ? <div key={'L' + L} style={{ fontFamily: SANS, fontWeight: 900, fontSize: 25.5, color: TER, margin: '16px 0 2px' }}>{L}</div> : null
    if (L) last = L
    return [letter, (
      <Row key={name} onClick={() => onOpen(name)}>
        <CoverStack posts={ps} />
        <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span style={{ fontFamily: SANS, fontSize: 14, color: SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub(ps)}</span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: TER, textAlign: 'right', whiteSpace: 'nowrap', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>
          {plural(ps.length, 'post')}<br />latest {pad(ps[0].id)}
        </span>
      </Row>
    )]
  })
}

function group(posts, keys) {
  const m = new Map()
  for (const p of posts) for (const k of uniq(keys(p))) { if (!m.has(k)) m.set(k, []); m.get(k).push(p) }
  return m // posts arrive newest first, so each group is too
}

const SORTS = [['az', 'A–Z'], ['count', 'Most posted'], ['new', 'Recently posted']]

function Facts({ lines }) {
  return <div style={{ fontFamily: MONO, fontSize: 12.5, color: SEC, lineHeight: 1.7, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{lines.filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}</div>
}
const yearSpan = ps => { const ys = uniq(ps.map(p => p.year)).sort(); return ys.length > 1 ? `${ys[0]} – ${ys[ys.length - 1]}` : ys[0] || '' }

// ── Discography (2026-10-02) ──────────────────────────────────────────────────
// "The artist should show everything they've done": under an artist's or
// label's own LNV posts, their WHOLE Discogs catalogue — from the backend's
// catalogue crawl (GET /discogs/{artist|label}/:id/releases), 100 at a time,
// searchable. Same type tags and role pills as the spotlight list
// (lib/catalogue). A release already on LNV jumps to its post; anything else
// opens on Discogs.

// The Discogs id behind a name, from any post that carries it.
function discogsIdOf(kind, name, posts) {
  for (const p of posts) {
    const id = kind === 'artist' ? p.artist_ids?.[name] : p.labels.find(l => l.name === name)?.id
    if (id) return id
  }
  return null
}

function rolePillStyle(group) {
  const base = { fontFamily: SANS, fontWeight: 600, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: 99, padding: '2px 8px', whiteSpace: 'nowrap', border: '1px solid transparent', justifySelf: 'start' }
  if (group === 'main') return { ...base, background: 'var(--theme-accent)', color: '#fff' }
  return { ...base, color: group === 'guest' ? TER : PRI, borderColor: group === 'guest' ? LINE : SEC, borderStyle: group === 'prod' ? 'dashed' : 'solid' }
}

function Discography({ kind, id, name, allPosts }) {
  const { jump } = useDrawerNav()
  const [openRel, setOpenRel] = useState(null) // 'type:id' of the release open in place
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => { const t = setTimeout(() => setQ(query.trim()), 300); return () => clearTimeout(t) }, [query])

  const qc = useQueryClient()
  const pages = useInfiniteQuery({
    queryKey: ['drawer-discography', kind, id, q],
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ offset: String(pageParam), limit: '100', q })
      const r = await fetch(`${API}/discogs/${kind}/${id}/releases?${qs}`)
      if (!r.ok) throw new Error(`Discogs catalogue: ${r.status}`)
      return r.json()
    },
    // A failed load (Discogs down, a network blip) retries once by itself,
    // then offers "Try again" (2026-10-06).
    retry: 1,
    retryDelay: 2000,
    initialPageParam: 0,
    getNextPageParam: last => {
      if (!last) return undefined
      const next = last.pagination.offset + last.releases.length
      return next < last.pagination.matched ? next : undefined
    },
    enabled: !!id,
    staleTime: 60_000,
    refetchInterval: qy => (qy.state.data?.pages?.[0]?.crawl?.done === false ? 6000 : false),
  })
  const first = pages.data?.pages?.[0]
  const rows = (pages.data?.pages || []).flatMap(pg => pg?.releases || [])

  // Masters come without format/label: their main release's, from the same
  // slow background queue the spotlight uses.
  const infoIds = rows.filter(r => r.type === 'master' && r.mainRelease).map(r => r.mainRelease).slice(0, 300)
  const { data: info } = useQuery({
    queryKey: ['spotlight-release-info', infoIds.join(',')],
    queryFn: async () => { const r = await fetch(`${API}/discogs/release-info?ids=${infoIds.join(',')}`); return r.ok ? r.json() : { info: {} } },
    enabled: infoIds.length > 0,
    staleTime: Infinity,
    refetchInterval: qy => (qy.state.data?.pending > 0 ? 5000 : false),
  })

  const postByRelease = new Map(allPosts.filter(p => p.discogs_id).map(p => [p.discogs_id, p]))
  const total = first?.pagination?.items || 0
  const crawl = first?.crawl
  const right = !first ? '' : crawl && !crawl.done
    ? `collecting ${crawl.have.toLocaleString('en-GB')} of ${crawl.total.toLocaleString('en-GB')}`
    : `${total.toLocaleString('en-GB')} on Discogs`
  const COLS = kind === 'artist' ? '50px minmax(0, 1fr) 76px 40px' : '50px minmax(0, 1fr) 40px'

  if (!id) return <>
    <SectionHead left={kind === 'artist' ? 'Discography' : 'Full catalogue'} />
    <Empty>{name} isn't linked to Discogs yet, so there's no full {kind === 'artist' ? 'discography' : 'catalogue'} to show.</Empty>
  </>

  return <>
    <SectionHead left={kind === 'artist' ? 'Discography' : 'Full catalogue'} right={right} />
    {total > 20 && (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: FILL, border: `1px solid ${LINE}`, borderRadius: 99, padding: '6px 14px', margin: '2px 0 8px' }}>
        <span aria-hidden="true" style={{ color: TER }}>⌕</span>
        <input id={`discography-search-${kind}-${id}`} value={query} onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${total.toLocaleString('en-GB')} releases`} aria-label={`Search ${name}'s releases`}
          style={{ border: 0, outline: 0, background: 'none', flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 15, color: PRI }} />
        {q && first && <span style={{ fontFamily: MONO, fontSize: 12, color: TER }}>{first.pagination.matched.toLocaleString('en-GB')} found</span>}
      </label>
    )}
    {!first ? (pages.isLoading || pages.isFetching ? <Empty>Pulling the Discogs catalogue…</Empty> : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '20px 0' }}>
        <span style={{ fontFamily: SANS, fontSize: 15, color: SEC }}>Couldn’t load the catalogue — Discogs didn’t answer.</span>
        {/* A fresh start, not refetch(): a retry paused while the tab was hidden would just keep waiting. */}
        <button onClick={() => qc.resetQueries({ queryKey: ['drawer-discography', kind, id, q] })}
          style={{ border: `1px solid ${LINE}`, borderRadius: 99, padding: '7px 16px', background: FILL, color: PRI, fontFamily: SANS, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
      </div>
    ))
      : !rows.length ? <Empty>{q ? `No releases match “${q}”.` : 'Nothing found on Discogs.'}</Empty>
      : rows.map(r => {
          const mi = r.type === 'master' ? info?.info?.[r.mainRelease] : null
          const group = kind === 'artist' ? roleGroup(r.role || '') : null
          const onSite = r.type !== 'master' ? postByRelease.get(r.id) : null
          const sub = kind === 'label'
            ? [r.artist, r.catno && !/^none$/i.test(r.catno) ? r.catno : ''].filter(Boolean).join(' · ')
            : [group !== 'main' ? r.artist : '', cleanLabelName(r.label || mi?.label || '')].filter(Boolean).join(' · ')
          // On LNV: go to the post. Otherwise open it here — tracklist and
          // players, like the spotlights (2026-10-06; it used to open Discogs).
          const rk = `${r.type}:${r.id}`, isOpen = openRel === rk
          const open = () => onSite ? jump(onSite.id) : setOpenRel(isOpen ? null : rk)
          return (<div key={rk}>
            <Row onClick={open} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '7px 10px', ...(isOpen ? { background: HOVER } : null) }}>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center', border: `1px solid ${TER}`, borderRadius: 5, padding: '2px 0', color: PRI }}>{releaseTag(r.format || mi?.format || '', r.title)}</span>
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {onSite && <span title={`On LNV as ${pad(onSite.id)}`} style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--theme-accent)', marginRight: 7, verticalAlign: 'middle' }} />}
                  {r.title}
                </span>
                {sub && <span style={{ fontFamily: SANS, fontStyle: 'italic', fontSize: 13.5, color: SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
              </span>
              {kind === 'artist' && <span style={rolePillStyle(group)}>{ROLE_PILL[group]}</span>}
              <span style={{ fontFamily: MONO, fontSize: 12, color: TER, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.year || ''}</span>
            </Row>
            {isOpen && <ReleasePreview release={r} artistName={kind === 'artist' ? name : r.artist || ''} />}
          </div>)
        })}
    {pages.hasNextPage && (
      <button onClick={() => pages.fetchNextPage()} disabled={pages.isFetchingNextPage}
        style={{ marginTop: 10, border: `1px solid ${LINE}`, background: 'none', borderRadius: 99, padding: '5px 14px', fontFamily: SANS, fontSize: 13, color: SEC, cursor: 'pointer' }}>
        {pages.isFetchingNextPage ? 'Loading…' : 'Show 100 more'}
      </button>
    )}
  </>
}

// ── Artists ───────────────────────────────────────────────────────────────────
export function ArtistsDrawer({ filter: initial }) {
  const { data, isLoading } = useBrowse()
  const [selected, setSelected] = useState(initial || null)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('az')
  if (isLoading || !data) return <><DrawerHead title="Artists" count="" /><Loading /></>
  const records = data.filter(p => !isLiveSet(p))
  const groups = group(records, p => p.artists.filter(a => !isVarious(a)))

  if (selected) {
    const ps = groups.get(selected) || []
    const enc = encodeURIComponent(selected)
    return <>
      <DrawerHead title={selected} count={plural(ps.length, 'post')} crumb="Artists" onBack={() => setSelected(null)} action={!/^various( artists)?$/i.test(selected) && <FavHeart kind="artist" name={selected} size={24} style={{ alignSelf: 'center', color: SEC }} />} />
      <DrawerBody>
        <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 16, alignItems: 'end', margin: '6px 0 4px' }}>
          <Cover src={ps[0]?.cover} size={96} radius={18} />
          <div style={{ display: 'grid', gap: 8 }}>
            <Facts lines={[uniq(ps.flatMap(p => p.labels.map(l => l.name))).join(' · '), yearSpan(ps)]} />
            <Tags names={uniq(ps.flatMap(p => p.genres)).slice(0, 8)} />
          </div>
        </div>
        <SectionHead left="On the feed" right="newest first" />
        {ps.length ? ps.map(p => <PostRow key={p.id} post={p} right={<>{p.labels[0]?.name || ''}{p.year ? <><br />{p.year}</> : null}</>} />) : <Empty>No posts by {selected} yet.</Empty>}
        <Discography kind="artist" id={discogsIdOf('artist', selected, ps)} name={selected} allPosts={data} />
        <SectionHead left="Elsewhere" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <ExtLink href={`https://www.discogs.com/search/?q=${enc}&type=artist`}>◈ Discogs</ExtLink>
          <ExtLink href={`https://www.youtube.com/results?search_query=${enc}`}>▶ YouTube</ExtLink>
        </div>
      </DrawerBody>
    </>
  }
  return <>
    <DrawerHead title="Artists" count={plural(groups.size, 'artist')} filter={filter} setFilter={setFilter}><Chips options={SORTS} value={sort} onChange={setSort} /></DrawerHead>
    <DrawerBody><NameList groups={groups} sort={sort} filter={filter} noun="artists" onOpen={setSelected} sub={ps => uniq(ps.flatMap(p => p.labels.map(l => l.name))).join(' · ')} /></DrawerBody>
  </>
}

const ExtLink = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" style={{ border: `1px solid ${LINE}`, borderRadius: 99, padding: '3px 10px', fontFamily: SANS, fontSize: 13, color: SEC, textDecoration: 'none' }}>{children}</a>
)

// ── Labels ────────────────────────────────────────────────────────────────────
export function LabelsDrawer({ filter: initial }) {
  const { data, isLoading } = useBrowse()
  const [selected, setSelected] = useState(initial || null)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('az')
  if (isLoading || !data) return <><DrawerHead title="Labels" count="" /><Loading /></>
  const records = data.filter(p => !isLiveSet(p))
  const groups = group(records, p => p.labels.map(l => l.name))
  const artistsOf = ps => uniq(ps.flatMap(p => p.artists.filter(a => !isVarious(a))))

  if (selected) {
    const ps = [...(groups.get(selected) || [])].sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.id - b.id)
    return <>
      <DrawerHead title={selected} count={plural(ps.length, 'post')} crumb="Labels" onBack={() => setSelected(null)} action={<FavHeart kind="label" name={selected} size={24} style={{ alignSelf: 'center', color: SEC }} />} />
      <DrawerBody>
        <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 16, alignItems: 'end', margin: '6px 0 4px' }}>
          <Cover src={ps[0]?.cover} size={96} round />
          <div style={{ display: 'grid', gap: 8 }}>
            <Facts lines={[artistsOf(ps).join(' · '), yearSpan(ps)]} />
            <Tags names={uniq(ps.flatMap(p => p.genres)).slice(0, 8)} />
          </div>
        </div>
        <SectionHead left="On the feed" right="by year" />
        {ps.length ? ps.map(p => <PostRow key={p.id} post={p} right={<>{p.labels.find(l => l.name === selected)?.catno || ''}{p.year ? <><br />{p.year}</> : null}</>} />) : <Empty>No posts on {selected} yet.</Empty>}
        <Discography kind="label" id={discogsIdOf('label', selected, ps)} name={selected} allPosts={data} />
        <SectionHead left="Elsewhere" />
        <ExtLink href={`https://www.discogs.com/search/?q=${encodeURIComponent(selected)}&type=label`}>◈ Discogs</ExtLink>
      </DrawerBody>
    </>
  }
  return <>
    <DrawerHead title="Labels" count={plural(groups.size, 'label')} filter={filter} setFilter={setFilter}><Chips options={SORTS} value={sort} onChange={setSort} /></DrawerHead>
    <DrawerBody><NameList groups={groups} sort={sort} filter={filter} noun="labels" onOpen={setSelected} sub={ps => artistsOf(ps).slice(0, 3).join(' · ')} /></DrawerBody>
  </>
}

// ── Genres ────────────────────────────────────────────────────────────────────
// Grouped the way Discogs does it: each genre with a bar for its share of
// the feed, and the styles posted under it beneath.
export function GenresDrawer({ filter: initial }) {
  const { data, isLoading } = useBrowse()
  const [selected, setSelected] = useState(initial || null)
  const [filter, setFilter] = useState('')
  if (isLoading || !data) return <><DrawerHead title="Genres" count="" /><Loading /></>
  const records = data.filter(p => !isLiveSet(p))
  const groups = group(records, p => p.genres)

  if (selected) {
    const ps = groups.get(selected) || []
    const alongside = [...group(ps, p => p.genres.filter(g => g !== selected)).entries()]
      .sort((a, b) => b[1].length - a[1].length).map(([name, l]) => ({ name, count: l.length }))
    return <>
      <DrawerHead title={selected} count={plural(ps.length, 'post')} crumb="Genres" onBack={() => setSelected(null)} />
      <DrawerBody>
        {alongside.length > 0 && <><SectionHead left={TOP_GENRES.has(selected) ? 'Styles' : 'Alongside it'} /><Tags names={alongside} /></>}
        <SectionHead left="On the feed" right="newest first" />
        {ps.length ? ps.map(p => <PostRow key={p.id} post={p} right={<>{p.labels[0]?.name || ''}{p.year ? <><br />{p.year}</> : null}</>} />) : <Empty>Nothing tagged {selected} yet.</Empty>}
      </DrawerBody>
    </>
  }

  const tops = [...groups.entries()].filter(([g]) => TOP_GENRES.has(g)).sort((a, b) => b[1].length - a[1].length)
  const max = Math.max(1, ...tops.map(t => t[1].length))
  const loose = [...groups.keys()].filter(g => !TOP_GENRES.has(g) && !tops.some(([, ps]) => ps.some(p => p.genres.includes(g))))
  const blocks = tops.map(([g, ps]) => {
    const styles = [...group(ps, p => p.genres.filter(s => !TOP_GENRES.has(s))).entries()]
      .filter(([s]) => matches(filter, s, g)).sort((a, b) => b[1].length - a[1].length)
    if (!matches(filter, g) && !styles.length) return null
    return (
      <div key={g} style={{ marginBottom: 10 }}>
        <Row onClick={() => setSelected(g)} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px' }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17 }}>{g}</span>
          <span style={{ fontFamily: MONO, fontSize: 12.5, color: TER }}>{plural(ps.length, 'post')}</span>
          <span style={{ gridColumn: '1 / -1', height: 4, borderRadius: 2, background: FILL, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.round(ps.length / max * 100)}%`, background: 'var(--theme-accent)', borderRadius: 2 }} />
          </span>
        </Row>
        <div style={{ marginTop: 4 }}><Tags names={styles.map(([name]) => ({ name, count: groups.get(name).length }))} /></div>
      </div>
    )
  }).filter(Boolean)
  const looseShown = loose.filter(g => matches(filter, g))
  const styleCount = [...groups.keys()].filter(g => !TOP_GENRES.has(g)).length
  return <>
    <DrawerHead title="Genres" count={`${plural(tops.length, 'genre')} · ${plural(styleCount, 'style')}`} filter={filter} setFilter={setFilter} />
    <DrawerBody>
      {blocks}
      {looseShown.length > 0 && <><SectionHead left="Other tags" /><Tags names={looseShown.map(name => ({ name, count: groups.get(name).length }))} /></>}
      {!blocks.length && !looseShown.length && <Empty>No genres match “{filter}”.</Empty>}
    </DrawerBody>
  </>
}

// ── Live sets ─────────────────────────────────────────────────────────────────
// `filter` (2026-10-02): a live-set card's DJ name opens the drawer
// already filtered to that DJ's sets.
export function LiveDrawer({ filter: initial }) {
  const { data, isLoading } = useBrowse()
  const { jump } = useDrawerNav()
  const [filter, setFilter] = useState(initial || '')
  const [where, setWhere] = useState('all')
  const [sort, setSort] = useState('dj') // 'dj' = grouped by DJ, 'new' = one list, newest first
  if (isLoading || !data) return <><DrawerHead title="Live sets" count="" /><Loading /></>
  const sets = data.filter(isLiveSet).map(p => ({ ...p, ...liveInfo(p) }))
  // Same DJ, place and date posted more than once: flag the later ones.
  const seen = new Map()
  for (const s of [...sets].sort((a, b) => a.id - b.id)) {
    const k = [s.dj, s.where, s.date].join('|').toLowerCase()
    if (s.date && seen.has(k)) s.dupOf = seen.get(k); else seen.set(k, s.id)
  }
  const places = uniq(sets.map(s => s.where).filter(w => w !== '—'))
  const shown = sets.filter(s => (where === 'all' || s.where === where) && matches(filter, s.dj, s.where, s.title))
  // Sets arrive newest first, so each group (and the flat list) already is.
  const byDj = sort === 'new'
    ? (shown.length ? [['Recently posted', shown]] : [])
    : [...group(shown, s => [s.dj]).entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  return <>
    <DrawerHead title="Live sets" count={plural(sets.length, 'set')} filter={filter} setFilter={setFilter}>
      <Chips options={[['dj', 'By DJ'], ['new', 'Recently posted']]} value={sort} onChange={setSort} />
      {places.length > 1 && <Chips options={[['all', 'All'], ...places.map(p => [p, p])]} value={where} onChange={setWhere} />}
    </DrawerHead>
    <DrawerBody>
      {!sets.length && <Empty>No live sets posted yet.</Empty>}
      {sets.length > 0 && !shown.length && <Empty>No sets match.</Empty>}
      {byDj.map(([dj, list]) => (
        <div key={dj}>
          <SectionHead left={dj} right={plural(list.length, 'set')} />
          {list.map(s => {
            const yt = (s.stream_url || '').match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1]
            const thumb = yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : s.cover
            return (
              <Row key={s.id} onClick={() => jump(s.id)} style={{ display: 'grid', gridTemplateColumns: '168px minmax(0, 1fr)', gap: 14 }}>
                {h => <>
                  <span style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 14, overflow: 'hidden', background: thumb ? `#000 center/cover no-repeat url("${thumb}")` : 'linear-gradient(135deg, var(--theme-dark2), var(--theme-dark1))' }}>
                    <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.9)', fontSize: 20.5, textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>▶</span>
                  </span>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontFamily: MONO, fontSize: 14, color: TER }}>
                      {pad(s.id)}
                      {s.dupOf && <span title={`Same set as ${pad(s.dupOf)}`} style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--theme-accent)', border: '1px solid currentColor', borderRadius: 4, padding: '0 4px', marginLeft: 6 }}>duplicate of {pad(s.dupOf)}?</span>}
                    </span>
                    <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 19.5, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.dj}</span>
                    <span style={{ fontFamily: SANS, fontStyle: 'italic', fontSize: 15, color: SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[s.where !== '—' && s.where, s.date].filter(Boolean).join(' · ')}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--theme-accent)', opacity: h ? 1 : 0 }}>go to set →</span>
                  </span>
                </>}
              </Row>
            )
          })}
        </div>
      ))}
    </DrawerBody>
  </>
}

// ── About (absorbed the old readme, 2026-10-01) ───────────────────────────────
export function AboutDrawer() {
  const h3 = { fontFamily: SANS, fontSize: 15, fontWeight: 700, color: PRI, margin: '22px 0 6px' }
  const p = { fontFamily: SANS, fontSize: 16, lineHeight: 1.55, color: SEC, margin: '0 0 8px', maxWidth: '46ch' }
  const kbd = { fontFamily: MONO, fontSize: 12.5, border: `1px solid ${LINE}`, borderRadius: 4, padding: '0 5px' }
  return <>
    <DrawerHead title="About" count="est. 2024" />
    <DrawerBody>
      <p style={{ ...p, fontSize: 19.5, color: PRI, marginTop: 6 }}>Late Night Vibes is a record shelf you scroll sideways. People post what they're playing, and the site files it by artist, label and genre.</p>
      <h3 style={h3}>Finding your way</h3>
      <ul style={{ margin: 0, paddingLeft: 18, color: SEC, fontFamily: SANS, fontSize: 16, lineHeight: 1.7 }}>
        <li>Scroll or drag to move along the feed.</li>
        <li>Every post has a number, like a page. Press <kbd style={kbd}>/</kbd> and type <kbd style={kbd}>54</kbd> to go straight to it.</li>
        <li>The search finds artists, labels, genres, tracks and catalogue numbers.</li>
        <li>Click a cover to play it, or a track to play that one. ▶ on the strip plays something at random.</li>
      </ul>
      {/* 2026-10-04: the players are the platforms' own, ads included — so
          point people at the ways to hear them without. No ad-blocker
          suggestions: the YouTube embed terms forbid encouraging that. */}
      <h3 style={h3}>Listening without interruptions</h3>
      <p style={p}>The players here are each platform’s own, so their ads come with them. A few ways to keep the music going:</p>
      <ul style={{ margin: '0 0 8px', paddingLeft: 18, color: SEC, fontFamily: SANS, fontSize: 16, lineHeight: 1.7, maxWidth: '46ch' }}>
        <li><b style={{ color: PRI }}>Sign in to your platforms</b> in this browser — YouTube, SoundCloud, Mixcloud, Spotify. Your own account and settings follow you into the players here.</li>
        <li><b style={{ color: PRI }}>YouTube Premium</b> removes YouTube’s ads in these players too, as long as you’re signed in to YouTube.</li>
        <li><b style={{ color: PRI }}>Bandcamp has no ads</b> — and buying there pays artists directly. Look for the BUY ↗ link on a card.</li>
      </ul>
      <h3 style={h3}>Posting</h3>
      <p style={p}>Hit + on the feed, paste a Discogs, YouTube, SoundCloud or Bandcamp link, and the form fills itself in. Add a post title and a few lines on why it matters.</p>
      {/* 2026-10-05: the introductions' rules, in full (Collect.jsx IntroCard,
          backend collectionsService introductionsFor). Keep them in step. */}
      <h3 style={h3}>Introductions <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', border: `1px solid ${LINE}`, borderRadius: 99, padding: '1px 7px', verticalAlign: 'middle' }}>α ALPHA</span></h3>
      <p style={p}>Now and then your feed introduces someone you might like to follow. It's a fixed set of rules, written here in full. Nothing learns from you, and nothing is tuned to keep you scrolling.</p>
      <ol style={{ margin: '0 0 8px', paddingLeft: 20, color: SEC, fontFamily: SANS, fontSize: 16, lineHeight: 1.6, maxWidth: '46ch' }}>
        <li><b style={{ color: PRI }}>Your feed's order never changes.</b> Posts stay newest first; an introduction slots in between, at most once every eight cards and never before the eighth.</li>
        <li><b style={{ color: PRI }}>Every introduction says why:</b> people you follow follow them, you both post the same artists, labels or records — or both.</li>
        <li><b style={{ color: PRI }}>Only what people choose to post counts</b> — their posts and the records they ♥. Likes, plays, replies and time spent are never used.</li>
        <li><b style={{ color: PRI }}>Rarer is stronger.</b> Sharing a small label says more than sharing a big one.</li>
        <li><b style={{ color: PRI }}>Only people with at least 5 posts</b> are introduced, and nobody is suggested to more than 20 people a week.</li>
        <li><b style={{ color: PRI }}>× means no, for good.</b> Undo it on your profile.</li>
        <li><b style={{ color: PRI }}>Turn them off</b> any time — the switch is on your profile, under Friends' posts.</li>
      </ol>
      <h3 style={h3}>Contact</h3>
      <p style={p}>hello@latenightvibes.com · @latenightvibes</p>
      <h3 style={h3}>Built with</h3>
      <p style={{ ...p, fontFamily: MONO, fontSize: 14 }}>React · Node · SQLite · Discogs API · YouTube Data API</p>
    </DrawerBody>
  </>
}

// Shared with the walls and playlists drawers (CollectionDrawers.jsx).
export { Chips, SectionHead, Row, Cover, Empty, Loading, ExtLink }
