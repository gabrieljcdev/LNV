import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DrawerHead, DrawerBody } from './Drawers'
import { askConfirm, tell } from './Dialogs'
import { authHeaders } from '../lib/auth'
import { setFlowEnabled } from '../lib/flow'

// "Your data" (2026-10-22): the one place to switch research recording on or off, see what it holds, take a copy, clear it, or have everything removed.
// Backend: /api/activity (routes/activity.js, services/listeningHistory.js, services/flow.js). Off unless the person turns it on; research only, never used to
// choose what anyone hears or sees. The wording here is the promise: keep it true to what the code does.

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)', LINE = 'var(--theme-border)'
const FILL = 'color-mix(in srgb, var(--theme-text-pri) 7%, transparent)'

const call = async (path, options = {}) => {
  const r = await fetch(`${API}/activity${path}`, { headers: authHeaders(), ...options })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Something went wrong (${r.status})`)
  return j
}
const dur = ms => { const s = Math.round((ms || 0) / 1000); return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor(s % 3600 / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s` }

const Section = ({ title, children }) => (
  <section style={{ marginTop: 26 }}>
    <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: TER, margin: '0 0 8px' }}>{title}</div>
    {children}
  </section>
)
const P = ({ children, style }) => <p style={{ margin: '0 0 10px', fontFamily: SANS, fontSize: 15, lineHeight: 1.5, color: SEC, ...style }}>{children}</p>
const Item = ({ children }) => <li style={{ margin: '0 0 4px' }}>{children}</li>
const List = ({ children }) => <ul style={{ margin: '0 0 10px', paddingLeft: 20, fontFamily: SANS, fontSize: 15, lineHeight: 1.5, color: SEC }}>{children}</ul>
const btn = (danger, off) => ({ border: `1px solid ${danger ? '#d1462f' : LINE}`, background: 'none', color: danger ? '#d1462f' : PRI, borderRadius: 99, padding: '7px 16px', fontFamily: SANS, fontWeight: 600, fontSize: 14, cursor: off ? 'default' : 'pointer', opacity: off ? 0.5 : 1 })

