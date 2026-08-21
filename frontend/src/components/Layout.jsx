import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Strip from './Strip';
import Preloader from './Preloader';
import ContentPanel from './ContentPanel';
import OrangePlayer from './OrangePlayer';
import { LayoutProvider } from '../context/LayoutProvider';

function LayoutInner() {
  const [view, setView] = useState('feed'); // feed | readme | about

  function navigate(v) {
    setView(v);
  }

  // Expose on window for strip access
  window.lnvNavigate = navigate;
  window.lnvSelectFeed = () => navigate('feed');

  return (
    <>
      <Preloader />
      <div id="scroll-outer">
        <div id="scroll-inner">
          <Strip activeView={view} />

          {/* Feed zone — width assumes the nav strip's COLLAPSED (108px,
              Strip.jsx's RAIL_WIDTH) baseline. Strip.jsx (round 17) is now
              one merged element that collapses from 530px down to 108px —
              at rest it overlaps the feed's left edge (clipped by
              #scroll-inner's overflow:hidden) rather than the feed
              reflowing around a live width; FeedIntro (Feed.jsx) exists
              specifically to absorb that overlap at scroll position 0. */}
          <div style={{ width: 'calc(100vw - 108px)', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, background: 'var(--theme-bg)', transition: 'background 0.8s' }}>
            <Outlet context={{ view, navigate }} />
          </div>

          <ContentPanel />
        </div>
        <div id="scroll-spacer" />
      </div>
      <OrangePlayer />
    </>
  );
}

export default function Layout() {
  return (
    <LayoutProvider>
      <LayoutInner />
    </LayoutProvider>
  );
}
