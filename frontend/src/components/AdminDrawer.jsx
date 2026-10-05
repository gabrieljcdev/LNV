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
            {email.host}:{email.port || 587}<br />from {email.from || 'Late Night Vibes <no-reply@latenightvibes.com>'}
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

    <Section title="YouTube quota today" right={`${n(youtube.usedToday)} of ${n(youtube.dailyCap)} units`}>
      <Bar value={youtube.usedToday} max={youtube.dailyCap} mark={youtube.crawlShare} />
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: TER, marginTop: 6 }}>Background channel crawls stop at {Math.round(youtube.crawlShare * 100)}%; the rest is kept for track searches (100 units each). Resets at midnight UTC.</div>
    </Section>

    <Section title="Discogs catalogues" right={`${crawls.catalogues.length - openCrawls.length} of ${crawls.catalogues.length} done · ${n(database.catalogueRows)} releases`}>
      {crawls.catalogues.map(c => (
        <div key={`${c.kind}:${c.entity_id}`} style={{ display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr) 150px', gap: 10, alignItems: 'center', padding: '5px 0' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', color: TER, border: `1px solid ${LINE}`, borderRadius: 5, textAlign: 'center', padding: '2px 0' }}>{c.kind}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: SANS, fontWeight: 600, fontSize: 14, color: PRI, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            {!c.done && <Bar value={c.have} max={c.total} />}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: c.done ? TER : SEC, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.done ? `${n(c.have)} · done` : `${n(c.have)} of ${n(c.total)}`}</span>
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

export function AdminDrawer({ tab: initialTab }) {
  const [tab, setTab] = useState(initialTab || 'status')
  const [logLevel, setLogLevel] = useState('')
  return <>
    <DrawerHead title="Admin" count="">
      <Chips options={[['status', 'Status'], ['logs', 'Logs'], ['users', 'Users'], ['channels', 'Channels'], ['intros', 'Introductions']]} value={tab} onChange={setTab} />
    </DrawerHead>
    <DrawerBody>
      {tab === 'status' && <StatusTab onShowLogs={lvl => { setLogLevel(lvl); setTab('logs') }} />}
      {tab === 'logs' && <LogsTab key={logLevel} initialLevel={logLevel} />}
      {tab === 'users' && <UsersTab />}
      {tab === 'channels' && <ChannelsTab />}
      {tab === 'intros' && <IntroductionsTab />}
    </DrawerBody>
  </>
}