function Switch({ on, busy, onChange, label }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={busy} onClick={() => onChange(!on)}
      style={{ width: 52, height: 30, borderRadius: 99, border: `1px solid ${on ? 'var(--theme-accent)' : LINE}`, background: on ? 'var(--theme-accent)' : FILL, position: 'relative', cursor: busy ? 'default' : 'pointer', flexShrink: 0, padding: 0, transition: 'background 0.2s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 25 : 3, width: 22, height: 22, borderRadius: '50%', background: on ? '#fff' : 'var(--theme-text-sec)', transition: 'left 0.2s' }} />
    </button>
  )
}

export function ActivityDrawer() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const settings = useQuery({ queryKey: ['activity-settings'], queryFn: () => call('/me/settings'), staleTime: 0 })
  const on = !!settings.data?.keep_listening
  const flow = useQuery({ queryKey: ['activity-flow'], queryFn: () => call('/me/flow?days=30'), enabled: on, staleTime: 30_000 })
  const plays = useQuery({ queryKey: ['activity-listening'], queryFn: () => call('/me/listening?limit=6'), enabled: on, staleTime: 30_000 })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['activity-settings'] }); qc.invalidateQueries({ queryKey: ['activity-flow'] }); qc.invalidateQueries({ queryKey: ['activity-listening'] }) }

  const run = async fn => {
    setBusy(true)
    try { await fn() } catch (err) { await tell({ title: 'That did not work', body: err.message }) } finally { setBusy(false); refresh() }
  }
  const turn = next => run(async () => {
    if (!next && await askConfirm({ title: 'Switch recording off?', body: 'What was already recorded stays until you clear it below.', ok: 'Switch off' }) === false) return
    await call('/me/settings', { method: 'PUT', body: JSON.stringify({ keep_listening: next }) })
    setFlowEnabled(next)   // start or stop recording now, not at the next page load
  })
  const download = () => run(async () => {
    const r = await fetch(`${API}/activity/me/export`, { headers: authHeaders() })
    if (!r.ok) throw new Error(`Could not make the file (${r.status})`)
    const url = URL.createObjectURL(await r.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: 'my-activity.json' })
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  const clear = (path, title, body, doneText) => run(async () => {
    if (!await askConfirm({ title, body, ok: 'Clear it', danger: true })) return
    await call(path, { method: 'DELETE' })
    await tell({ title: doneText })
  })
  const wipe = () => run(async () => {
    if (!await askConfirm({ title: 'Delete everything held about you here?', body: 'Your recorded activity and this setting are removed for good. Your posts, replies and account are not touched.', ok: 'Delete it all', danger: true })) return
    const r = await call('/me', { method: 'DELETE' })
    setFlowEnabled(false)
    await tell({ title: 'Deleted', body: `${r.removed || 0} records removed.` })
  })

  const f = flow.data
  return <>
    <DrawerHead title="Your data" count="" />
    <DrawerBody>
      <Section title="Research recording">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', border: `1px solid ${LINE}`, borderRadius: 14, background: FILL }}>
          <Switch on={on} busy={busy || settings.isLoading} onChange={turn} label="Keep a private record of how I use the site, for research" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, color: PRI }}>{settings.isLoading ? '…' : on ? 'On' : 'Off'}</div>
            <div style={{ fontFamily: SANS, fontSize: 14, color: SEC }}>{on ? 'A private record of how you use the site is being kept.' : 'Nothing about how you use the site is being kept.'}</div>
          </div>
        </div>
        {settings.isError && <P style={{ color: '#d1462f', marginTop: 10 }}>{settings.error.message}</P>}
      </Section>

      <Section title="What this is for">
        <P>It is for research by the people who run the site: studying how people find and share music. <b style={{ color: PRI }}>It is never used to choose what you hear, or to change what you see.</b> The site does not recommend tracks; it only helps you find people.</P>
      </Section>

      <Section title="What is kept, while it is on">
        <List>
          <Item>Your visits and how long they last.</Item>
          <Item>Which parts of the site you open (the feed, a drawer) and for how long.</Item>
          <Item>Which controls you press, by their name (for example "labels"), never what is on the page.</Item>
          <Item>What you play: the player, the video or track, how long it really played and whether it finished.</Item>
          <Item>That you posted, kept, highlighted or replied, and which record. Not what you wrote.</Item>
        </List>
        <P><b style={{ color: PRI }}>Never kept:</b> anything you type, your searches, your IP address, or where on the screen you click.</P>
      </Section>

      {on && (
        <Section title="What it holds now (last 30 days)">
          {flow.isLoading ? <P>Loading…</P> : f ? <>
            <P>{f.sessions === 0 ? 'No visits recorded yet.' : <>
              <b style={{ color: PRI }}>{f.sessions}</b> {f.sessions === 1 ? 'visit' : 'visits'}, {dur(f.session_ms.average)} on average. {f.listening.listens} {f.listening.listens === 1 ? 'listen' : 'listens'}, {dur(f.listening.total_ms)} in all.</>}</P>
            {f.time_in_views?.slice(0, 4).map(v => (
              <div key={v.view} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontFamily: SANS, fontSize: 14, color: SEC }}>
                <span>{v.view}</span><span style={{ fontFamily: MONO, fontSize: 12.5, color: TER }}>{dur(v.ms)}</span>
              </div>))}
          </> : null}
          {plays.data?.plays?.length > 0 && <>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: TER, margin: '16px 0 4px' }}>Recent listening</div>
            {plays.data.plays.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontFamily: SANS, fontSize: 14, color: SEC }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.post?.title || `Post ${p.post_id}`}{p.track ? ` · ${p.track}` : ''}</span>
                <span style={{ fontFamily: MONO, fontSize: 12.5, color: TER, whiteSpace: 'nowrap' }}>{p.kind}</span>
              </div>))}
          </>}
        </Section>
      )}

      <Section title="Yours to keep, clear or remove">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={download} disabled={busy} style={btn(false, busy)}>Download a copy</button>
          <button onClick={() => clear('/me/flow', 'Clear your site-use history?', 'The record of your visits, views and clicks is removed. Recording stays as it is.', 'Cleared')} disabled={busy} style={btn(true, busy)}>Clear my site-use history</button>
          <button onClick={() => clear('/me/listening', 'Clear your listening history?', 'The record of what you played is removed. Recording stays as it is.', 'Cleared')} disabled={busy} style={btn(true, busy)}>Clear my listening history</button>
          <button onClick={wipe} disabled={busy} style={btn(true, busy)}>Delete everything held about me</button>
        </div>
        <P style={{ marginTop: 12, fontSize: 13.5, color: TER }}>Old records are also removed on their own after a while (site use after 180 days, listening after 400).</P>
      </Section>
    </DrawerBody>
  </>
}
