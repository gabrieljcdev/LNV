import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchDrawers } from '../lib/drawerPrefetch';
import { useLayout } from '../context/LayoutContext';
import { RAIL_WIDTH, STRIP_RADIUS } from './Strip';
import Logs from '../pages/Logs';
import { ArtistsDrawer, LabelsDrawer, GenresDrawer, LiveDrawer, AboutDrawer, DrawerHead, DrawerBody } from './Drawers';
import { AdminDrawer } from './AdminDrawer';
import { WallsDrawer, PlaylistsDrawer } from './CollectionDrawers';
import { usePhone } from '../lib/usePhone';
import { PHONE_NAV_H } from './PhoneNav';
import { CommunityDrawer } from './CommunityDrawer';

// 2026-10-01: artists / labels / genres / live sets / about are the new
// drawers in Drawers.jsx, each with its own header (title, count, filter,
// close). Logs and Files keep their old bodies under the shared header.
const COMPONENTS = {
  artists: (props) => <ArtistsDrawer {...props} />,
  labels:  (props) => <LabelsDrawer {...props} />,
  genres:  (props) => <GenresDrawer {...props} />,
  live:    (props) => <LiveDrawer {...props} />,
  about:   (props) => <AboutDrawer {...props} />,
  // Community boards (alpha, 2026-10-06) — the strip's community tab.
  community: (props) => <CommunityDrawer {...props} />,
  // Admin accounts only (the strip's admin button); every call it makes is
  // checked server-side too.
  admin:   (props) => <AdminDrawer {...props} />,
  // Walls and playlists (2026-10-03): the strip's ♥.
  walls:   (props) => <WallsDrawer {...props} />,
  playlists: (props) => <PlaylistsDrawer {...props} />,
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

// Persistent drawers (gabriel, 2026-10-10): clicking off a drawer no longer throws it away. It stays mounted (hidden),
// so a track playing inside it keeps playing and reopening it puts you back where you were (the artist you had open,
// the filter you typed, the scroll). A drawer you have left is dropped after DRAWER_KEEP_MS (10 minutes), which resets its
// place and stops anything playing in it. The newest DRAWER_KEEP_MAX are kept; opening a drawer with a different name
// ("open Dixon") is its own entry, as it always started fresh.
const DRAWER_KEEP_MS = 10 * 60 * 1000;
const DRAWER_KEEP_MAX = 4;

export default function ContentPanel() {
  const { d3Content, d3Props, closeD3 } = useLayout();
  const isOpen    = !!d3Content;
  const phone = usePhone();
  const qc = useQueryClient();
  const activeKey = d3Content ? d3Content + JSON.stringify(d3Props || {}) : null;
  const [entries, setEntries] = useState([]); // { key, content, props, closed, since }  (`since`: when the timer noticed it closed)

  // When what is open changes, update the kept list in the same render (no flash of an empty panel).
  const [seenKey, setSeenKey] = useState(null);
  if (activeKey !== seenKey) {
    setSeenKey(activeKey);
    let next = entries.map(e => e.key === activeKey ? { ...e, closed: false, since: null } : { ...e, closed: true });
    if (activeKey && !next.some(e => e.key === activeKey)) next = [...next, { key: activeKey, content: d3Content, props: d3Props || {}, closed: false, since: null }];
    setEntries(next.slice(-DRAWER_KEEP_MAX));
  }

  // Warm the drawers' data once the page is idle, and again whenever the pointer reaches the left rail (a no-op while the
  // data is still fresh), so a drawer opens already filled.
  useEffect(() => {
    const idle = window.requestIdleCallback ? window.requestIdleCallback(() => prefetchDrawers(qc)) : setTimeout(() => prefetchDrawers(qc), 1200);
    const warm = () => prefetchDrawers(qc);
    window.addEventListener('pointermove', warm, { once: true });
    return () => { window.removeEventListener('pointermove', warm); if (window.cancelIdleCallback && typeof idle === 'number') window.cancelIdleCallback(idle); else clearTimeout(idle); };
  }, [qc]);

  // The 10-minute reset: a timer notices when a drawer has been closed and drops it once it has been closed that long
  // (it checks every 15 seconds, so the reset lands within 15 seconds of the 10 minutes).
  useEffect(() => {
    const t = setInterval(() => setEntries(prev => {
      const now = Date.now();
      const marked = prev.map(e => (e.closed ? (e.since ? e : { ...e, since: now }) : (e.since ? { ...e, since: null } : e)));
      const next = marked.filter(e => !e.closed || now - e.since < DRAWER_KEEP_MS);
      const changed = next.length !== prev.length || next.some((e, i) => e !== prev[i]);
      return changed ? next : prev;
    }), 15000);
    return () => clearInterval(t);
  }, []);

  const list = entries;
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
          scroll the main feed while the drawer's open.
          Phones: none — the sheet fills the screen, and the nav under it
          stays tappable. */}
      {isOpen && !phone && (
        <div id="lnv-drawer-backdrop" onClick={closeD3}
          style={{ position: 'fixed', inset: 0, zIndex: 39, background: 'rgba(0,0,0,0.30)' }} />
      )}

      {/* Panel — flush to the collapsed rail (RAIL_WIDTH), slides in from
          behind it, rounded on the right like the cards and the strip.
          `id="lnv-drawer"`: index.css's overscroll rule and LayoutProvider's
          wheel handler both look for it. */}
      <div id="lnv-drawer" role="dialog" aria-modal="true" aria-hidden={!isOpen} style={phone ? {
        // Phones (2026-10-05): a full-screen sheet that slides up, stopping
        // above the bottom nav so the nav stays in reach.
        position: 'fixed', top: 0, left: 0, right: 0, bottom: `calc(${PHONE_NAV_H}px + env(safe-area-inset-bottom))`,
        paddingTop: 'env(safe-area-inset-top)', boxSizing: 'border-box',
        background: 'var(--theme-bg)', zIndex: 40,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1), background 0.8s',
        visibility: isOpen ? 'visible' : 'hidden',
      } : {
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
        {/* One entry per drawer kept alive, keyed by what it is (so opening another name starts fresh). The one on show
            fills the panel; the others stay mounted but hidden (visibility, not display: a player inside keeps playing). */}
        {list.map(e => {
          const C = COMPONENTS[e.content];
          if (!C) return null;
          const active = isOpen && e.key === activeKey;
          return (
            <div key={e.key} aria-hidden={!active}
              style={active
                ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
                : { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', visibility: 'hidden', pointerEvents: 'none' }}>
              <C {...e.props} />
            </div>
          );
        })}
      </div>
    </>
  );
}
