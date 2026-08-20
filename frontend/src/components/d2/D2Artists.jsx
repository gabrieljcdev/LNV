import { useArtists } from '../../hooks/useArtists.js'
import { useLayout } from '../../context/LayoutContext.jsx'

export default function D2Artists() {
  const { data: artists, isLoading } = useArtists()
  const { openD3 } = useLayout()

  if (isLoading) return <Loading label="Artists" />

  return (
    <div style={{ padding: '16px', overflow: 'auto', height: '100%' }}>
      <D2Header>Artists</D2Header>
      {(artists ?? []).map(a => (
        <div
          key={a.id}
          onClick={() => openD3('artist', { name: a.artist_name })}
          style={rowStyle}
        >
          <span style={{ fontSize: 13, color: 'var(--charcoal)', fontWeight: 500 }}>
            {a.artist_name}
          </span>
        </div>
      ))}
    </div>
  )
}

function Loading({ label }) {
  return (
    <div style={{ padding: 16, fontFamily: 'VT323, monospace', fontSize: 13, color: 'var(--grey-text)', letterSpacing: 1 }}>
      LOADING {label.toUpperCase()}...
    </div>
  )
}

export function D2Header({ children }) {
  return (
    <div style={{
      fontFamily: 'VT323, monospace',
      fontSize: 11,
      letterSpacing: 2,
      color: 'var(--grey-text)',
      textTransform: 'uppercase',
      marginBottom: 14,
      paddingBottom: 8,
      borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </div>
  )
}

const rowStyle = {
  padding: '8px 0',
  borderBottom: '1px solid var(--border)',
  cursor: 'pointer',
}
