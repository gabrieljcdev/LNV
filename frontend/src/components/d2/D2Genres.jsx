import { useGenres } from '../../hooks/useArtists.js'
import { D2Header } from './D2Artists.jsx'

export default function D2Genres() {
  const { data: genres, isLoading } = useGenres()

  if (isLoading) return (
    <div style={{ padding: 16, fontFamily: 'VT323, monospace', fontSize: 13, color: 'var(--grey-text)', letterSpacing: 1 }}>
      LOADING GENRES...
    </div>
  )

  return (
    <div style={{ padding: '16px', overflow: 'auto', height: '100%' }}>
      <D2Header>Genres</D2Header>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {(genres ?? []).map((g, i) => (
          <span
            key={i}
            style={{
              fontFamily: 'VT323, monospace',
              fontSize: 13,
              letterSpacing: 0.5,
              padding: '3px 10px',
              background: 'var(--pastel-blue)',
              color: 'var(--charcoal)',
              borderRadius: 100,
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {typeof g === 'string' ? g : g.genre}
          </span>
        ))}
      </div>
    </div>
  )
}
