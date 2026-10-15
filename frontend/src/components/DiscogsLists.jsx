import { useState, useEffect } from 'react'
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { authHeaders } from '../lib/auth'
import { playlistsApi } from '../lib/collections'
import { discogsAccountApi, useDiscogsAccount } from '../lib/discogsAccount'
import { releaseTag } from '../lib/catalogue'
import { DrawerHead, DrawerBody, Row, Cover, Empty, Loading } from './Drawers'
import ReleasePreview from './ReleasePreview'
import { DiscogsConnect } from './DiscogsConnect'

// Your Discogs collection and wantlist as playlists (2026-10-08, gabriel). They sit in the
// Playlists drawer like any other, but hold RELEASES: a row opens into the usual release preview
// (tracklist, players, "+ add to my feed"). A record nothing is found for is faded with
// "media unplayable". Backend: services/discogsAccount.js.

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)', LINE = 'var(--theme-border)'
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
const pill = { border: `1px solid ${LINE}`, background: 'none', color: PRI, borderRadius: 99, padding: '5px 14px', fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: 'pointer' }

// ── a collection / wantlist playlist ──────────────────────────────────────────

export function ReleaseListView({ id, onBack }) {
  const qc = useQueryClient()
  const { data: st } = useDiscogsAccount()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [openId, setOpenId] = useState(null)
  const [manage, setManage] = useState(false)
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t) }, [q])

  const { data: pl } = useQuery({ queryKey: ['playlist', id], queryFn: () => playlistsApi.get(id) })
  const live = st?.state === 'importing' || (st?.checked && st.checked.done < st.checked.total)
  const pages = useInfiniteQuery({
    queryKey: ['playlist-releases', id, debounced, st?.collection?.imported, st?.wantlist?.imported, st?.checked?.done],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const res = await fetch(`${API}/playlists/${id}/releases?offset=${pageParam}&limit=100&q=${encodeURIComponent(debounced)}`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Couldn’t load this list.')
      return res.json()
    },
    getNextPageParam: (last, all) => { const n = all.reduce((s, p) => s + p.releases.length, 0); return n < last.total ? n : undefined },
    placeholderData: prev => prev,
    refetchInterval: live ? 20000 : false,
  })
  const rows = (pages.data?.pages || []).flatMap(p => p.releases)
  const total = pages.data?.pages?.[0]?.total ?? 0
  const kind = pl?.kind
  const name = pl?.name || (kind === 'wantlist' ? 'My Discogs wantlist' : 'My Discogs collection')
  const unplayable = rows.filter(r => r.playable === 0).length

  return <>
    <DrawerHead title={name} count={debounced ? `${total} match` : plural(total, 'record')} crumb="Playlists" onBack={onBack} filter={q} setFilter={setQ}>
      <div style={{ fontFamily: SANS, fontSize: 13.5, color: SEC }}>
        from Discogs{st?.username ? ` · ${st.username}` : ''} · private
        {st?.state === 'importing' ? ' · importing…' : ''}
        {st?.checked && st.checked.done < st.checked.total ? ` · checking what plays ${st.checked.done} of ${st.checked.total}` : ''}
      </div>
      {st?.error && <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--theme-accent)' }}>{st.error}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => discogsAccountApi.sync().then(() => qc.invalidateQueries({ queryKey: ['discogs-account'] }))} disabled={st?.state === 'importing'} style={{ ...pill, opacity: st?.state === 'importing' ? 0.5 : 1 }}>refresh from Discogs</button>
        <button onClick={() => setManage(true)} style={pill}>manage</button>
        {unplayable > 0 && <span style={{ alignSelf: 'center', fontFamily: MONO, fontSize: 11.5, color: TER }}>{unplayable} unplayable</span>}
      </div>
    </DrawerHead>
    <DrawerBody>
      {pages.isLoading ? <Loading />
        : !rows.length ? <Empty>{debounced ? `No records match “${debounced}”.` : st?.state === 'importing' ? 'Importing from Discogs…' : 'Nothing here yet. If your Discogs list is private, make it public on Discogs and refresh.'}</Empty>
        : rows.map(r => {
          const dead = r.playable === 0
          const isOpen = openId === r.discogs_id
          const sub = [r.artist, r.label, r.catno && !/^none$/i.test(r.catno) ? r.catno : ''].filter(Boolean).join(' · ')
          return (<div key={r.discogs_id}>
            <Row onClick={() => setOpenId(isOpen ? null : r.discogs_id)} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '7px 10px', opacity: dead && !isOpen ? 0.45 : 1, ...(isOpen ? { background: 'color-mix(in srgb, var(--theme-text-pri) 7%, transparent)' } : null) }}>
              <Cover src={r.cover} size={40} radius={8} />
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                <span style={{ fontFamily: SANS, fontStyle: 'italic', fontSize: 13.5, color: SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontFamily: MONO, fontSize: 12, color: TER, fontVariantNumeric: 'tabular-nums' }}>
                <span>{r.year || ''}{r.format ? ` · ${releaseTag(r.format, r.title)}` : ''}</span>
                {dead && <span style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>media unplayable</span>}
              </span>
            </Row>
            {isOpen && <ReleasePreview release={{ id: r.discogs_id, type: 'release', thumb: r.cover, year: r.year, artist: r.artist }} artistName={r.artist || ''} />}
          </div>)
        })}
      {pages.hasNextPage && (
        <button onClick={() => pages.fetchNextPage()} disabled={pages.isFetchingNextPage} style={{ ...pill, marginTop: 10, fontWeight: 400, color: SEC }}>
          {pages.isFetchingNextPage ? 'Loading…' : 'Show 100 more'}
        </button>
      )}
    </DrawerBody>
    {manage && <DiscogsConnect onClose={() => setManage(false)} />}
  </>
}
