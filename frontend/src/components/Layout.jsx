import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Strip from './Strip';
import LandingPanel from './LandingPanel';
import ContentPanel from './ContentPanel';
import OrangePlayer from './OrangePlayer';
import { LayoutProvider } from '../context/LayoutProvider';

function LayoutInner() {
  const [view, setView] = useState('collections'); // collections | feed | artists | genres | readme | about

  function navigate(v) {
    setView(v);
    // Collapse landing when navigating away from it
    const outer = document.getElementById('scroll-outer');
    const spacer = document.getElementById('scroll-spacer');
    if (outer && spacer) {
      window.lnvSpacerLocked = true;
      outer.scrollTop = parseFloat(spacer.style.height) * 0.45;
      outer.dispatchEvent(new Event('scroll'));
      setTimeout(() => { window.lnvSpacerLocked = false; }, 100);
    }
  }

  // Expose on window for strip + landing access
  window.lnvNavigate = navigate;
  window.lnvSelectFeed  = () => navigate('feed');
  window.lnvShowCollections = () => navigate('collections');

  return (
    <>
      <div id="scroll-outer">
        <div id="scroll-inner">
          <Strip activeView={view} />
          <LandingPanel />

          {/* Feed zone */}
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
