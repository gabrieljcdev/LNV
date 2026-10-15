import { useEffect, useRef, useState } from 'react'
import { usePhone } from '../lib/usePhone'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// ── Search box (2026-10-01) ───────────────────────────────────────────────────
// Typing opens a dropdown instead of re-filtering the feed on every pause:
//   Go to   — a post number ("54", "#54"), like a page in a book
//   Posts   — ranked matches (backend: services/searchService.js)
//   Artists / Labels / Genres — open that drawer
//   Show all results — filters the feed, as the old search did
// ↑/↓ move, Enter picks, Esc closes. The feed only changes on a pick.
//
// Props: onJump(postId) scrolls the feed to a post; onOpenDrawer(kind, name)
// opens a drawer; onShowAll(query) filters the feed; onClear() returns the
// feed to the latest posts; filtering (bool) = the feed is filtered now.

const MONO = "'IBM Plex Mono', monospace", SANS = "'Barlow', sans-serif"

// `style` moves the box (the phone top bar puts it in its row, 2026-10-05);
// the results then drop under the nearest positioned parent, full width.
export default function SearchBox({ onJump, onOpenDrawer, onShowAll, onClear, filtering, busy, style }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  // Phones: 16px input text (iOS zooms the page into anything smaller), no "/" hint.
  const phone = usePhone()
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  // Debounced suggestions; a newer query wins over a slower older response.
  useEffect(() => {
    const term = q.trim()
    if (!term) { setData(null); return }
    let stale = false
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await fetch(`${API}/posts/suggest?q=${encodeURIComponent(term)}`)
        const d = r.ok ? await r.json() : null
        if (!stale) { setData(d); setActive(0) }
      } catch { if (!stale) setData(null) }
      finally { if (!stale) setLoading(false) }
    }, 150)
    return () => { stale = true; clearTimeout(t) }
  }, [q])

  // Close on a click outside.
  useEffect(() => {
    if (!open) return
    const h = e => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [open])

  // "/" focuses the search from anywhere (not while typing elsewhere).
  useEffect(() => {
    const h = e => {
      if (e.key !== '/' || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return
      e.preventDefault(); inputRef.current?.focus(); setOpen(true)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const term = q.trim()
  // One flat list, so the arrow keys walk every row in display order.
  const items = []
  if (data && term) {
    if (data.goto) items.push({ kind: 'goto', post: data.goto })
    for (const p of data.posts) items.push({ kind: 'post', post: p })
    for (const [kind, list] of [['artists', data.artists], ['labels', data.labels], ['genres', data.genres]]) {
      for (const n of list) items.push({ kind, name: n.name, count: n.count })
    }
    if (data.posts.length || data.goto) items.push({ kind: 'all' })
  }

  function pick(it) {
    if (!it) { if (term) { onShowAll(term); setOpen(false) } return }
    if (it.kind === 'goto' && it.post.missing) return
    if (it.kind === 'goto' || it.kind === 'post') onJump(it.post.id)
    else if (it.kind === 'all') onShowAll(term)
    else onOpenDrawer(it.kind, it.name)
    setOpen(false)
    inputRef.current?.blur()
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]) }
    else if (e.key === 'Escape') { if (open) setOpen(false); else inputRef.current?.blur() }
  }

  function clear() {
    setQ(''); setData(null); setOpen(false)
    if (filtering) onClear()
    inputRef.current?.focus()
  }

  const show = open && term && data
  const empty = show && !items.length
  let i = -1 // running index across groups
  const row = (it, content) => {
    i++
    const idx = i
    return (
      <button key={it.kind + (it.post?.id ?? it.name ?? '')} role="option" aria-selected={idx === active}
        onMouseEnter={() => setActive(idx)} onClick={() => pick(it)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 12px', border: 'none', borderRadius: 10, textAlign: 'left', cursor: it.post?.missing ? 'default' : 'pointer', background: idx === active ? 'color-mix(in srgb, var(--theme-accent) 16%, transparent)' : 'transparent', color: 'var(--theme-text-pri)', font: 'inherit' }}>
        {content}
      </button>
    )
  }
  const head = label => <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--theme-text-ter)', padding: '10px 12px 4px' }}>{label}</div>
  const num = id => <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--theme-text-ter)', minWidth: 34, flexShrink: 0 }}>#{String(id).padStart(2, '0')}</span>
  const thumb = p => <span style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: p.cover ? `var(--theme-dark2) center/cover no-repeat url("${p.cover}")` : 'var(--theme-dark2)' }} />
  const postText = p => (
    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.artist || p.title}</span>
      <span style={{ fontFamily: SANS, fontStyle: 'italic', fontSize: 12, color: 'var(--theme-text-sec)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {[p.artist ? p.title : null, p.year].filter(Boolean).join(' · ')}
      </span>
    </span>
  )
  const nameRow = it => row(it, <>
    <span style={{ flex: 1, fontFamily: SANS, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--theme-text-ter)' }}>{it.count} {it.count === 1 ? 'post' : 'posts'}</span>
  </>)

  return (
    <div ref={boxRef} data-float-top="" style={{ position: 'absolute', top: 16, right: 16, zIndex: 100, width: 320, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', borderRadius: 99, padding: '7px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
        <span aria-hidden="true" style={{ color: 'var(--theme-text-ter)', fontSize: 13, marginRight: 8 }}>{loading || busy ? '◐' : '⌕'}</span>
        <input ref={inputRef} value={q} role="combobox" aria-expanded={!!show} aria-label="Search posts, artists, labels, genres, or a post number"
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          placeholder="search, or a post number…"
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--theme-text-pri)', fontFamily: SANS, fontSize: phone ? 16 : 12.5 }} />
        {filtering && <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--theme-accent)', marginLeft: 6 }}>filtered</span>}
        {(q || filtering) && <button onClick={clear} aria-label="Clear search" style={{ background: 'none', border: 'none', color: 'var(--theme-text-ter)', cursor: 'pointer', fontSize: 14, padding: 0, marginLeft: 8 }}>×</button>}
        {!q && !filtering && !phone && <kbd style={{ fontFamily: MONO, fontSize: 10, color: 'var(--theme-text-ter)', border: '1px solid var(--theme-border)', borderRadius: 4, padding: '0 5px' }}>/</kbd>}
      </div>

      {show && (
        <div role="listbox" style={{ ...(style ? { position: 'absolute', left: 0, right: 0, top: '100%' } : null), marginTop: 8, maxHeight: '70vh', overflowY: 'auto', background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', borderRadius: 18, padding: 6, boxShadow: '0 18px 40px -10px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.15)' }}>
          {empty && <div style={{ padding: '14px 12px', fontFamily: SANS, fontSize: 13, color: 'var(--theme-text-sec)' }}>Nothing matches “{term}”.</div>}
          {data.goto && <>{head('Go to')}{row({ kind: 'goto', post: data.goto }, data.goto.missing
            ? <><span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--theme-text-ter)', minWidth: 34 }}>#{String(data.goto.id).padStart(2, '0')}</span><span style={{ fontFamily: SANS, fontSize: 13, color: 'var(--theme-text-sec)' }}>No post with that number yet</span></>
            : <>{num(data.goto.id)}{thumb(data.goto)}{postText(data.goto)}<span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: 'var(--theme-text-ter)' }}>↵</span></>)}</>}
          {data.posts.length > 0 && <>{head('Posts')}{data.posts.map(p => row({ kind: 'post', post: p }, <>{num(p.id)}{thumb(p)}{postText(p)}</>))}</>}
          {data.artists.length > 0 && <>{head('Artists')}{data.artists.map(n => nameRow({ kind: 'artists', name: n.name, count: n.count }))}</>}
          {data.labels.length > 0 && <>{head('Labels')}{data.labels.map(n => nameRow({ kind: 'labels', name: n.name, count: n.count }))}</>}
          {data.genres.length > 0 && <>{head('Genres')}{data.genres.map(n => nameRow({ kind: 'genres', name: n.name, count: n.count }))}</>}
          {(data.posts.length > 0 || data.goto) && <div style={{ borderTop: '1px solid var(--theme-border)', marginTop: 6, paddingTop: 4 }}>
            {row({ kind: 'all' }, <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--theme-text-sec)' }}>Show all results for “{term}” in the feed</span>)}
          </div>}
        </div>
      )}
    </div>
  )
}
