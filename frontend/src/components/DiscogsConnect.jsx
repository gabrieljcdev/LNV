import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLayout } from '../context/LayoutContext'
import { isLoggedIn } from '../lib/auth'
import { discogsAccountApi, useDiscogsAccount, discogsPromptSeen, markDiscogsPromptSeen } from '../lib/discogsAccount'

// Connecting your Discogs account (2026-10-08, gabriel): a dialog (after sign-in, from the Playlists
// drawer, and from your profile) that takes your username, imports your public collection / wantlist
// as two private playlists, and offers an optional check that the account is yours. See DiscogsLists.jsx
// for the playlists themselves and backend/services/discogsAccount.js for the import.

const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)', LINE = 'var(--theme-border)'
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
const pill = { border: `1px solid ${LINE}`, background: 'none', color: PRI, borderRadius: 99, padding: '5px 14px', fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const pillOn = { ...pill, border: 0, background: 'var(--theme-accent)', color: '#fff' }

// ── connect (just the username for now — public lists; a Discogs login (OAuth) comes later) ──

export function DiscogsConnect({ onClose, intro = false }) {
  const qc = useQueryClient()
  const { openD3 } = useLayout() || {}
  const { data: st } = useDiscogsAccount()
  const [username, setUsername] = useState('')
  const [coll, setColl] = useState(true)
  const [want, setWant] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const refresh = () => { qc.invalidateQueries({ queryKey: ['discogs-account'] }); qc.invalidateQueries({ queryKey: ['playlists'] }) }
  const step = st?.linked ? 3 : 1
  async function run(fn) {
    setBusy(true); setMsg('')
    try { return await fn() } catch (err) { setMsg(err.message) } finally { setBusy(false) }
  }
  const submitLink = e => run(async () => {
    e.preventDefault()
    if (!coll && !want) throw new Error('Tick at least one: collection or wantlist.')
    await discogsAccountApi.link({ username, collection: coll, wantlist: want })
    refresh()
  })
  const check = () => run(async () => {
    const r = await discogsAccountApi.verify()
    if (r.verified === false) setMsg(r.message)
    refresh()
  })
  const disconnect = () => { if (window.confirm('Disconnect Discogs? Your two Discogs playlists are removed from here (nothing changes on Discogs).')) run(async () => { await discogsAccountApi.unlink(); refresh(); onClose() }) }

  const box = { display: 'flex', alignItems: 'center', gap: 10, fontFamily: SANS, fontSize: 15, color: PRI, cursor: 'pointer' }
  const imported = (st?.collection?.imported || 0) + (st?.wantlist?.imported || 0)
  const expected = (st?.collection?.on ? st.collection.total || 0 : 0) + (st?.wantlist?.on ? st.wantlist.total || 0 : 0)
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Add your Discogs account"
        style={{ width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 20, padding: '22px 24px', background: 'var(--theme-dark3)', border: `1px solid ${LINE}`, color: PRI, fontFamily: SANS, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 20, flex: 1 }}>{intro && step === 1 ? 'Add your Discogs account?' : 'Your Discogs account'}</div>
          <button onClick={onClose} aria-label="Close" style={{ border: 0, background: 'none', color: SEC, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {step === 1 && <form onSubmit={submitLink} style={{ display: 'grid', gap: 14, marginTop: 10 }}>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: SEC }}>
            Bring your records in as playlists you can browse and play from here. They’re private to you.
          </div>
          <label style={{ display: 'flex', alignItems: 'center', background: 'color-mix(in srgb, var(--theme-text-pri) 7%, transparent)', border: `1px solid ${LINE}`, borderRadius: 99, padding: '8px 16px' }}>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Your Discogs username" aria-label="Discogs username" autoFocus maxLength={60}
              style={{ border: 0, outline: 0, background: 'none', flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 15, color: PRI }} />
          </label>
          <label style={box}><input type="checkbox" style={{ accentColor: 'var(--theme-accent)' }} checked={coll} onChange={e => setColl(e.target.checked)} /> Add my collection</label>
          <label style={box}><input type="checkbox" style={{ accentColor: 'var(--theme-accent)' }} checked={want} onChange={e => setWant(e.target.checked)} /> Add my wantlist</label>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: TER }}>We can only read lists that are public on Discogs (Settings → Privacy) for now. Connecting with a Discogs login, for private lists, comes later.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy || !username.trim()} style={{ ...pillOn, opacity: username.trim() ? 1 : 0.5 }}>{busy ? '…' : 'Continue'}</button>
            <button type="button" onClick={onClose} style={pill}>{intro ? 'Not now' : 'Cancel'}</button>
          </div>
        </form>}

        {step === 3 && <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: SEC }}>
            Connected as <b style={{ color: PRI }}>{st.username}</b>.{' '}
            {st.state === 'importing' ? `Importing your records… ${imported}${expected ? ` of ${expected}` : ''}` : st.state === 'error' ? 'Something went wrong importing.' : `${plural(imported, 'record')} imported.`}
          </div>
          {st.error && <div style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--theme-accent)' }}>{st.error}</div>}
          {st.ownership !== 'unverified'
            ? <div style={{ fontSize: 13, color: SEC }}>✓ Checked as yours.</div>
            : <div style={{ display: 'grid', gap: 8, padding: '12px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--theme-text-pri) 7%, transparent)' }}>
                <div style={{ fontSize: 13, lineHeight: 1.45, color: SEC }}>
                  Optional: show it’s your account. On Discogs open <a href="https://www.discogs.com/settings/profile" target="_blank" rel="noopener noreferrer" style={{ color: PRI }}>Settings → Profile</a>, paste this code into the “Profile” text box, save, then check. You can delete it afterwards.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 16, letterSpacing: '0.06em' }}>
                  <span style={{ flex: 1 }}>{st.code}</span>
                  <button onClick={() => navigator.clipboard?.writeText(st.code)} style={{ ...pill, padding: '3px 10px', fontSize: 12 }}>copy</button>
                  <button onClick={check} disabled={busy} style={{ ...pill, padding: '3px 12px', fontSize: 12 }}>{busy ? 'Checking…' : 'check'}</button>
                </div>
              </div>}
          {st.state === 'importing' && <div style={{ height: 4, borderRadius: 4, background: LINE, overflow: 'hidden' }}><div style={{ height: '100%', width: `${expected ? Math.min(100, Math.round(imported / expected * 100)) : 15}%`, background: 'var(--theme-accent)', transition: 'width .4s' }} /></div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => { onClose(); openD3?.('playlists') }} style={pillOn}>Open my playlists</button>
            <button onClick={() => run(async () => { await discogsAccountApi.sync(); refresh() })} disabled={busy || st.state === 'importing'} style={pill}>Refresh now</button>
            <button onClick={disconnect} disabled={busy} style={{ ...pill, color: SEC, fontWeight: 400 }}>Disconnect</button>
          </div>
        </div>}
        {msg && <div style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.45, color: 'var(--theme-accent)' }}>{msg}</div>}
      </div>
    </div>
  )
}

