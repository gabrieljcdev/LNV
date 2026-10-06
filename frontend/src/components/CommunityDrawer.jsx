import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DrawerHead, DrawerBody } from './Drawers'
import { FollowButton } from './Collect'
import { openWall } from '../lib/collections'
import { useLayout } from '../context/LayoutContext'
import { COMMUNITY_RULES } from '../lib/communityRules'

// Community (alpha, 2026-10-06, from the "LNV Community Mockup" gabriel
// approved): who's been digging in a style — a way to find people to
// follow, not a contest. By style (Discogs styles) or Range (how many
// styles, how evenly); rising (30 days) or all-time. Each row says why
// it's there — no points or scores. The rules: backend
// services/communityService.js, written out under "How it's counted" and in
// About. Later tabs: DJs, labels, shops.

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)', LINE = 'var(--theme-border)'
const get = path => fetch(`${API}${path}`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`community ${r.status}`))))
const AVATAR = ['#2c4a2f', '#3d4a5c', '#8a4b2e', '#5b4a7a', '#2e5d5c', '#7a5b2e', '#4a4a4a']

export function CommunityDrawer() {
  const { closeD3 } = useLayout() || {}
  const [tab, setTab] = useState('style')
  const [period, setPeriod] = useState('rising')
  const [picked, setPicked] = useState(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const { data: st } = useQuery({ queryKey: ['community', 'styles', period], queryFn: () => get(`/community/styles?period=${period}`), staleTime: 60_000 })
  const styles = st?.styles || []
  const style = picked && styles.some(s => s.name === picked) ? picked : styles[0]?.name || null
  const board = useQuery({
    queryKey: ['community', tab, tab === 'style' ? style : '', period],
    queryFn: () => get(tab === 'style' ? `/community/board?style=${encodeURIComponent(style)}&period=${period}` : `/community/range?period=${period}`),
    enabled: tab === 'range' || !!style,
    staleTime: 60_000,
  })
  const rows = board.data?.rows || []

  const tabBtn = (id, label) => (
    <button role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
      style={{ border: 0, background: 'none', padding: '0 0 8px', font: 'inherit', letterSpacing: 'inherit', cursor: 'pointer', color: tab === id ? 'var(--theme-accent)' : TER, borderBottom: `2px solid ${tab === id ? 'var(--theme-accent)' : 'transparent'}` }}>{label}</button>
  )
  const periodBtn = (id, label) => (
    <button onClick={() => setPeriod(id)} aria-pressed={period === id}
      style={{ border: 0, borderRadius: 99, padding: '7px 14px', fontFamily: SANS, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: period === id ? PRI : 'transparent', color: period === id ? 'var(--theme-showcase)' : PRI }}>{label}</button>
  )

  return <>
    <DrawerHead title="Community" count="" action={<span title="Alpha — an early, experimental feature" style={{ alignSelf: 'center', fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--theme-showcase)', background: PRI, borderRadius: 99, padding: '3px 8px', whiteSpace: 'nowrap' }}>α ALPHA</span>} />
    <DrawerBody>
      <p style={{ margin: '0 0 16px', fontFamily: SANS, fontSize: 15, lineHeight: 1.45, color: SEC }}>Who’s been digging — by what they post and keep. A way to find people to follow, not a contest.</p>

      <div role="tablist" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: SANS, fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', borderBottom: `1px solid ${LINE}`, marginBottom: 14 }}>
        {tabBtn('style', 'By style')}
        {tabBtn('range', 'Range')}
        {['DJs', 'Labels', 'Shops'].map(l => <span key={l} style={{ padding: '0 0 8px', color: TER, opacity: 0.6 }}>{l} · later</span>)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div role="group" aria-label="Period" style={{ display: 'inline-flex', border: `1px solid ${LINE}`, borderRadius: 99, padding: 3 }}>
          {periodBtn('rising', 'Rising · 30 days')}
          {periodBtn('all', 'All-time')}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11, color: TER }}>{period === 'rising' ? 'the last 30 days — new people can get on' : 'everything since they joined'}</span>
      </div>

      {tab === 'style' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {styles.length === 0 && <span style={{ fontFamily: SANS, fontSize: 14, color: SEC }}>{st ? 'No boards yet — they fill as people post.' : 'Loading…'}</span>}
          {styles.map(s => {
            const on = s.name === style
            return (
              <button key={s.name} onClick={() => setPicked(s.name)} aria-pressed={on}
                style={{ border: `1px solid ${on ? PRI : LINE}`, borderRadius: 99, padding: '6px 13px', background: on ? PRI : 'transparent', color: on ? 'var(--theme-showcase)' : SEC, fontFamily: SANS, fontSize: 13.5, cursor: 'pointer' }}>{s.name}</button>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: TER }}>
          {tab === 'style' ? style || '' : 'Range'} · {period === 'rising' ? 'rising' : 'all-time'}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: TER }}>why they’re here</span>
      </div>
      {board.isLoading ? <p style={{ fontFamily: MONO, fontSize: 12, color: TER }}>Loading…</p>
        : board.isError ? <p style={{ fontFamily: SANS, fontSize: 14, color: SEC }}>Couldn’t load this board.</p>
        : rows.length === 0 ? <p style={{ fontFamily: SANS, fontSize: 14, color: SEC, padding: '8px 0' }}>Nobody here yet{period === 'rising' ? ' this month' : ''}. It takes at least two records in a style to show up.</p>
        : rows.map((r, i) => (
          <div key={r.username} style={{ display: 'grid', gridTemplateColumns: '24px 40px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${LINE}` }}>
            <span style={{ fontFamily: SANS, fontSize: 18, fontWeight: 900, color: TER, textAlign: 'right' }}>{i + 1}</span>
            <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', background: AVATAR[(r.username.length + i) % AVATAR.length], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 800, fontSize: 17 }}>{r.username.charAt(0).toUpperCase()}</span>
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <button onClick={() => { openWall(r.username); closeD3?.() }} title={`Open ${r.username}’s feed`}
                  style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontFamily: SANS, fontSize: 17, fontWeight: 700, color: PRI }}>{r.username}</button>
                {r.isNew && <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--theme-accent)' }}>new here</span>}
              </span>
              <span style={{ fontFamily: SANS, fontSize: 13.5, lineHeight: 1.35, color: SEC }}>{r.why}</span>
            </span>
            <FollowButton username={r.username} />
          </div>
        ))}

      <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${LINE}`, fontFamily: SANS, fontSize: 12.5, lineHeight: 1.5, color: SEC }}>
        Counted from what people choose to post and ♥ — never likes, plays or time spent. Different records count, not volume: at most 3 a day per person, and rarer labels count for more. No points, no streaks, no reminders.{' '}
        <button onClick={() => setRulesOpen(v => !v)} aria-expanded={rulesOpen}
          style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--theme-accent)', textDecoration: 'underline', textUnderlineOffset: 3 }}>{rulesOpen ? 'Hide the rules' : 'How it’s counted'}</button>
        {rulesOpen && (
          <ol style={{ margin: '10px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
            {COMMUNITY_RULES.map(([b, rest]) => <li key={b}><b style={{ color: PRI }}>{b}</b> {rest}</li>)}
          </ol>
        )}
      </div>
    </DrawerBody>
  </>
}
