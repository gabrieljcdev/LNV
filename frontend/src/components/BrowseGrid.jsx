// Shared presentational pieces for the artist/genre/label browse drawers
// (pages/Artists.jsx, Genres.jsx, Labels.jsx — rendered inside
// ContentPanel.jsx via openD3()). Pulled out so the three panels read as
// one consistent system instead of three near-identical hand-rolled copies
// that drift apart over time. Pure presentation — each page still owns its
// own data fetching/selection state.
//
// Visual language matches the rest of the site: BrowseTile's pill copies
// Strip.jsx's nav tabs directly — same VT323 monospace, 13px, 2px
// letter-spacing, lowercase treatment, theme-dark3 fill with theme-accent
// on hover — and BrowseHeader/title text uses Barlow 900 (Strip/Feed's
// heading treatment). Colors (theme-dark3 tiles, theme-border hairlines)
// already adapt per time-of-day palette, see themeService.js.
//
// The panel-width-scales-to-content logic (`useReportPanelWidth`) lives in
// ../hooks/useReportPanelWidth.js, not here — a custom hook mixed into a
// file of component exports trips eslint's react-refresh rule.

export function BrowseHeader({ title, count, onBack }) {
  return (
    <div style={{
      display:       'flex',
      alignItems:    'center',
      gap:           12,
      marginBottom:  22,
      paddingBottom: 14,
      borderBottom:  '1px solid var(--theme-border)',
    }}>
      <button
        onClick={onBack}
        style={{
          background:    'transparent',
          border:        '1px solid var(--theme-border)',
          borderRadius:  99,
          padding:       '4px 12px',
          cursor:        'pointer',
          fontFamily:    'VT323, monospace',
          fontSize:      12,
          letterSpacing: '1.5px',
          color:         'var(--theme-text-sec)',
          flexShrink:    0,
          transition:    'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--theme-accent)'; e.currentTarget.style.color = 'var(--theme-text-pri)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--theme-border)'; e.currentTarget.style.color = 'var(--theme-text-sec)'; }}
      >
        ← ALL
      </button>
      <span style={{
        fontFamily:    'Barlow, sans-serif',
        fontSize:      20,
        fontWeight:    900,
        color:         'var(--theme-text-pri)',
        letterSpacing: '-0.5px',
        flex:          1,
        overflow:      'hidden',
        textOverflow:  'ellipsis',
        whiteSpace:    'nowrap',
      }}>
        {title}
      </span>
      <span style={{
        fontFamily:    'VT323, monospace',
        fontSize:      11,
        color:         'var(--theme-text-ter)',
        letterSpacing: '1.5px',
        flexShrink:    0,
      }}>
        {count} {count === 1 ? 'RECORD' : 'RECORDS'}
      </span>
    </div>
  );
}

export function TileGrid({ children, minTile = 150 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minTile}px, 1fr))`, gap: '10px' }}>
      {children}
    </div>
  );
}

// Wrapping row of pill chips — for the artist/genre/label NAME listings
// specifically (BrowseTile below), matching the site's existing pill
// language (Strip.jsx's nav tabs, Feed.jsx's PostCard genre tags: filled
// theme-dark3, fully rounded, theme-accent on hover/active). A flex-wrap of
// variable-width pills reads better for a list of names than a fixed-column
// grid — a name like "Four Tet" and one like "The Alan Parsons Project"
// don't want to be forced into the same-width cell.
export function PillList({ children }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px' }}>
      {children}
    </div>
  );
}

export function BrowseTile({ label, count, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display:       'inline-flex',
        alignItems:    'baseline',
        gap:           '8px',
        background:    'var(--theme-dark3)',
        border:        '1px solid var(--theme-border)',
        borderRadius:  999,
        padding:       '11px 19px',
        cursor:        'pointer',
        color:         'var(--theme-text-pri)',
        transition:    'background 0.15s, border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--theme-accent)'; e.currentTarget.style.borderColor = 'var(--theme-accent)'; e.currentTarget.style.color = '#fff'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--theme-dark3)'; e.currentTarget.style.borderColor = 'var(--theme-border)'; e.currentTarget.style.color = 'var(--theme-text-pri)'; }}
    >
      <span style={{ fontFamily: 'VT323, monospace', fontSize: 13, letterSpacing: '2px', textTransform: 'lowercase', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ fontFamily: 'VT323, monospace', fontSize: 10, letterSpacing: '2px', opacity: 0.65 }}>
        {count}
      </span>
    </button>
  );
}

export function RecordThumbGrid({ posts }) {
  return (
    <TileGrid minTile={140}>
      {posts.map(p => (
        <div key={p.id} style={{
          background:   'var(--theme-dark3)',
          borderRadius: 8,
          overflow:     'hidden',
          border:       '1px solid var(--theme-border)',
          boxShadow:    '0 4px 14px rgba(0,0,0,0.2)',
        }}>
          {p.cover_image || p.thumb_image
            ? <img src={p.cover_image || p.thumb_image} alt={p.title} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
            : <div style={{ width: '100%', aspectRatio: '1', background: 'var(--theme-dark2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--theme-text-ter)' }}>◈</div>
          }
          <div style={{ padding: 8 }}>
            <div style={{
              fontFamily:    'Barlow, sans-serif',
              fontSize:      11,
              fontWeight:    700,
              color:         'var(--theme-text-pri)',
              marginBottom:  2,
              overflow:      'hidden',
              textOverflow:  'ellipsis',
              whiteSpace:    'nowrap',
            }}>
              {p.title}
            </div>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: 10, color: 'var(--theme-text-ter)' }}>{p.year || '—'}</div>
          </div>
        </div>
      ))}
    </TileGrid>
  );
}

export function BrowseLoading({ label = 'LOADING…' }) {
  return (
    <div style={{ padding: '32px 20px', fontFamily: 'VT323, monospace', fontSize: 13, letterSpacing: '2px', color: 'var(--theme-text-ter)' }} className="blink">
      {label}
    </div>
  );
}

export function BrowseEmpty({ label }) {
  return (
    <div style={{ padding: '32px 20px', fontFamily: 'VT323, monospace', fontSize: 13, letterSpacing: '2px', color: 'var(--theme-text-ter)' }}>
      {label}
    </div>
  );
}
