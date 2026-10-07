import { useState } from 'react'
import { authHeaders, isLoggedIn } from '../lib/auth'

// "Know where this is? Add a link" (2026-10-07). Shown under a track nothing
// could find. A pasted link is opened and its real title compared with the
// track on the server (services/trackLinks.js) before anything is saved:
//   fits       -> live for everyone, credited "added by …"
//   not sure   -> waiting: others get "is this right?"; two yeses make it live
//   different  -> refused, with the reason
// Only YouTube, SoundCloud and Spotify tracks are accepted.

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)', LINE = 'var(--theme-border)'
const WARN = '#d39b1e', BAD = '#d1462f'

const post = async (path, body) => {
  const r = await fetch(`${API}/track-links${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  return { ok: r.ok, ...d, error: r.ok ? null : (d.error || d.reason || `Something went wrong (${r.status})`) }
}

const wrap = { padding: '2px 0 9px 40px', fontFamily: SANS, fontSize: 13, color: SEC, lineHeight: 1.45 }
const text = { background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 11.5, color: TER, textDecoration: 'underline', textUnderlineOffset: 3 }
const pill = (on = true) => ({ border: `1px solid ${LINE}`, borderRadius: 99, padding: '4px 12px', background: 'none', color: PRI, fontFamily: SANS, fontSize: 12.5, fontWeight: 600, cursor: on ? 'pointer' : 'default', opacity: on ? 1 : 0.5 })

// Under a track with no link.
export function AddLinkRow({ releaseId, linkKey, title, artist, suggestion, mine, onDone }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [check, setCheck] = useState(null)   // what the server made of the link
  const [note, setNote] = useState('')

  if (!isLoggedIn()) return <div style={{ ...wrap, color: TER }}>sign in to add a link for this track</div>
  if (note) return <div style={wrap}>{note}</div>

  // Someone else's link, waiting for a yes / no.
  if (suggestion) {
    const vote = async how => {
      setBusy(true)
      const r = await post(`/${suggestion.id}/vote`, { vote: how })
      setBusy(false)
      setNote(r.error ? r.error : how === 'ok' ? 'Thanks — counted.' : 'Thanks — noted.')
      onDone?.()
    }
    return (
      <div style={wrap}>
        <span style={{ color: TER }}>{suggestion.by} suggested a link:</span> <b style={{ color: PRI, fontWeight: 600 }}>{suggestion.title || suggestion.url}</b>{' '}
        <a href={suggestion.url} target="_blank" rel="noopener noreferrer" style={{ ...text, textDecoration: 'none' }}>listen ↗</a>
        <span style={{ display: 'inline-flex', gap: 6, marginLeft: 10 }}>
          <button disabled={busy} onClick={() => vote('ok')} style={pill(!busy)}>✓ right track</button>
          <button disabled={busy} onClick={() => vote('bad')} style={pill(!busy)}>✗ wrong</button>
        </span>
      </div>
    )
  }
  // Their own, waiting.
  if (mine) return <div style={{ ...wrap, color: TER }}>Your link is waiting for others to confirm it: <span style={{ color: SEC }}>{mine.title || mine.url}</span></div>

  if (!open) return <div style={wrap}><button onClick={() => setOpen(true)} style={text}>＋ know where this is? add a link</button></div>

  const body = { release_id: releaseId, position: linkKey, url: url.trim(), title, artist }
  const doCheck = async () => {
    if (!url.trim()) return
    setBusy(true); setCheck(null)
    const r = await post('/check', body)
    setBusy(false)
    setCheck(r.error && !r.platform ? { bad: r.error } : r)
  }
  const doAdd = async () => {
    setBusy(true)
    const r = await post('', body)
    setBusy(false)
    if (r.error) { setCheck({ bad: r.error }); return }
    setNote(r.status === 'live' ? 'Added — thanks!' : 'Added. It shows for everyone once two other people confirm it.')
    onDone?.()
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={url} onChange={e => { setUrl(e.target.value); setCheck(null) }} onKeyDown={e => e.key === 'Enter' && doCheck()}
          placeholder="paste a YouTube, SoundCloud or Spotify link" autoFocus
          style={{ flex: '1 1 220px', minWidth: 0, border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 10px', background: 'transparent', color: PRI, fontFamily: MONO, fontSize: 12 }} />
        <button disabled={busy || !url.trim()} onClick={doCheck} style={pill(!busy && !!url.trim())}>{busy && !check ? 'checking…' : 'check'}</button>
        <button onClick={() => { setOpen(false); setUrl(''); setCheck(null) }} style={text}>cancel</button>
      </div>
      {check?.bad && <div style={{ marginTop: 6, color: BAD }}>{check.bad}</div>}
      {check?.ok && (
        <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
          {check.thumb && <img src={check.thumb} alt="" style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ color: PRI, fontWeight: 600, overflowWrap: 'anywhere' }}>{check.title}</div>
            <div style={{ color: check.verdict === 'strong' ? SEC : WARN }}>
              {check.verdict === 'strong' ? 'Looks like the right track.' : `${check.reason} Others will be asked to confirm it.`}
            </div>
          </div>
          <button disabled={busy} onClick={doAdd} style={{ ...pill(!busy), marginLeft: 'auto', flexShrink: 0 }}>{busy ? '…' : 'add it'}</button>
        </div>
      )}
    </div>
  )
}

// Under a track whose link someone added: credit, and a way to say it's wrong.
export function UserLinkNote({ by, submissionId, onDone }) {
  const [ask, setAsk] = useState(false)
  const [done, setDone] = useState('')
  if (done) return <div style={{ ...wrap, padding: '0 0 6px 40px', color: TER, fontFamily: MONO, fontSize: 11.5 }}>{done}</div>
  const wrong = async () => {
    const r = await post(`/${submissionId}/vote`, { vote: 'bad' })
    setDone(r.error ? r.error : 'Thanks — noted.')
    onDone?.()
  }
  return (
    <div style={{ padding: '0 0 6px 40px', fontFamily: MONO, fontSize: 11.5, color: TER }}>
      link added by {by}
      {isLoggedIn() && submissionId != null && (ask
        ? <> · sure? <button onClick={wrong} style={text}>yes, it's wrong</button> <button onClick={() => setAsk(false)} style={text}>no</button></>
        : <> · <button onClick={() => setAsk(true)} style={text}>wrong link?</button></>)}
    </div>
  )
}
