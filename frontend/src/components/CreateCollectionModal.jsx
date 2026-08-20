import { useState } from 'react'

const API = import.meta.env.VITE_API_URL

export default function CreateCollectionModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const r = await fetch(`${API}/crates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'lnv_admin', name: name.trim(), description: description.trim(), is_public: isPublic })
      })
      if (!r.ok) throw new Error('Failed to create')
      const data = await r.json()
      onCreate({ id: data.id, name: data.name, is_public: isPublic ? 1 : 0, covers: [], record_count: 0, author: 'lnv_admin' })
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ width: 420, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>

        {/* Header */}
        <div style={{ background: '#1e2126', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 14, color: '#fff', letterSpacing: 1 }}>NEW COLLECTION</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: '#b0b8c4', letterSpacing: 2, marginBottom: 5 }}>NAME</div>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Late Night Techno, UK Rave 92-94..."
              style={{ width: '100%', borderRadius: 20, border: '1.5px solid rgba(0,0,0,0.12)', padding: '8px 14px', fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#1e2126', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: '#b0b8c4', letterSpacing: 2, marginBottom: 5 }}>DESCRIPTION <span style={{ opacity: 0.5 }}>(OPTIONAL)</span></div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this collection about?"
              rows={3}
              style={{ width: '100%', borderRadius: 10, border: '1.5px solid rgba(0,0,0,0.12)', padding: '8px 14px', fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#1e2126', outline: 'none', boxSizing: 'border-box', resize: 'none', lineHeight: 1.5 }}
            />
          </div>

          {/* Public / Private toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[{ label: 'PUBLIC', value: true, desc: 'Visible in directory' }, { label: 'PRIVATE', value: false, desc: 'Invite only' }].map(opt => (
              <div key={opt.label} onClick={() => setIsPublic(opt.value)}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${isPublic === opt.value ? '#1e2126' : 'rgba(0,0,0,0.1)'}`, cursor: 'pointer', background: isPublic === opt.value ? '#1e2126' : 'transparent', transition: 'all 0.15s' }}>
                <div style={{ fontFamily: 'VT323, monospace', fontSize: 13, color: isPublic === opt.value ? '#fff' : '#6a7480', letterSpacing: 1 }}>{opt.label}</div>
                <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 10, color: isPublic === opt.value ? 'rgba(255,255,255,0.5)' : '#b0b8c4', marginTop: 2 }}>{opt.desc}</div>
              </div>
            ))}
          </div>

          {error && <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: '#e85d04', marginBottom: 10 }}>{error}</div>}

          <button onClick={handleCreate} disabled={!name.trim() || saving}
            style={{ width: '100%', padding: '11px 0', borderRadius: 20, border: 'none', background: name.trim() ? '#e85d04' : '#e0e0e0', color: '#fff', fontFamily: 'VT323, monospace', fontSize: 14, letterSpacing: 1, cursor: name.trim() ? 'pointer' : 'default', transition: 'background 0.2s' }}>
            {saving ? 'CREATING...' : 'CREATE COLLECTION ▶'}
          </button>
        </div>
      </div>
    </div>
  )
}
