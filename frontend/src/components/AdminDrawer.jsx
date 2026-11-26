import { useState, useEffect } from 'react'
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { DrawerHead, DrawerBody } from './Drawers'
import { authHeaders } from '../lib/auth'

// ── Admin drawer (2026-10-02) ─────────────────────────────────────────────────
// Only offered to admin accounts (the strip's admin button), and every call
// it makes is checked server-side (/api/admin, requireAdmin). Three tabs:
//   Status — email set-up + test send, counts, YouTube quota, crawl progress
//   Logs   — the app log: sign-ins, resets, posts, mail, crawls, errors
//   Users  — accounts, confirm/admin state, and the actions an admin needs

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)', LINE = 'var(--theme-border)'
const FILL = 'color-mix(in srgb, var(--theme-text-pri) 7%, transparent)'
// Semantic colours, separate from the palette's accent.
const LEVEL = { error: '#d1462f', warn: '#d39b1e', info: 'var(--theme-text-ter)' }

const getJson = async path => {
  const r = await fetch(`${API}/admin${path}`, { headers: authHeaders() })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`)
  return d
}
const postJson = async (path, body = {}) => {
  const r = await fetch(`${API}/admin${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`)
  return d
}

const n = v => Number(v || 0).toLocaleString('en-GB')
const durMs = ms => { const s = Math.round((ms || 0) / 1000); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s` }
const ago = iso => {
  if (!iso) return '—'
  const t = new Date(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z').getTime()
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
const dur = sec => sec < 3600 ? `${Math.round(sec / 60)}m` : sec < 86400 ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m` : `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`

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

const Section = ({ title, right, children }) => (
  <section style={{ marginTop: 22 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontWeight: 600, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: TER, margin: '0 0 8px' }}><span>{title}</span><span>{right}</span></div>
    {children}
  </section>
)
const Note = ({ tone, children }) => (
  <div role={tone === 'error' ? 'alert' : 'status'} style={{ border: `1px solid ${tone === 'error' ? LEVEL.error : tone === 'warn' ? LEVEL.warn : LINE}`, borderRadius: 12, padding: '10px 14px', fontFamily: SANS, fontSize: 14, lineHeight: 1.45, color: tone === 'error' ? LEVEL.error : SEC }}>{children}</div>
)
const Btn = ({ children, ...p }) => (
  <button {...p} style={{ border: `1px solid ${LINE}`, background: FILL, borderRadius: 99, padding: '5px 14px', fontFamily: SANS, fontSize: 13, color: PRI, cursor: p.disabled ? 'default' : 'pointer', opacity: p.disabled ? 0.5 : 1, ...p.style }}>{children}</button>
)
function Bar({ value, max, mark }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ position: 'relative', height: 6, borderRadius: 99, background: FILL, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'var(--theme-accent)', borderRadius: 99 }} />
      {mark != null && <div title="Background crawls stop here" style={{ position: 'absolute', top: 0, bottom: 0, left: `${mark * 100}%`, width: 2, background: PRI, opacity: 0.5 }} />}
    </div>
  )
}

// ── Status ──
// Gaps (2026-10-06): what's still missing in the DB — the gap sweep
// (backend services/gapSweeper.js) fills these every 6 hours; "Run now"
// starts it at once and says what it filled.
// Services today (2026-10-06): how hard each outside service is being
// asked — real requests only, cache hits don't count. LNV tries the
// cheapest source first for each job, so the load spreads between them.
// Flow (2026-10-22): how the accounts that switched activity recording on move through the site and listen (backend services/flow.js).
// Research only: aggregates, shown to admins; nothing here steers what anyone hears.
const FlowList = ({ rows, left, right }) => rows?.length ? rows.slice(0, 6).map((r, i) => (
  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontFamily: SANS, fontSize: 14, color: SEC }}>
    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left(r)}</span>
    <span style={{ fontFamily: MONO, fontSize: 12.5, color: TER, whiteSpace: 'nowrap' }}>{right(r)}</span>
  </div>
)) : <div style={{ fontFamily: SANS, fontSize: 14, color: TER }}>Nothing yet.</div>
const FlowSub = ({ children }) => <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: TER, margin: '14px 0 4px' }}>{children}</div>

function FlowSection() {
  const [days, setDays] = useState(30)
  const { data, error } = useQuery({ queryKey: ['admin-flow', days], queryFn: () => getJson(`/flow?days=${days}`), staleTime: 30_000 })
  return (
    <Section title="How people move" right={data ? `${n(data.people)} ${data.people === 1 ? 'person' : 'people'} · ${n(data.sessions)} visits · last ${data.days} days` : ''}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} aria-pressed={days === d}
            style={{ border: `1px solid ${days === d ? PRI : LINE}`, background: days === d ? PRI : 'none', color: days === d ? 'var(--theme-bg)' : SEC, borderRadius: 99, padding: '2px 10px', fontFamily: SANS, fontSize: 13, cursor: 'pointer' }}>{d} days</button>
        ))}
      </div>
      {error && <Note tone="error">{error.message}</Note>}
      {data && (data.sessions === 0
        ? <Note>No visits recorded yet. Only accounts with activity recording switched on appear here.</Note>
        : <>
          <div style={{ fontFamily: SANS, fontSize: 14, color: SEC, lineHeight: 1.6 }}>
            Visits last {durMs(data.session_ms.average)} on average (median {durMs(data.session_ms.median)}, longest {durMs(data.session_ms.longest)}).
            {' '}{n(data.listening.listens)} listens, {durMs(data.listening.total_ms)} in all, {Math.round(data.listening.finish_rate * 100)}% played to the end.
            {' '}{n(data.searches)} searches, {n(data.compose_opens)} times the post window was opened.
          </div>
          <FlowSub>Where the time goes</FlowSub>
          <FlowList rows={data.time_in_views} left={r => r.view} right={r => durMs(r.ms)} />
          <FlowSub>What leads where (click → view)</FlowSub>
          <FlowList rows={data.what_led_where} left={r => r.lead} right={r => `${n(r.n)}×`} />
          <FlowSub>Paths (view → view)</FlowSub>
          <FlowList rows={data.paths} left={r => r.path} right={r => `${n(r.n)}×`} />
          <FlowSub>Most clicked</FlowSub>
          <FlowList rows={data.top_clicks} left={r => r.target} right={r => `${n(r.n)}×`} />
          <FlowSub>Listening by player</FlowSub>
          <FlowList rows={data.listening.by_platform} left={r => r.platform} right={r => `${n(r.listens)} · ${durMs(r.ms)}`} />
          <FlowSub>Where visits start and end</FlowSub>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div><FlowList rows={data.first_view} left={r => `start: ${r.view}`} right={r => `${n(r.n)}`} /></div>
            <div><FlowList rows={data.last_view} left={r => `end: ${r.view}`} right={r => `${n(r.n)}`} /></div>
          </div>
        </>)}
    </Section>
  )
}

// Memory (2026-10-22, backend services/memoryWatch.js): what the server holds and whether any of it grows. Resident memory includes the memory-mapped
// database file (reclaimable by the kernel), so the number to watch is "program memory" (anonymous) and its trend per day.
function MemorySection() {
  const [hours, setHours] = useState(72)
  const { data, error } = useQuery({ queryKey: ['admin-memory', hours], queryFn: () => getJson(`/memory?hours=${hours}`), staleTime: 60_000 })
  const mb = v => (v == null ? '—' : `${Number(v).toLocaleString('en-GB', { maximumFractionDigits: 1 })} MB`)
  const slope = v => (v == null ? 'not enough data yet' : `${v > 0 ? '+' : ''}${v.toLocaleString('en-GB', { maximumFractionDigits: 1 })} MB a day`)
  const trendTone = v => (v == null ? TER : v > 8 ? LEVEL.error : v > 2 ? LEVEL.warn : SEC)
  const pts = data?.series?.filter(p => p.anonMB != null) || []
  const spark = (() => {
    if (pts.length < 2) return null
    const lo = Math.min(...pts.map(p => p.anonMB)), hi = Math.max(...pts.map(p => p.anonMB)), span = Math.max(1, hi - lo)
    const d = pts.map((p, i) => `${(i / (pts.length - 1) * 300).toFixed(1)},${(38 - (p.anonMB - lo) / span * 34).toFixed(1)}`).join(' ')
    return <svg viewBox="0 0 300 42" width="100%" height="42" role="img" aria-label="Program memory over time" style={{ display: 'block', marginTop: 8 }}><polyline points={d} fill="none" stroke="var(--theme-accent)" strokeWidth="1.5" /></svg>
  })()
  return (
    <Section title="Memory" right={data?.now ? `up ${data.uptimeHours} h · ${n(data.samples)} samples` : ''}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        {[24, 72, 168].map(h => (
          <button key={h} onClick={() => setHours(h)} aria-pressed={hours === h}
            style={{ border: `1px solid ${hours === h ? PRI : LINE}`, background: hours === h ? PRI : 'none', color: hours === h ? 'var(--theme-bg)' : SEC, borderRadius: 99, padding: '2px 10px', fontFamily: SANS, fontSize: 13, cursor: 'pointer' }}>{h < 48 ? `${h} h` : `${h / 24} days`}</button>
        ))}
      </div>
      {error && <Note tone="error">{error.message}</Note>}
      {data && !data.now && <Note>No samples yet. One is taken every 10 minutes, starting 30 seconds after the server starts.</Note>}
      {data?.now && <>
        <div style={{ fontFamily: SANS, fontSize: 14, color: SEC, lineHeight: 1.6 }}>
          <b style={{ color: PRI }}>Program memory {mb(data.now.anonMB)}</b> (peak {mb(data.peak.anonMB)}), of which V8 heap {mb(data.now.heapUsedMB)}.
          {' '}Resident {mb(data.now.rssMB)} in all, but {mb(data.now.fileMB)} of that is the database file mapped into memory, which the system can drop at any time.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: '4px 14px', margin: '10px 0 2px', fontFamily: SANS, fontSize: 14, color: SEC }}>
          <span>Trend, program memory</span><span style={{ fontFamily: MONO, fontSize: 12.5, color: trendTone(data.trendMBPerDay.anon) }}>{slope(data.trendMBPerDay.anon)}</span>
          <span>Trend, V8 heap</span><span style={{ fontFamily: MONO, fontSize: 12.5, color: trendTone(data.trendMBPerDay.heapUsed) }}>{slope(data.trendMBPerDay.heapUsed)}</span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: TER }}>Flat is healthy. A steady climb over several days is a leak; it needs about a day of samples to show.</div>
        {spark}
        {Object.keys(data.now.caches || {}).length > 0 && <div style={{ fontFamily: MONO, fontSize: 12, color: TER, marginTop: 8, lineHeight: 1.7 }}>
          {Object.entries(data.now.caches).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{k}</span><span>{n(v)}</span></div>)}
        </div>}
      </>}
    </Section>
  )
}

// Wrong links (2026-10-22, backend services/badLinks.js): links people said play the wrong track. A flagged link is out of play; Put back deletes the flag
// (the link is not restored by itself, a finder or a person can add it again).
function BadLinksSection() {
  const qc = useQueryClient()
  const { data, error } = useQuery({ queryKey: ['admin-bad-links'], queryFn: () => getJson('/bad-links'), staleTime: 30_000 })
  const [busy, setBusy] = useState(null)
  const list = data?.badLinks || []
  const flagged = list.filter(b => b.status !== 'reported').length
  const putBack = async id => {
    setBusy(id)
    try { await postJson(`/bad-links/${id}/revert`); qc.invalidateQueries({ queryKey: ['admin-bad-links'] }) } catch (err) { window.alert(err.message) }
    setBusy(null)
  }
  return (
    <Section title="Wrong links" right={data ? `${n(flagged)} flagged · ${n(list.length - flagged)} reported` : ''}>
      {error && <Note tone="error">{error.message}</Note>}
      {data && list.length === 0 && <Note>None. Listeners can report a link from the track that is playing ("wrong link? change it").</Note>}
      {list.map(b => (
        <div key={b.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: `1px solid ${LINE}` }}>
          <div style={{ minWidth: 0, fontFamily: SANS, fontSize: 14, color: SEC }}>
            <a href={b.url} target="_blank" rel="noopener noreferrer" style={{ color: PRI, wordBreak: 'break-all' }}>{b.url}</a>
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: TER }}>
              {b.status === 'reported' ? 'reported' : 'flagged'} · release {b.releaseId} · track {b.position} · {n(b.reports)} {b.reports === 1 ? 'report' : 'reports'} · {ago(b.at)}{b.flaggedBy ? ` · by ${b.flaggedBy}` : ''}
            </div>
            {b.reporters?.filter(r => r.reason).map((r, i) => <div key={i} style={{ fontSize: 13, color: TER }}>{r.by}: {r.reason}</div>)}
          </div>
          <button disabled={busy === b.id} onClick={() => putBack(b.id)} style={{ border: `1px solid ${LINE}`, background: 'none', color: PRI, borderRadius: 99, padding: '4px 12px', fontFamily: SANS, fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: busy === b.id ? 0.5 : 1 }}>Put back</button>
        </div>
      ))}
    </Section>
  )
}

// Playable coverage (2026-10-22, backend services/coverage.js): how much of the site can be played, and in full or only as a Spotify preview.
function CoverageSection({ c }) {
  const t = c.tracks, b = c.book
  const rows = [
    ['YouTube', t.youtube], ['SoundCloud', t.soundcloud], ['Bandcamp', t.bandcamp], ['Other direct link', t.otherDirect],
    ['Spotify only (a 30-second preview unless signed in there)', t.spotifyOnly], ['Nothing to play', t.none],
  ]
  return (
    <Section title="Playable coverage" right={`${t.playablePct}% playable · ${t.fullLengthPct}% in full`}>
      <div style={{ fontFamily: SANS, fontSize: 13, color: TER, marginBottom: 6 }}>Tracks on live posts, by the best link each has ({n(t.total)} tracks).</div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontFamily: SANS, fontSize: 14, color: SEC }}>
          <span>{k}</span><span style={{ fontFamily: MONO, fontSize: 12.5, color: TER }}>{n(v)}{t.total ? ` · ${(Math.round(v / t.total * 1000) / 10)}%` : ''}</span>
        </div>))}
      <div style={{ fontFamily: SANS, fontSize: 13, color: TER, margin: '10px 0 4px' }}>The link book ({n(b.total)} tracks of records): {n(b.youtube)} with YouTube, {n(b.spotifyOnly)} Spotify only, {n(b.no_link)} nothing yet, {n(b.byListeners)} added by listeners, {n(b.flagged)} flagged wrong.</div>
      {c.placeholdersReadyToSwap > 0 && <Note>{n(c.placeholdersReadyToSwap)} Spotify placeholder{c.placeholdersReadyToSwap === 1 ? '' : 's'} on posts have a YouTube link waiting; the hourly swap puts it on the post.</Note>}
    </Section>
  )
}

function ServicesSection({ s }) {
  const rows = [
    ['YouTube', `${n(s.youtube.used)} of ${n(s.youtube.cap)} units`, '100 units per search — see the balance above'],
    ...(s.youtubeRefresh ? [['YouTube 30 days', `${n(s.youtubeRefresh.due)} due · ${n(s.youtubeRefresh.overdue)} overdue`, s.youtubeRefresh.last ? `last run: ${n(s.youtubeRefresh.last.refreshed)} confirmed, ${n(s.youtubeRefresh.last.cleared)} cleared, ${n(s.youtubeRefresh.last.expired)} expired; ${n(s.youtubeRefresh.unitsToday)} of ${n(s.youtubeRefresh.unitsPerDay)} refresh units today` : `stored YouTube data is refreshed at 25 days; ${n(s.youtubeRefresh.unitsToday)} of ${n(s.youtubeRefresh.unitsPerDay)} refresh units today`]] : []),
    ['Discogs', `${n(s.discogs.calls)} requests`, 'limit 60 a minute'],
    ['Spotify', s.spotify.on ? `${n(s.spotify.calls)} requests` : 'not connected', s.spotify.on ? 'barcodes, tracklists; player when YouTube is busy' : 'add SPOTIFY_CLIENT_ID / SECRET to backend/.env'],
    ...(s.deezer ? [['Deezer', `${n(s.deezer.calls)} requests`, 'free link search for new posts, no key'], ['Apple', `${n(s.apple.calls)} requests`, 'iTunes search, free link search for new posts'], ['MusicBrainz', `${n(s.musicbrainz.calls)} requests`, 'filed YouTube / SoundCloud / Bandcamp links; 1 a second']] : []),
    ['Last.fm', s.lastfm.on ? `${n(s.lastfm.calls)} requests` : 'not connected', s.lastfm.on ? 'genres when Discogs has none' : 'add LASTFM_API_KEY to backend/.env'],
  ]
  return (
    <Section title="Services today">
      <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, auto) minmax(0, 1fr)', gap: '7px 14px', alignItems: 'baseline', fontFamily: SANS, fontSize: 14, color: SEC }}>
        {rows.map(([name, value, note]) => [
          <span key={name + 'n'} style={{ fontWeight: 700, color: PRI }}>{name}</span>,
          <span key={name + 'v'} style={{ fontFamily: MONO, fontSize: 12.5, color: PRI, whiteSpace: 'nowrap' }}>{value}</span>,
          <span key={name + 't'} style={{ fontSize: 12.5, color: TER }}>{note}</span>,
        ])}
      </div>
    </Section>
  )
}

function GapsSection({ gaps }) {
  const qc = useQueryClient()
  const [run, setRun] = useState(null)
  const rows = [
    ['Artists without a Discogs id', gaps.artistIds],
    ['Labels without a Discogs id', gaps.labelIds],
    ['Posts without genres', gaps.genres],
    ['Posts without a year', gaps.years],
    ['Posts without a tracklist', gaps.tracklists],
    ['Tracks with nothing to play', gaps.unplayable],
    ['Posts not matched to Discogs', gaps.unmatched],
  ]
  const go = async () => {
    setRun({ busy: true })
    try {
      const r = await postJson('/gaps/sweep')
      const f = r.filled || {}
      const total = (f.artistIds || 0) + (f.labelIds || 0) + (f.genres || 0) + (f.years || 0) + (f.tracklists || 0) + (f.free || 0) + (f.paid || 0)
      setRun({ done: true, text: r.busy ? 'A sweep is already running.' : total ? `Filled ${total} gap${total === 1 ? '' : 's'}.` : 'Nothing new could be filled right now.' })
      qc.invalidateQueries({ queryKey: ['admin', 'status'] })
    } catch (e) { setRun({ error: e.message }) }
  }
  return (
    <Section title="Gaps in the data" right="filled every 6 hours">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '6px 12px', fontFamily: SANS, fontSize: 14, color: SEC }}>
        {rows.map(([label, v]) => [
          <span key={label + 'l'}>{label}</span>,
          <span key={label + 'v'} style={{ fontFamily: MONO, fontSize: 12.5, color: v ? PRI : TER, textAlign: 'right' }}>{n(v)}</span>,
        ])}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <Btn onClick={go} disabled={run?.busy}>{run?.busy ? 'Sweeping…' : 'Run the sweep now'}</Btn>
        {run?.text && <span style={{ fontFamily: SANS, fontSize: 13, color: SEC }}>{run.text}</span>}
        {run?.error && <span style={{ fontFamily: SANS, fontSize: 13, color: LEVEL.error }}>{run.error}</span>}
      </div>
    </Section>
  )
}

// The YouTube balance (2026-10-07): units left, paid searches left, how the
// day is divided between listening and new posts, what was spent on what,
// and when it resets. Same numbers the search budget uses (backend
// services/searchBudget.js).
function QuotaBalance({ y }) {
  const pct = v => `${Math.min(100, (v / y.dailyCap) * 100)}%`
  const resetIn = `${Math.floor(y.resetsInSec / 3600)}h ${String(Math.floor((y.resetsInSec % 3600) / 60)).padStart(2, '0')}m`
  const state = y.remaining <= 0 ? ['Spent — nothing but free checks until reset', LEVEL.error]
    : y.usedToday >= y.dailyCap * y.listenShare ? ['Listening paused — the rest is kept for new posts', LEVEL.warn]
    : y.usedToday >= y.dailyCap * 0.5 ? ['Over half the day is gone', LEVEL.warn]
    : ['Healthy', SEC]
  const tile = (label, value, sub) => (
    <div key={label} style={{ background: FILL, borderRadius: 14, padding: '10px 12px' }}>
      <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: TER }}>{label}</div>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 24, color: PRI, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: SEC }}>{sub}</div>
    </div>
  )
  const row = (k, v) => [
    <span key={k + 'k'} style={{ fontSize: 13, color: TER }}>{k}</span>,
    <span key={k + 'v'} style={{ fontFamily: MONO, fontSize: 12.5, color: PRI, fontVariantNumeric: 'tabular-nums' }}>{v}</span>,
  ]
  return (
    <Section title="YouTube quota balance" right={<span style={{ color: state[1] }}>{state[0]}</span>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 8 }}>
        {tile('Units left', n(y.remaining), `of ${n(y.dailyCap)} today`)}
        {tile('Searches left', n(y.searchesLeft), '100 units each')}
        {tile('Resets in', resetIn, 'midnight UTC')}
      </div>
      <div style={{ position: 'relative', height: 10, borderRadius: 99, background: FILL, overflow: 'hidden', marginTop: 12 }}>
        <div title="Track searches" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: pct(y.searchUnits), background: 'var(--theme-accent)' }} />
        <div title="Crawls and lookups" style={{ position: 'absolute', top: 0, bottom: 0, left: pct(y.searchUnits), width: pct(y.otherUnits), background: 'var(--theme-accent)', opacity: 0.45 }} />
        <div title="Background crawls stop here" style={{ position: 'absolute', top: 0, bottom: 0, left: `${y.crawlShare * 100}%`, width: 2, background: PRI, opacity: 0.4 }} />
        <div title="Listening stops here — the rest is for new posts" style={{ position: 'absolute', top: 0, bottom: 0, left: `${y.listenShare * 100}%`, width: 2, background: PRI, opacity: 0.8 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '5px 16px', marginTop: 12, alignItems: 'baseline' }}>
        {row('Spent on searches', `${n(y.searchUnits)} units · ${n(y.searchesToday)} paid search${y.searchesToday === 1 ? '' : 'es'}`)}
        {row('Spent on crawls and lookups', `${n(y.otherUnits)} units`)}
        {row('Listening can still use', `${n(y.listenRoom)} units (it stops at ${Math.round(y.listenShare * 100)}%)`)}
        {row('Kept for new posts', `${n(y.postsReserve)} units — always available to posting`)}
        {row('Per release', `at most ${y.perRelease} paid searches, only after Spotify, Deezer and Apple find nothing`)}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: TER, marginTop: 8 }}>Background channel crawls stop at {Math.round(y.crawlShare * 100)}% (the thin line); listening stops at {Math.round(y.listenShare * 100)}% (the bold line). Dark = track searches, pale = crawls.</div>
    </Section>
  )
}

function StatusTab({ onShowLogs }) {
  const { data, error, isLoading } = useQuery({ queryKey: ['admin', 'status'], queryFn: () => getJson('/status'), refetchInterval: 10000 })
  const [test, setTest] = useState(null)
  if (isLoading) return <Note>Loading…</Note>
  if (error) return <Note tone="error">{error.message}</Note>
  const { email, counts, youtube, crawls, server, log, database } = data
  const sendTest = async () => {
    setTest({ busy: true })
    try { const r = await postJson('/test-email'); setTest({ ok: true, ...r }) } catch (e) { setTest({ error: e.message }) }
  }
  const tiles = [
    ['Users', n(counts.users), `${n(counts.usersConfirmed)} confirmed`],
    ['Posts', n(counts.posts), `${n(counts.comments)} comments`],
    ['Signed in', n(counts.sessions), 'active sessions'],
    ['Admins', n(counts.admins), 'accounts'],
  ]
  const errs = log.last24h.error || 0, warns = log.last24h.warn || 0
  const openCrawls = crawls.catalogues.filter(c => !c.done)
  return <>
    <Section title="Email">
      {email.configured ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: 12.5, color: SEC, lineHeight: 1.7 }}>
            {email.host}:{email.port || 587}<br />from {email.from || 'Chewing the Ceiling <no-reply@chewingtheceiling.com>'}
          </div>
          {email.lastError && <Note tone="error">Last failure {ago(email.lastError.ts)}: {email.lastError.message}</Note>}
        </div>
      ) : (
        <Note tone="warn">
          <b style={{ color: PRI }}>Email isn't set up.</b> Fill in <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>MAIL_FROM</code> in <code>backend/.env</code>, then restart the backend. Until then, confirmation and reset links are shown on the page instead of emailed.
        </Note>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <Btn onClick={sendTest} disabled={test?.busy}>{test?.busy ? 'Sending…' : 'Send a test email to me'}</Btn>
        {test?.ok && <span style={{ fontFamily: SANS, fontSize: 13, color: SEC }}>{test.sent ? `Sent to ${test.to}. Check the inbox (and spam).` : 'Not sent: email isn\'t set up yet.'}</span>}
        {test?.error && <span style={{ fontFamily: SANS, fontSize: 13, color: LEVEL.error }}>{test.error}</span>}
      </div>
    </Section>

    <Section title="Site" right={`up ${dur(server.uptimeSec)} · ${server.env}`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 8 }}>
        {tiles.map(([label, value, sub]) => (
          <div key={label} style={{ background: FILL, borderRadius: 14, padding: '10px 12px' }}>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: TER }}>{label}</div>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 24, color: PRI, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: SEC }}>{sub}</div>
          </div>
        ))}
      </div>
      <button onClick={() => onShowLogs(errs ? 'error' : warns ? 'warn' : '')}
        style={{ marginTop: 10, background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: SANS, fontSize: 14, color: errs ? LEVEL.error : warns ? LEVEL.warn : SEC, textDecoration: 'underline', textUnderlineOffset: 3 }}>
        Last 24 hours: {n(errs)} error{errs === 1 ? '' : 's'}, {n(warns)} warning{warns === 1 ? '' : 's'} →
      </button>
    </Section>

    <QuotaBalance y={youtube} />

    {data.services && <ServicesSection s={data.services} />}
    {data.coverage && <CoverageSection c={data.coverage} />}
    <FlowSection />
    <MemorySection />
    <BadLinksSection />
    {data.gaps && <GapsSection gaps={data.gaps} />}

    <Section title="Discogs catalogues" right={`${crawls.catalogues.length - openCrawls.length} of ${crawls.catalogues.length} done · ${n(database.catalogueRows)} releases`}>
      {crawls.catalogues.map(c => (
        <div key={`${c.kind}:${c.entity_id}`} style={{ display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr) 210px', gap: 10, alignItems: 'center', padding: '5px 0' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', color: TER, border: `1px solid ${LINE}`, borderRadius: 5, textAlign: 'center', padding: '2px 0' }}>{c.kind}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: SANS, fontWeight: 600, fontSize: 14, color: PRI, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            {!c.done && <Bar value={c.have} max={c.total} />}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: c.stalled ? LEVEL.warn : c.done ? TER : SEC, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.done ? `${n(c.have)} · done` : `${n(c.have)} of ${n(c.total)}`}{c.skipped ? ` · ${c.skipped.split(',').length} page${c.skipped.includes(',') ? 's' : ''} skipped` : ''}{c.stalled ? ' · stalled' : ''}</span>
        </div>
      ))}
    </Section>

    <Section title="YouTube channels" right={`${n(database.channelVideos)} uploads`}>
      {crawls.channels.length ? crawls.channels.map(c => (
        <div key={c.title} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px', gap: 10, alignItems: 'center', padding: '5px 0' }}>
          <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, color: PRI }}>{c.title}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: TER, textAlign: 'right' }}>{c.done ? `${n(c.have)} · done` : `${n(c.have)} of ${n(c.total)}`}</span>
        </div>
      )) : <Note>No channels crawled yet.</Note>}
    </Section>
  </>
}

// ── Logs ──
const KINDS = [['', 'All'], ['auth', 'Sign-ins'], ['post', 'Posts'], ['mail', 'Email'], ['crawl', 'Crawls'], ['request', 'Requests'], ['system', 'System'], ['admin', 'Admin']]
const LEVELS = [['', 'Any level'], ['error', 'Errors'], ['warn', 'Warnings'], ['info', 'Info']]

function LogsTab({ initialLevel }) {
  const [level, setLevel] = useState(initialLevel || '')
  const [kind, setKind] = useState('')
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  useEffect(() => { const t = setTimeout(() => setQ(query.trim()), 300); return () => clearTimeout(t) }, [query])
  const pages = useInfiniteQuery({
    queryKey: ['admin', 'logs', level, kind, q],
    queryFn: ({ pageParam }) => getJson(`/logs?${new URLSearchParams({ level, kind, q, limit: '100', ...(pageParam ? { before: String(pageParam) } : {}) })}`),
    initialPageParam: null,
    getNextPageParam: last => last?.next || undefined,
    refetchInterval: 15000,
  })
  const rows = (pages.data?.pages || []).flatMap(p => p.rows)
  return <>
    <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
      <Chips options={LEVELS} value={level} onChange={setLevel} />
      <Chips options={KINDS} value={kind} onChange={setKind} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: FILL, border: `1px solid ${LINE}`, borderRadius: 99, padding: '6px 14px' }}>
        <span aria-hidden="true" style={{ color: TER }}>⌕</span>
        <input id="admin-log-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search messages, users, paths…" aria-label="Search the log"
          style={{ border: 0, outline: 0, background: 'none', flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 15, color: PRI }} />
      </label>
    </div>
    <div style={{ marginTop: 12 }}>
      {pages.isLoading ? <Note>Loading…</Note>
        : pages.error ? <Note tone="error">{pages.error.message}</Note>
        : !rows.length ? <Note>Nothing logged{level || kind || q ? ' that matches' : ' yet'}.</Note>
        : rows.map(r => (
          <div key={r.id} style={{ borderBottom: `1px solid ${LINE}` }}>
            <button onClick={() => setOpen(o => (o === r.id ? null : r.id))}
              style={{ display: 'grid', gridTemplateColumns: '10px 64px minmax(0, 1fr) auto', gap: 10, alignItems: 'baseline', width: '100%', background: open === r.id ? FILL : 'none', border: 0, padding: '7px 4px', textAlign: 'left', cursor: 'pointer', color: PRI }}>
              <span title={r.level} style={{ width: 8, height: 8, borderRadius: '50%', background: LEVEL[r.level], alignSelf: 'center' }} />
              <span style={{ fontFamily: MONO, fontSize: 10.5, textTransform: 'uppercase', color: TER }}>{r.kind}</span>
              <span style={{ minWidth: 0, fontFamily: SANS, fontSize: 14, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                {r.message}{r.username && <span style={{ color: SEC }}> · {r.username}</span>}
              </span>
              <span title={new Date(r.ts).toLocaleString('en-GB')} style={{ fontFamily: MONO, fontSize: 11.5, color: TER, whiteSpace: 'nowrap' }}>{ago(r.ts)}</span>
            </button>
            {open === r.id && (
              <div style={{ padding: '4px 4px 10px 84px', fontFamily: MONO, fontSize: 12, color: SEC, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                <div>{new Date(r.ts).toLocaleString('en-GB')}{r.ip ? ` · ${r.ip}` : ''}</div>
                {r.path && <div>{r.method} {r.path}{r.status ? ` → ${r.status}` : ''}{r.ms != null ? ` · ${r.ms} ms` : ''}</div>}
                {r.detail && <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', fontFamily: MONO, fontSize: 11.5, color: SEC }}>{(() => { try { return JSON.stringify(JSON.parse(r.detail), null, 2) } catch { return r.detail } })()}</pre>}
              </div>
            )}
          </div>
        ))}
      {pages.hasNextPage && <Btn style={{ marginTop: 12 }} onClick={() => pages.fetchNextPage()} disabled={pages.isFetchingNextPage}>{pages.isFetchingNextPage ? 'Loading…' : 'Load older'}</Btn>}
    </div>
  </>
}

// ── Users ──
function UsersTab() {
  const qc = useQueryClient()
  const { data, error, isLoading } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => getJson('/users') })
  const [msg, setMsg] = useState(null) // { userId, tone, text, link? }
  const [busy, setBusy] = useState(null)
  if (isLoading) return <Note>Loading…</Note>
  if (error) return <Note tone="error">{error.message}</Note>
  const act = async (u, what) => {
    setBusy(`${u.id}:${what}`); setMsg(null)
    try {
      if (what === 'admin' || what === 'unadmin') {
        await postJson(`/users/${u.id}/admin`, { admin: what === 'admin' })
        setMsg({ userId: u.id, text: what === 'admin' ? `${u.username} is now an admin.` : `${u.username} is no longer an admin.` })
        qc.invalidateQueries({ queryKey: ['admin'] })
      } else {
        const r = await postJson(`/users/${u.id}/${what}`)
        setMsg({ userId: u.id, text: r.sent ? `Sent ${what === 'reset' ? 'a password-reset' : 'a confirmation'} link to ${u.email}.` : "Email isn't set up, so nothing was sent. Here's the link to pass on:", link: r.link })
      }
    } catch (e) { setMsg({ userId: u.id, tone: 'error', text: e.message }) }
    finally { setBusy(null) }
  }
  return (
    <div style={{ marginTop: 10 }}>
      {data.users.map(u => (
        <div key={u.id} style={{ borderBottom: `1px solid ${LINE}`, padding: '10px 0' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, color: PRI }}>{u.username}</span>
            {!!u.is_admin && <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', background: 'var(--theme-accent)', color: '#fff', borderRadius: 99, padding: '2px 8px' }}>Admin</span>}
            {u.id === data.me && <span style={{ fontFamily: SANS, fontSize: 12, color: TER }}>(you)</span>}
            <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11.5, color: TER }}>{n(u.posts)} posts · {n(u.comments)} comments</span>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13.5, color: SEC, marginTop: 2, overflowWrap: 'anywhere' }}>
            {u.email || 'no email'}
            {' · '}{u.email_verified_at ? 'confirmed' : <span style={{ color: LEVEL.warn }}>not confirmed</span>}
            {!u.has_password && <span style={{ color: LEVEL.warn }}> · no password</span>}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: TER, marginTop: 2 }}>joined {ago(u.created_at)} · last sign-in {ago(u.last_login_at)}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {u.is_admin
              ? (u.id !== data.me && <Btn onClick={() => act(u, 'unadmin')} disabled={!!busy}>Remove admin</Btn>)
              : <Btn onClick={() => act(u, 'admin')} disabled={!!busy || !u.email_verified_at} title={u.email_verified_at ? '' : 'Confirm the email first'}>Make admin</Btn>}
            {!u.email_verified_at && u.email && <Btn onClick={() => act(u, 'confirm')} disabled={!!busy}>Send confirmation link</Btn>}
            {u.email && <Btn onClick={() => act(u, 'reset')} disabled={!!busy}>Send password-reset link</Btn>}
          </div>
          {msg?.userId === u.id && (
            <div style={{ marginTop: 8 }}>
              <Note tone={msg.tone}>{msg.text}{msg.link && <> <a href={msg.link} style={{ color: PRI, wordBreak: 'break-all' }}>{msg.link}</a></>}</Note>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// Channels (2026-10-05): which can be ♥'d — proper channels only, by
// YouTube's numbers or your say-so. Mark one official / not, or let the
// numbers decide again.
function ChannelsTab() {
  const qc = useQueryClient()
  const { data, error, isLoading } = useQuery({ queryKey: ['admin', 'channels'], queryFn: () => getJson('/channels') })
  const [busy, setBusy] = useState(null)
  if (isLoading) return <Note>Loading…</Note>
  if (error) return <Note tone="error">{error.message}</Note>
  const r = data.rule
  const set = async (name, official) => {
    setBusy(name)
    try {
      const d = await postJson('/channels/official', { name, official })
      qc.setQueryData(['admin', 'channels'], { ...data, channels: d.channels })
      qc.invalidateQueries({ queryKey: ['channels', 'proper'] })
    } catch (e) { window.alert(e.message) }
    setBusy(null)
  }
  return <>
    <Section title="Who can be ♥'d">
      <Note>Channels can be ♥'d with at least {n(r.minUploads)} uploads, {n(r.minSubscribers)} subscribers (shown, not hidden) and {r.minAgeDays} days on YouTube — or when you mark them official. The numbers refresh every 30 days.</Note>
    </Section>
    <Section title="Channels" right={`${data.channels.filter(c => c.proper).length} of ${data.channels.length} can be ♥'d`}>
      {data.channels.map(c => (
        <div key={c.name} style={{ borderBottom: `1px solid ${LINE}`, padding: '10px 0' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, color: PRI }}>{c.name}</span>
            {c.handle && <span style={{ fontFamily: MONO, fontSize: 11.5, color: TER }}>{c.handle}</span>}
            <span style={{ marginLeft: 'auto', fontFamily: SANS, fontSize: 13, fontWeight: 600, color: c.proper ? PRI : LEVEL.warn }}>{c.proper ? '♥ allowed' : 'no ♥'}</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: TER, marginTop: 2 }}>
            {c.uploads != null ? `${n(c.uploads)} uploads` : 'no numbers'}
            {c.subs_hidden ? ' · subscribers hidden' : c.subscribers != null ? ` · ${n(c.subscribers)} subscribers` : ''}
            {c.started_at ? ` · since ${c.started_at.slice(0, 4)}` : ''} · {c.why}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {c.official !== 1 && <Btn onClick={() => set(c.name, true)} disabled={!!busy}>Mark official</Btn>}
            {c.official !== 0 && <Btn onClick={() => set(c.name, false)} disabled={!!busy}>Mark not official</Btn>}
            {c.official != null && <Btn onClick={() => set(c.name, null)} disabled={!!busy}>Back to the numbers</Btn>}
          </div>
        </div>
      ))}
    </Section>
  </>
}