// Shown once after signing in, when no Discogs account is linked yet.
export function DiscogsPrompt() {
  const { data: st, isSuccess } = useDiscogsAccount()
  // Once it has appeared it stays until closed — linking the account mid-way mustn't make it vanish.
  const [opened, setOpened] = useState(false)
  const eligible = isLoggedIn() && isSuccess && !!st && !st.linked && !discogsPromptSeen()
  if (eligible && !opened) setOpened(true)
  if (!opened) return null
  return <DiscogsConnect intro onClose={() => { markDiscogsPromptSeen(); setOpened(false) }} />
}

// The line at the top of the Playlists drawer.
export function DiscogsStrip() {
  const qc = useQueryClient()
  const { data: st } = useDiscogsAccount()
  const [open, setOpen] = useState(false)
  // The list rows' counts follow the import.
  const imported = (st?.collection?.imported || 0) + (st?.wantlist?.imported || 0)
  useEffect(() => { if (st?.linked) qc.invalidateQueries({ queryKey: ['playlists'] }) }, [qc, st?.linked, st?.state, imported])
  if (!isLoggedIn() || !st) return null
  const text = !st.linked ? '＋ Add your Discogs collection & wantlist'
    : st.state === 'importing' ? `Discogs: ${st.username} · importing…`
    : `Discogs: ${st.username} · manage`
  return <>
    <button onClick={() => setOpen(true)} style={{ ...(st.linked ? pill : pillOn), marginBottom: 12, fontWeight: 600 }}>{text}</button>
    {open && <DiscogsConnect onClose={() => setOpen(false)} />}
  </>
}

// A row on your own profile (WallCard in Collect.jsx), beside the other settings.
export function DiscogsSetting({ pri, ter, fill }) {
  const { data: st } = useDiscogsAccount()
  const [open, setOpen] = useState(false)
  const imported = (st?.collection?.imported || 0) + (st?.wantlist?.imported || 0)
  const sub = !st?.linked ? 'Bring in your collection and wantlist as playlists'
    : st.state === 'importing' ? `${st.username} · importing…`
    : `${st.username} · ${plural(imported, 'record')}${st.ownership && st.ownership !== 'unverified' ? ' · checked as yours' : ''}`
  return <>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: fill(10) }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>Discogs</span>
        <span style={{ display: 'block', fontSize: 12, color: ter, marginTop: 2 }}>{sub}</span>
      </span>
      <button onClick={() => setOpen(true)} style={{ border: 0, borderRadius: 99, padding: '8px 16px', background: pri, color: 'var(--theme-showcase)', fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{st?.linked ? 'Manage' : 'Connect'}</button>
    </div>
    {open && <DiscogsConnect onClose={() => setOpen(false)} />}
  </>
}
