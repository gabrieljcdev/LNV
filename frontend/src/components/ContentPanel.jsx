import { useEffect } from 'react';
import { useLayout } from '../context/LayoutContext';
import HDD from '../pages/HDD';
import FDD from '../pages/FDD';
import CratePage from '../pages/CratePage';
import Artists from '../pages/Artists';
import Genres from '../pages/Genres';
import Labels from '../pages/Labels';
import Profile from '../pages/Profile';
import CollectionLogs from '../pages/CollectionLogs';

const TITLES = {
  hdd:     'My Collection',
  fdd:     'Community Crates',
  crate:   'Crate',
  artists: 'Artists',
  genres:  'Genres',
  labels:  'Labels',
  profile: 'Profile',
  logs:    'Activity Logs',
  files:   'Files',
};

// Narrow panels — lists, single-column content
const NARROW = new Set(['artists', 'genres', 'labels', 'logs', 'profile', 'files']);
// Wide panels — grids, multi-column content
const WIDE   = new Set(['hdd', 'fdd', 'crate']);

const COMPONENTS = {
  hdd:     (props) => <HDD {...props} />,
  fdd:     (props) => <FDD {...props} />,
  crate:   (props) => <CratePage crateId={props.id} {...props} />,
  artists: (props) => <Artists {...props} />,
  genres:  (props) => <Genres {...props} />,
  labels:  (props) => <Labels {...props} />,
  profile: (props) => <Profile username={props.username} {...props} />,
  logs:    (props) => <CollectionLogs {...props} />,
  files:   (props) => <FilesPage {...props} />,
};

function FilesPage() {
  const files = [
    { key: 'readme',  lines: ['WELCOME TO LATE NIGHT VIBES', '────────────────────────────────', 'A community for serious music lovers.', 'Dig deep. Share your crate.', '', '> Browse the feed', '> Save records to your collection', '> Discover what others are digging', '> Click ▶ for a random track'] },
    { key: 'about',   lines: ['ABOUT LATE NIGHT VIBES', '────────────────────────────────', 'A sophisticated music community', 'for serious collectors.', '', 'Built with React, Node.js,', 'Discogs API and YouTube API.', '', 'EST. 2024'] },
    { key: 'donate',  lines: ['DONATE', '────────────────────────────────', 'LNV is free and always will be.', 'If you enjoy it, consider', 'supporting the project.', '', '> hello@latenightvibes.com'] },
    { key: 'contact', lines: ['CONTACT', '────────────────────────────────', '> hello@latenightvibes.com', '> @latenightvibes', '', 'WE DIG DEEP'] },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '24px' }}>
      {files.map(f => (
        <div key={f.key} style={{ flex: '1 1 260px', background: 'var(--theme-dark3)', borderRadius: '8px', padding: '20px', border: '1px solid var(--theme-border)' }}>
          {f.lines.map((line, i) => (
            <div key={i} style={{ fontFamily: 'VT323, monospace', fontSize: '13px', lineHeight: '1.8', height: line === '' ? '8px' : undefined, color: line.startsWith('─') ? 'rgba(0,0,0,0.15)' : line.startsWith('>') ? 'var(--grey-text)' : 'var(--charcoal)' }}>
              {line || '\u00A0'}
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
  const title     = TITLES[d3Content] || '';
  const Component = COMPONENTS[d3Content];

  // Panel width based on content density
  const panelWidth = WIDE.has(d3Content)
    ? 'min(90vw, 900px)'
    : NARROW.has(d3Content)
    ? 'min(75vw, 480px)'
    : 'min(80vw, 680px)';

  // Strip (108px compressed) + Drawer (260px) = 368px
  // Panel sits immediately to the right of the drawer
  const LEFT_OFFSET = 368;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeD3(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeD3]);

  return (
    <>
      {/* Backdrop — clicks outside close the panel */}
      {isOpen && (
        <div
          onClick={closeD3}
          style={{
            position:   'fixed',
            inset:      0,
            zIndex:     39,
            background: 'transparent',
          }}
        />
      )}

      {/* Panel — anchored to right edge of drawer */}
      <div style={{
        position:      'fixed',
        top:           0,
        left:          `${LEFT_OFFSET}px`,
        bottom:        0,
        width:         panelWidth,
        background:    'var(--white)',
        zIndex:        40,
        display:       'flex',
        flexDirection: 'column',
        // Slide in from left (off screen when closed), slide out back behind drawer
        transform:     isOpen ? 'translateX(0)' : `translateX(calc(-100% - ${LEFT_OFFSET}px))`,
        transition:    'transform 0.4s cubic-bezier(0.4,0,0.2,1), width 0.35s cubic-bezier(0.4,0,0.2,1)',
        boxShadow:     isOpen ? '4px 0 40px rgba(0,0,0,0.1)' : 'none',
      }}>

        {/* Header */}
        <div style={{
          height:         '48px',
          background:     'var(--pastel-blue)',
          display:        'flex',
          alignItems:     'center',
          padding:        '0 18px',
          justifyContent: 'space-between',
          flexShrink:     0,
          borderBottom:   '1px solid rgba(0,0,0,0.06)',
        }}>
          <span style={{ fontSize: '16px', fontWeight: 900, color: 'var(--theme-text-pri)', letterSpacing: '-0.5px' }}>
            {title}
          </span>
          <button
            onClick={closeD3}
            style={{ background: 'var(--theme-border)', border: 'none', cursor: 'pointer', color: 'var(--theme-text-pri)', width: '28px', height: '28px', borderRadius: '4px', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