// Introductions (alpha, 2026-10-05): who was introduced to whom and why,
// over 30 days, and what came of it — so the rules can be checked by eye.
function IntroductionsTab() {
  const { data, error, isLoading } = useQuery({ queryKey: ['admin', 'introductions'], queryFn: () => getJson('/introductions') })
  if (isLoading) return <Note>Loading…</Note>
  if (error) return <Note tone="error">{error.message}</Note>
  const t = data.totals
  const tiles = [['Shown', t.shown], ['Led to a follow', t.followed], ['Said no (×)', t.dismissed], ['Turned off', t.off]]
  return <>
    <Section title="Last 30 days">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 8 }}>
        {tiles.map(([label, value]) => (
          <div key={label} style={{ background: FILL, borderRadius: 14, padding: '10px 12px' }}>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: TER }}>{label}</div>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 24, color: PRI, fontVariantNumeric: 'tabular-nums' }}>{n(value)}</div>
          </div>
        ))}
      </div>
    </Section>
    {data.most.length > 0 && (
      <Section title="Most introduced this week" right={`cap ${data.weekCap} people`}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {data.most.map(m => <span key={m.username} style={{ fontFamily: SANS, fontSize: 13.5, color: PRI, background: FILL, borderRadius: 99, padding: '5px 12px' }}>{m.username} · {m.people} of {data.weekCap}</span>)}
        </div>
      </Section>
    )}
    <Section title="Each one">
      {data.rows.length === 0 ? <Note>None shown yet. They appear once someone qualifies (5+ posts and a strong reason).</Note> : data.rows.map(r => (
        <div key={r.id} style={{ borderBottom: `1px solid ${LINE}`, padding: '9px 0' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontFamily: SANS, fontSize: 14.5, color: SEC }}>
            <b style={{ color: PRI }}>{r.target}</b> to {r.viewer}
            <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11.5, color: r.followed ? PRI : r.dismissed ? LEVEL.warn : TER }}>{r.followed ? 'followed' : r.dismissed ? 'said no' : 'no action'} · {ago(r.shown_at)}</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: TER, marginTop: 2, overflowWrap: 'anywhere' }}>{r.reason}</div>
        </div>
      ))}
    </Section>
  </>
}

