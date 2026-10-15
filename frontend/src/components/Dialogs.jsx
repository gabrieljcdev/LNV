import { useEffect, useRef, useState } from 'react'

// In-app replacements for window.prompt / confirm / alert (2026-10-09, gabriel: the browser's own
// "waxopathy.com says" box looked out of place). Call them from anywhere and await the answer:
//   const name = await askText({ title: 'Name the new playlist', placeholder: 'e.g. Techno', ok: 'Create' })   // string, or null if cancelled
//   if (await askConfirm({ title: 'Delete this post?', body: "This can't be undone.", ok: 'Delete', danger: true })) …   // true / false
//   await tell({ title: 'Something went wrong', body: err.message })
// <DialogHost /> (mounted once in App.jsx) draws them; with none mounted they answer "cancelled".

const SANS = "'Barlow', sans-serif"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', LINE = 'var(--theme-border)'

let add = null
const show = (kind, opts, fallback) => new Promise(resolve => {
  if (!add) { resolve(fallback); return }
  add({ kind, ...opts, resolve })
})
export const askText = (opts = {}) => show('text', opts, null)
export const askConfirm = (opts = {}) => show('confirm', opts, false)
export const tell = (opts = {}) => show('tell', opts, undefined)

const pill = { border: `1px solid ${LINE}`, background: 'none', color: PRI, borderRadius: 99, padding: '7px 18px', fontFamily: SANS, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const pillOn = { ...pill, border: '1px solid var(--theme-accent)', background: 'var(--theme-accent)', color: '#fff' }

export function DialogHost() {
  const [queue, setQueue] = useState([])
  useEffect(() => {
    add = item => setQueue(q => [...q, item])
    return () => { add = null }
  }, [])
  const item = queue[0]
  if (!item) return null
  const done = answer => { item.resolve(answer); setQueue(q => q.slice(1)) }
  return <Dialog key={queue.length + (item.title || '')} item={item} done={done} />
}

function Dialog({ item, done }) {
  const [value, setValue] = useState(item.value || '')
  const input = useRef(null)
  const isText = item.kind === 'text', isTell = item.kind === 'tell'
  const cancel = () => done(isText ? null : isTell ? undefined : false)
  const accept = () => {
    if (isText) { const v = value.trim(); if (!v) return; done(v) } else done(isTell ? undefined : true)
  }
  useEffect(() => { if (isText) { input.current?.focus(); input.current?.select() } }, [isText])
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); cancel() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) cancel() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form role="dialog" aria-modal="true" aria-label={item.title || 'Message'}
        onSubmit={e => { e.preventDefault(); accept() }}
        style={{ width: 'min(400px, 100%)', borderRadius: 20, padding: '22px 24px', background: 'var(--theme-dark3)', border: `1px solid ${LINE}`, color: PRI, fontFamily: SANS, boxShadow: '0 30px 80px rgba(0,0,0,0.5)', display: 'grid', gap: 14 }}>
        {item.title && <div style={{ fontWeight: 800, fontSize: 19, lineHeight: 1.25 }}>{item.title}</div>}
        {item.body && <div style={{ fontSize: 14, lineHeight: 1.5, color: SEC }}>{item.body}</div>}
        {isText && (
          <input ref={input} value={value} onChange={e => setValue(e.target.value)} placeholder={item.placeholder || ''} maxLength={item.maxLength || 80}
            aria-label={item.title || 'Name'} autoComplete="off"
            style={{ boxSizing: 'border-box', width: '100%', padding: '10px 16px', borderRadius: 99, border: `1px solid ${LINE}`, background: 'color-mix(in srgb, var(--theme-text-pri) 7%, transparent)', color: PRI, fontFamily: SANS, fontSize: 15, outline: 'none' }} />
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {!isTell && <button type="button" onClick={cancel} style={pill}>{item.cancel || 'Cancel'}</button>}
          <button type="submit" disabled={isText && !value.trim()} autoFocus={!isText}
            style={{ ...pillOn, ...(item.danger ? { background: '#c0392b', borderColor: '#c0392b' } : null), opacity: isText && !value.trim() ? 0.5 : 1 }}>{item.ok || 'OK'}</button>
        </div>
      </form>
    </div>
  )
}
