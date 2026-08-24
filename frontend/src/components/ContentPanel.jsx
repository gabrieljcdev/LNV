import { useEffect } from 'react';
import { useLayout } from '../context/LayoutContext';
import { RAIL_WIDTH } from './Strip';
import Artists from '../pages/Artists';
import Genres from '../pages/Genres';
import Labels from '../pages/Labels';
import Logs from '../pages/Logs';

const TITLES = {
  artists: 'Artists',
  genres:  'Genres',
  labels:  'Labels',
  logs:    'Activity Stream',
  files:   'Files',
};

// Narrow panels — lists, single-column content
const NARROW = new Set(['artists', 'genres', 'labels', 'logs', 'files']);
// Wide panels — grids, multi-column content (none left after crates/walls removal)
const WIDE   = new Set([]);

const COMPONENTS = {
  artists: (props) => <Artists {...props} />,
  genres:  (props) => <Genres {...props} />,
  labels:  (props) => <Labels {...props} />,
  logs:    (props) => <Logs {...props} />,
  files:   (props) => <FilesPage {...props} />,
};

function FilesPage() {
  const files = [
    { key: 'readme',  lines: ['WELCOME TO LATE NIGHT VIBES', '────────────────────────────────', 'A blog for serious music lovers.', 'Dig deep. Post what you\'re playing.', '', '> Browse the feed', '> Post a record', '> Discover what others are digging', '> Click ▶ for a random track'] },
    { key: 'about',   lines: ['ABOUT LATE NIGHT VIBES', '────────────────────────────────', 'A sophisticated music community', 'for serious collectors.', '', 'Built with React, Node.js,', 'Discogs API and YouTube API.', '', 'EST. 2024'] },
    { key: 'donate',  lines: ['DONATE', '────────────────────────────────', 'LNV is free and always will be.', 'If you enjoy it, consider', 'supporting the project.', '', '> hello@latenightvibes.com'] },
    { key: 'contact', lines: ['CONTACT', '────────────────────────────────', '> hello@latenightvibes.com', '> @latenightvibes', '', 'WE DIG DEEP'] },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '24px' }}>
      {files.map(f => (
        <div key={f.key} style={{ flex: '1 1 260px', background: 'var(--theme-dark3)', borderRadius: '8px', padding: '20px', border: '1px solid var(--theme-border)' }}>
          {f.lines.map((line, i) => (
            <div key={i} style={{ fontFamily: 'VT323, monospace', fontSize: '13px', lineHeight: '1.8', height: line === '' ? '8px' : undefined, color: line.startsWith('─') ? 'var(--theme-border)' : line.startsWith('>') ? 'var(--theme-text-sec)' : 'var(--theme-text-pri)' }}>
              {line || ' '}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function ContentPanel() {
  const { d3Content, d3Props, d3Width, closeD3 } = useLayout();

  const isOpen    = !!d3Content;
  const title     = TITLES[d3Content] || '';
  const Component = COMPONENTS[d3Content];

  // Panel width. `d3Width` is a content-reported px value (see
  // BrowseGrid.jsx's useReportPanelWidth, used by the artist/genre/label
  // pages) — when present the panel scales to fit what's actually inside
  // it. Falls back to the old static density-based guess for content types
  // that don't report a width (Logs, Files) or while a reported width
  // hasn't landed yet (briefly, on open, before the first render).
  const panelWidth = d3Width
    ? `${d3Width}px`
    : WIDE.has(d3Content)
    ? 'min(90vw, 900px)'
    : NARROW.has(d3Content)
    ? 'min(75vw, 480px)'
    : 'min(80vw, 680px)';

  // Anchored flush to the strip's fully-collapsed width (Strip.jsx's
  // RAIL_WIDTH, 108px) — not a separate "drawer" width. Round 17 merged the
  // old two-piece strip (icon rail + a persistent secondary drawer) into
  // one element (see Strip.jsx's round-17/18 comments); there's no longer a
  // standing 260px drawer to add on top of the rail. The panel-opening tabs
  // (#lnv-tabs) only fade in/become clickable over the last 20% of the
  // strip's collapse anyway (LayoutProvider's tabsOpacity), so by the time
  // this panel can actually be opened the strip is already at, or almost
  // at, RAIL_WIDTH — anchoring here is what makes the panel read as flush
  // against the rail instead of leaving a stale gap where the old drawer
  // used to be.
  const LEFT_OFFSET = RAIL_WIDTH;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeD3(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeD3]);

  return (
    <>
      {/* Backdrop — dims the feed and catches outside clicks to close.
          `id="lnv-drawer-backdrop"` is what LayoutProvider's global wheel
          handler checks for so hovering it (or the panel below) doesn't
          scroll the main feed while the drawer's open. */}
      {isOpen && (
        <div
          id="lnv-drawer-backdrop"
          onClick={closeD3}
          style={{
            position:   'fixed',
            inset:      0,
            zIndex:     39,
            background: 'rgba(0,0,0,0.35)',
            transition: 'opacity 0.3s',
          }}
        />
      )}

      {/* Panel — anchored flush to the collapsed rail's right edge.
          `id="lnv-drawer"` matches: (1) index.css's existing
          `overscroll-behavior: contain` rule, which was already written
          for this id but had never actually been applied to anything until
          now; (2) LayoutProvider's wheel handler, see above. */}
      <div id="lnv-drawer" style={{
        position:      'fixed',
        top:           0,
        left:          `${LEFT_OFFSET}px`,
        bottom:        0,
        width:         panelWidth,
        background:    'var(--theme-bg)',
        zIndex:        40,
        display:       'flex',
        flexDirection: 'column',
        borderLeft:    '1px solid var(--theme-border)',
        // Slide in from left (off screen when closed, tucked behind the rail)
        transform:     isOpen ? 'translateX(0)' : `translateX(calc(-100% - ${LEFT_OFFSET}px))`,
        transition:    'transform 0.4s cubic-bezier(0.4,0,0.2,1), width 0.35s cubic-bezier(0.4,0,0.2,1), background 0.8s, border-color 0.8s',
        boxShadow:     isOpen ? '4px 0 40px rgba(0,0,0,0.35)' : 'none',
      }}>

        {/* Header */}
        <div style={{
          height:         '48px',
          background:     'var(--theme-dark2)',
          display:        'flex',
          alignItems:     'center',
          padding:        '0 18px',
          justifyContent: 'space-between',
          flexShrink:     0,
          borderBottom:   '1px solid var(--theme-border)',
          transition:     'background 0.8s, border-color 0.8s',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: 'var(--pastel-blue-mid)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'Barlow, sans-serif', fontSize: '16px', fontWeight: 900, color: 'var(--theme-text-pri)', letterSpacing: '-0.5px', textTransform: 'uppercase' }}>
              {title}
            </span>
          </span>
          <button
            onClick={closeD3}
            style={{
              background:    'var(--theme-dark3)',
              border:        '1px solid var(--theme-border)',
              cursor:        'pointer',
              color:         'var(--theme-text-sec)',
              width:         '28px',
              height:        '28px',
              borderRadius:  '50%',
              fontSize:      '15px',
              display:       'flex',
              alignItems:    'center',
              justifyContent: 'center',
              transition:    'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--theme-accent)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--theme-dark3)'; e.currentTarget.style.color = 'var(--theme-text-sec)'; }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isOpen && Component && <Component {...d3Props} />}
        </div>

      </div>
    </>
  );
}
