import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import TrackPlayer from './TrackPlayer'
import { AddToPlaylistButton } from './Collect'
import { toEmbedSrc } from '../lib/embeds'

// A Discogs release opened in place (2026-10-06, gabriel: "like on the
// spotlights, see the release tracklist and embeds here to keep traffic on
// our site") — used by the artist and label drawers for releases that
// aren't on LNV yet. Same rules as the spotlight's open row (Feed.jsx
// SpotlightCard): a master resolves to its main release; each track plays
// from Discogs' own videos, a saved link, or one capped, cached YouTube
// search on click; the album plays through, searching at most 3 missing
// tracks per step. "+ add to my feed" opens the composer on it.

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)'
const LINE = 'var(--theme-border)'
const normT = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export default function ReleasePreview({ release, artistName = '' }) {
  const qc = useQueryClient()
  const [playing, setPlaying] = useState(null)  // { i, url }
  const [found, setFound] = useState({})        // i -> url | 'none' | 'capped'
  const [searching, setSearching] = useState(null)
  const discogsUrl = `https://www.discogs.com/${release.type === 'master' ? 'master' : 'release'}/${release.id}`

  const { data: full, isLoading, isError } = useQuery({
    queryKey: ['spotlight-release', release.type || 'release', release.id],
    queryFn: async () => {
      let id = release.id
      if (release.type === 'master') {
        const r = await fetch(`${API}/discogs/resolve-url?url=${encodeURIComponent(discogsUrl)}`)
        const d = await r.json().catch(() => ({}))
        if (!d.releaseId) return null
        id = d.releaseId
      }
      const res = await fetch(`${API}/discogs/release/${id}`)
      if (!res.ok) throw new Error(`release ${res.status}`)
      return res.json()
    },
    staleTime: Infinity,
    retry: 1,
  })
  const releaseId = full?.discogsId || null
  const { data: saved } = useQuery({
    queryKey: ['release-track-links', releaseId],
    queryFn: async () => { const r = await fetch(`${API}/discogs/release/${releaseId}/track-links`); return r.ok ? r.json() : { links: {} } },
    enabled: !!releaseId,
    staleTime: Infinity,
  })

  const tracks = (full?.tracklist || []).map(t => {
    const tt = normT(t.title)
    const video = tt && (full.videos || []).find(v => /youtu/.test(v.url || '') && normT(v.title).includes(tt))
    const link = saved?.links?.[t.position]
    return { position: t.position, title: t.title, duration: t.duration, artists: t.artists, url: video?.url || link?.url || '', knownMiss: !!link && !link.url }
  })
  const urlOf = (t, i) => t.url || (found[i] && found[i] !== 'none' && found[i] !== 'capped' ? found[i] : '')

  async function play(t, i) {
    const url = urlOf(t, i)
    if (url) { setPlaying(p => (p?.i === i ? null : { i, url })); return 'played' }
    if (searching != null) return 'busy'
    setSearching(i)
    try {
      const artist = (t.artists || []).map(a => a.name).join(' ') || (full?.artists || []).map(a => a.name).join(' ') || artistName
      const q = new URLSearchParams({ artist, title: t.title || '', label: '' })
      if (releaseId && t.position) { q.set('release_id', releaseId); q.set('position', t.position) }
      const d = await (await fetch(`${API}/discogs/youtube/search?${q}`)).json()
      if (releaseId && t.position && !d.capped) {
        qc.setQueryData(['release-track-links', releaseId], old => ({ links: { ...(old?.links || {}), [t.position]: { url: d.youtube_url || null, title: d.youtube_title || null } } }))
      }
      if (d.youtube_url) { setFound(m => ({ ...m, [i]: d.youtube_url })); setPlaying({ i, url: d.youtube_url }); return 'played' }
      setFound(m => ({ ...m, [i]: d.capped ? 'capped' : 'none' }))
      return d.capped ? 'capped' : 'none'
    } catch {
      setFound(m => ({ ...m, [i]: 'none' }))
      return 'none'
    } finally {
      setSearching(null)
    }
  }
  // When track i ends: the next one with (or able to get) a link.
  async function playNext(i) {
    let searches = 0
    for (let j = i + 1; j < tracks.length; j++) {
      const t = tracks[j], url = urlOf(t, j)
      if (url) { setPlaying({ i: j, url }); return }
      if (t.knownMiss || found[j] === 'none') continue
      if (found[j] === 'capped' || searches >= 3) return
      searches++
      const r = await play(t, j)
      if (r === 'played' || r === 'capped') return
    }
  }

  const cover = full?.coverImage || full?.thumbImage || release.thumb || null
  const btn = { border: `1px solid ${LINE}`, borderRadius: 99, padding: '7px 16px', background: 'none', color: PRI, fontFamily: SANS, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }

  return (
    <div style={{ padding: '10px 0 16px', borderBottom: `1px solid ${LINE}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr)', gap: 14, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ width: 88, height: 88, borderRadius: 10, background: cover ? `var(--theme-dark2) center/cover no-repeat url("${cover}")` : 'var(--theme-dark2)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: TER, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[full?.labels?.[0]?.name, full?.labels?.[0]?.catno, full?.year || release.year, full?.country].filter(x => x && !/^none$/i.test(x)).join(' · ')}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => window.dispatchEvent(new CustomEvent('lnv:compose', { detail: { url: discogsUrl } }))}
              style={{ ...btn, border: 0, background: 'var(--theme-accent)', color: '#fff' }}>+ add to my feed</button>
            <a href={discogsUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn, fontWeight: 400, color: SEC }}>Discogs ↗</a>
          </div>
        </div>
      </div>

      {isLoading ? <p style={{ margin: 0, fontFamily: MONO, fontSize: 12, color: TER }}>fetching tracklist…</p>
        : isError || !full ? <p style={{ margin: 0, fontFamily: SANS, fontSize: 14, color: SEC }}>Couldn’t fetch this release from Discogs.</p>
        : tracks.length === 0 ? <p style={{ margin: 0, fontFamily: MONO, fontSize: 12, color: TER }}>no tracklist</p>
        : tracks.map((t, i) => {
            const url = urlOf(t, i)
            const isPlaying = playing?.i === i
            const miss = found[i] === 'none' || (t.knownMiss && !url)
            const state = searching === i ? '…' : miss ? '—' : found[i] === 'capped' ? '×' : isPlaying ? '▶' : '▷'
            const tr = { post_id: null, position: t.position || null, title: t.title, artist: (t.artists || []).map(a => a.name).join(', ') || (full.artists || []).map(a => a.name).join(', ') || artistName, url, embed_url: null, duration: t.duration || null, cover }
            return (
              <div key={i}>
                <div style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) 46px 18px 26px', gap: 10, alignItems: 'baseline', padding: '5px 0', borderBottom: `1px dotted ${LINE}`, background: isPlaying ? 'color-mix(in srgb, var(--theme-accent) 14%, transparent)' : 'transparent' }}>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, color: TER }}>{t.position || i + 1}</span>
                  <button onClick={() => { if (!miss) play(t, i) }} disabled={miss}
                    title={miss ? 'no YouTube link found' : found[i] === 'capped' ? "today's YouTube search limit is reached" : url ? 'play' : 'find on YouTube and play'}
                    style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: miss ? 'default' : 'pointer', fontFamily: SANS, fontSize: 14.5, color: isPlaying ? PRI : SEC, fontWeight: isPlaying ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</button>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, color: TER, textAlign: 'right' }}>{t.duration || ''}</span>
                  <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 12, color: isPlaying ? 'var(--theme-accent)' : TER, textAlign: 'right' }}>{state}</span>
                  <span style={{ textAlign: 'right' }}>{url && <AddToPlaylistButton tracks={[tr]} label="+" align="right" style={{ fontFamily: MONO, fontSize: 12, color: TER }} />}</span>
                </div>
                {isPlaying && toEmbedSrc(playing.url) && (
                  <div style={{ width: '100%', aspectRatio: '16 / 9', maxHeight: 260, margin: '8px 0 10px', borderRadius: 12, overflow: 'hidden' }}>
                    <TrackPlayer key={playing.url} src={toEmbedSrc(playing.url)} title={t.title} autoplay onEnded={() => playNext(i)} />
                  </div>
                )}
              </div>
            )
          })}
    </div>
  )
}
