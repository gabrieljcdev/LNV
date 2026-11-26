import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

// Temporary dev tool (2026-10-12): open the app with ?brandtool in the address to get two sliders — CHEWING's size and
// THE CEILING's size, separately — for the nav-strip wordmark (Strip.jsx). Values apply live, are kept in this browser
// (localStorage 'lnv_brand_scale') and "Save for Claude" writes them to frontend/brand-scale.json (vite.config.js).
export const BRAND_SCALE_KEY = 'lnv_brand_scale'
export function readBrandScale() {
  try { const v = JSON.parse(localStorage.getItem(BRAND_SCALE_KEY)); return v && v.chewing > 0 && v.ceiling > 0 ? v : null } catch { return null }
}
export function applyBrandScale(brand, v) {
  brand.style.setProperty('--cw', `${v.chewing}px`)
  brand.style.setProperty('--cl', `${v.ceiling}px`)
  if (v.left != null) { brand.style.left = `${v.left}px`; brand.style.bottom = `${v.bottom}px` }
}

export default function BrandScaleTool({ brandRef }) {
  const [v, setV] = useState(() => readBrandScale() || { chewing: Math.round(parseFloat(brandRef.current?.style.getPropertyValue('--cw')) || 84), ceiling: 24, left: 28, bottom: 40 })
  const [msg, setMsg] = useState('')
  const set = patch => {
    const n = { ...v, ...patch }
    setV(n); setMsg('')
    try { localStorage.setItem(BRAND_SCALE_KEY, JSON.stringify(n)) } catch { /* private mode */ }
    if (brandRef.current) applyBrandScale(brandRef.current, n)
  }
  // Drag the wordmark itself to move it (left / bottom of the rail).
  useEffect(() => {
    const el = brandRef.current
    if (!el) return
    el.style.cursor = 'grab'; el.style.touchAction = 'none'; el.style.userSelect = 'none'
    let start = null
    const down = e => { start = { x: e.clientX, y: e.clientY, left: v.left ?? 28, bottom: v.bottom ?? 40 }; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; e.preventDefault() }
    const move = e => { if (start) set({ left: Math.round(start.left + e.clientX - start.x), bottom: Math.round(start.bottom - (e.clientY - start.y)) }) }
    const up = () => { start = null; el.style.cursor = 'grab' }
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up)
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.style.cursor = '' }
  })
  const save = async () => {
    try { const r = await fetch('/__brand-scale', { method: 'POST', body: JSON.stringify(v) }); setMsg(r.ok ? 'saved - tell Claude' : 'save failed') } catch { setMsg('save failed') }
  }
  const row = (label, key, min, max) => (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{label}</span><b>{v[key]}px</b></div>
      <input type="range" min={min} max={max} step="1" value={v[key]} onChange={e => set({ [key]: +e.target.value })} style={{ width: '100%' }} />
    </label>
  )
  return createPortal(
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 9999, width: 240, padding: 14, borderRadius: 12, background: '#111', color: '#fff', font: '12px sans-serif', boxShadow: '0 4px 20px rgba(0,0,0,.5)' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Wordmark size</div>
      <div style={{ opacity: 0.7, marginBottom: 10 }}>Drag the wordmark to move it</div>
      {row('CHEWING', 'chewing', 20, 200)}
      {row('THE CEILING', 'ceiling', 8, 80)}
      <button onClick={save} style={{ width: '100%', padding: 6, cursor: 'pointer' }}>Save for Claude</button>
      <button onClick={() => { try { navigator.clipboard.writeText(JSON.stringify(v)); setMsg('copied - paste it to Claude') } catch { setMsg('copy failed') } }} style={{ width: '100%', padding: 6, marginTop: 6, cursor: 'pointer' }}>Copy values</button>
      <div style={{ marginTop: 6, opacity: 0.8 }}>{msg || 'chewing ' + v.chewing + ' / ceiling ' + v.ceiling + ' / left ' + v.left + ' / bottom ' + v.bottom}</div>
    </div>, document.body)
}
