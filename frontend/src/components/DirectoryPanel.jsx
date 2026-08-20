import { useState, useRef } from 'react'
import CreateCollectionModal from './CreateCollectionModal'
import { useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'

const BASE = import.meta.env.VITE_API_URL

function CollectionThumb({ covers = [], size = 72 }) {
  const imgs = covers.filter(Boolean)
  if (imgs.length === 0) {
    return (
      <div style={{ width: size, height: size, borderRadius: 8, background: 'var(--theme-dark2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--theme-text-ter)', fontSize: 22, flexShrink: 0 }}>◈</div>
    )
  }
  if (imgs.length === 1) {
    return <img src={imgs[0]} style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover', flexShrink: 0, display: 'block' }} alt="" />
  }
  // 2x2 mosaic for 2-4 images
  const half = size / 2
  const filled = [...imgs, null, null, null, null].slice(0, 4)
  return (
    <div style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', flexShrink: 0 }}>
      {filled.map((src, i) => src
        ? <img key={i} src={src} style={{ width: half, height: half, objectFit: 'cover', display: 'block' }} alt="" />
        : <div key={i} style={{ width: half, height: half, background: 'var(--theme-dark2)' }} />
      )}
    </div>
  )
}

export default function DirectoryPanel({ onSelectCrate, onSelectFeed, selectedId, panelRef }) {
  const [tab, setTab] = useState('public')
  const [createOpen, setCreateOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: publicCrates = [], isLoading } = useQuery({
    queryKey: ['crates-public'],
    queryFn: async () => {
      const r = await fetch(`${BASE}/crates/public`)
      if (!r.ok) return []
      return r.json()
    },
  })

  return (
    <div
      id="lnv-directory"
      ref={panelRef}
      style={{
        width: 0,
        minWidth: 0,
        height: '100vh',
        background: 'var(--theme-sidebar)',
        borderRight: '1px solid var(--theme-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'background 0.8s',
      }}
    >
      {/* Inner — fixed width so content doesn't reflow as panel animates */}
      <div style={{ width: 380, height: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '24px 24px 16px', flexShrink: 0 }}>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 15, color: 'var(--theme-text-pri)', letterSpacing: 1, marginBottom: 14 }}>
            COLLECTIONS
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['public', 'mine'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontFamily: 'VT323, monospace', fontSize: 12, letterSpacing: 1,
                padding: '4px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--theme-accent)' : 'transparent',
                color: tab === t ? '#fff' : 'var(--theme-text-ter)',
                outline: tab === t ? 'none' : '1px solid var(--theme-border)',
              }}>
                {t === 'public' ? 'PUBLIC' : 'MY CRATES'}
              </button>
            ))}
          </div>
        </div>

        {/* Main feed row */}
        <div
          onClick={onSelectFeed}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 24px', cursor: 'pointer', flexShrink: 0,
            background: !selectedId ? 'rgba(232,93,4,0.07)' : 'transparent',
            borderLeft: !selectedId ? '3px solid var(--theme-accent)' : '3px solid transparent',
            borderBottom: '1px solid var(--theme-border)',
          }}
          onMouseEnter={e => { if (selectedId) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
          onMouseLeave={e => { if (selectedId) e.currentTarget.style.background = 'transparent' }}
        >
          <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--theme-dark2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--theme-accent)', flexShrink: 0 }}>◈</div>
          <div>
            <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 13, color: 'var(--theme-text-pri)' }}>MAIN FEED</div>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: 10, color: 'var(--theme-text-ter)', letterSpacing: 1, marginTop: 2 }}>THE FULL LOG · ALL RECORDS</div>
          </div>
        </div>

        {/* Collections grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start' }}>
          {isLoading && (
            <div style={{ gridColumn: '1/-1', fontFamily: 'VT323, monospace', fontSize: 12, color: 'var(--theme-text-ter)', letterSpacing: 2 }}>LOADING...</div>
          )}
          {!isLoading && publicCrates.length === 0 && (
            <div style={{ gridColumn: '1/-1', fontFamily: 'VT323, monospace', fontSize: 11, color: 'var(--theme-text-ter)', letterSpacing: 1, lineHeight: 1.8 }}>
              NO PUBLIC COLLECTIONS YET.<br />BE THE FIRST.
            </div>
          )}
          {publicCrates.map(crate => {
            const isSelected = selectedId === crate.id
            return (
              <div
                key={crate.id}
                onClick={() => onSelectCrate(crate)}
                style={{
                  cursor: 'pointer',
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: isSelected ? '2px solid var(--theme-accent)' : '1px solid var(--theme-border)',
                  background: 'var(--theme-dark3)',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--theme-text-sec)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--theme-border)' }}
              >
                {/* Cover */}
                <div style={{ width: '100%', aspectRatio: '1', overflow: 'hidden', background: 'var(--theme-dark2)' }}>
                  <CollectionThumb covers={crate.covers} size={160} />
                </div>
                {/* Info */}
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 700, fontSize: 11, color: 'var(--theme-text-pri)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                    {crate.name}
                  </div>
                  <div style={{ fontFamily: 'VT323, monospace', fontSize: 9, color: 'var(--theme-text-ter)', letterSpacing: 0.5 }}>
                    @{crate.author} · {crate.record_count} REC
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--theme-border)', flexShrink: 0 }}>
          <button style={{
            width: '100%', fontFamily: 'VT323, monospace', fontSize: 12, letterSpacing: 1,
            padding: '8px 0', borderRadius: 20, border: '1px solid var(--theme-border)',
            background: 'transparent', color: 'var(--theme-text-sec)', cursor: 'pointer',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--theme-accent)'; e.currentTarget.style.color = 'var(--theme-accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--theme-border)'; e.currentTarget.style.color = 'var(--theme-text-sec)' }}
            onClick={() => setCreateOpen(true)}
          >
            + NEW COLLECTION
          </button>

          {createOpen && (
            <CreateCollectionModal
              onClose={() => setCreateOpen(false)}
              onCreate={crate => {
                queryClient.invalidateQueries({ queryKey: ['crates-public'] })
                onSelectCrate(crate)
                setCreateOpen(false)
              }}
            />
          )}
        </div>

      </div>
    </div>
  )
}
