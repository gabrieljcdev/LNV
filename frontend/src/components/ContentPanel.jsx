import { useEffect } from 'react';
import { useLayout } from '../context/LayoutContext';
import { RAIL_WIDTH, STRIP_RADIUS } from './Strip';
import Logs from '../pages/Logs';
import { ArtistsDrawer, LabelsDrawer, GenresDrawer, LiveDrawer, AboutDrawer, DrawerHead, DrawerBody } from './Drawers';

// 2026-10-01: artists / labels / genres / live sets / about are the new
// drawers in Drawers.jsx, each with its own header (title, count, filter,
// close). Logs and Files keep their old bodies under the shared header.
const COMPONENTS = {
  artists: (props) => <ArtistsDrawer {...props} />,
  labels:  (props) => <LabelsDrawer {...props} />,
  genres:  (props) => <GenresDrawer {...props} />,
  live:    (props) => <LiveDrawer {...props} />,
  about:   (props) => <AboutDrawer {...props} />,
  logs:    (props) => <><DrawerHead title="Activity" count="" /><DrawerBody><Logs {...props} /></DrawerBody></>,
  files:   (props) => <><DrawerHead title="Files" count="" /><DrawerBody><FilesPage {...props} /></DrawerBody></>,
};

// One width for every drawer: 640px, or what's left of the screen beside
// the rail (gabriel, 2026-10-01: wider than the old 480).
const PANEL_WIDTH = `min(640px, calc(100vw - ${RAIL_WIDTH}px))`;

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
  const { d3Content, d3Props, closeD3 } = useLayout();
  const isOpen    = !!d3Content;
  const Component = COMPONENTS[d3Content];

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
        <div id="lnv-drawer-backdrop" onClick={closeD3}
          style={{ position: 'fixed', inset: 0, zIndex: 39, background: 'rgba(0,0,0,0.30)' }} />
      )}

      {/* Panel — flush to the collapsed rail (RAIL_WIDTH), slides in from
          behind it, rounded on the right like the cards and the strip.
          `id="lnv-drawer"`: index.css's overscroll rule and LayoutProvider's
          wheel handler both look for it. */}
      <div id="lnv-drawer" role="dialog" aria-modal="true" aria-hidden={!isOpen} style={{
        // Starts STRIP_RADIUS under the rail, so the rail's rounded corners
        // show the drawer behind them instead of the dimmed feed (gabriel,
        // 2026-10-01); paddingLeft keeps the content where it was.
        position: 'fixed', top: 0, left: `${RAIL_WIDTH - STRIP_RADIUS}px`, bottom: 0, width: `calc(${PANEL_WIDTH} + ${STRIP_RADIUS}px)`, paddingLeft: STRIP_RADIUS, boxSizing: 'border-box',
        background: 'var(--theme-bg)', zIndex: 40,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderTopRightRadius: STRIP_RADIUS, borderBottomRightRadius: STRIP_RADIUS,
        transform: isOpen ? 'translateX(0)' : `translateX(calc(-100% - ${RAIL_WIDTH}px))`,
        transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1), background 0.8s',
        boxShadow: isOpen ? '4px 0 40px rgba(0,0,0,0.30)' : 'none',
        visibility: isOpen ? 'visible' : 'hidden',
      }}>
        {/* Keyed by what's open, so opening another name starts fresh
            (filter cleared, the right detail shown). */}
        {isOpen && Component && <Component key={d3Content + JSON.stringify(d3Props || {})} {...d3Props} />}
      </div>
    </>
  );
}