// Links people added by hand (2026-10-07): waiting for a decision first, then
// what was decided in the last two weeks. An admin's approve / reject is final.
function LinksTab() {
  const qc = useQueryClient()
  const { data, error, isLoading } = useQuery({ queryKey: ['admin', 'links'], queryFn: () => getJson('/link-submissions') })
  const [busy, setBusy] = useState(null)
  if (isLoading) return <Note>Loading…</Note>
  if (error) return <Note tone="error">{error.message}</Note>
  const decide = async (id, decision) => {
    setBusy(id)
    try { await postJson(`/link-submissions/${id}/${decision}`); await qc.invalidateQueries({ queryKey: ['admin', 'links'] }) } catch (e) { window.alert(e.message) }
    setBusy(null)
  }
  const rows = data.submissions
  const waiting = rows.filter(r => r.status === 'pending')
  const tone = s => (s === 'live' ? PRI : s === 'rejected' ? LEVEL.error : LEVEL.warn)
  const Row = ({ r }) => (
    <div style={{ borderBottom: `1px solid ${LINE}`, padding: '10px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15.5, color: PRI }}>{r.trackTitle}</span>
        <span style={{ fontFamily: SANS, fontSize: 13.5, color: SEC }}>{r.artist}</span>
        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11.5, color: tone(r.status) }}>{r.status}{r.decidedBy ? ` · ${r.decidedBy}` : ''}</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11.5, color: TER, marginTop: 2, overflowWrap: 'anywhere' }}>
        {r.platform} · “{r.fetchedTitle}” · {r.verdict} match · by {r.by} · {ago(r.at)} · {r.ok} yes / {r.bad} no
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: SANS, fontSize: 13, color: SEC }}>open link ↗</a>
        <a href={`https://www.discogs.com/release/${r.releaseId}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: SANS, fontSize: 13, color: SEC }}>release {r.releaseId} · {r.position} ↗</a>
        {r.status !== 'live' && <Btn onClick={() => decide(r.id, 'approve')} disabled={busy === r.id}>Approve</Btn>}
        {r.status !== 'rejected' && <Btn onClick={() => decide(r.id, 'reject')} disabled={busy === r.id}>Reject</Btn>}
      </div>
    </div>
  )
  return <>
    <Section title="Waiting" right={`${waiting.length}`}>
      <Note>Links pasted by listeners that didn't clearly match their track. Two other people confirming makes one live; your approve or reject is final.</Note>
      {waiting.length === 0 ? <Note>Nothing waiting.</Note> : waiting.map(r => <Row key={r.id} r={r} />)}
    </Section>
    <Section title="Last two weeks" right={`${rows.length - waiting.length}`}>
      {rows.length === waiting.length ? <Note>Nothing else yet.</Note> : rows.filter(r => r.status !== 'pending').map(r => <Row key={r.id} r={r} />)}
    </Section>
  </>
}

export function AdminDrawer({ tab: initialTab }) {
  const [tab, setTab] = useState(initialTab || 'status')
  const [logLevel, setLogLevel] = useState('')
  return <>
    <DrawerHead title="Admin" count="">
      <Chips options={[['status', 'Status'], ['logs', 'Logs'], ['users', 'Users'], ['channels', 'Channels'], ['links', 'Links'], ['intros', 'Introductions']]} value={tab} onChange={setTab} />
    </DrawerHead>
    <DrawerBody>
      {tab === 'status' && <StatusTab onShowLogs={lvl => { setLogLevel(lvl); setTab('logs') }} />}
      {tab === 'logs' && <LogsTab key={logLevel} initialLevel={logLevel} />}
      {tab === 'users' && <UsersTab />}
      {tab === 'channels' && <ChannelsTab />}
      {tab === 'links' && <LinksTab />}
      {tab === 'intros' && <IntroductionsTab />}
    </DrawerBody>
  </>
}
