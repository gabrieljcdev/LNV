import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Strip from './Strip';
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
      <div id="scroll-outer">
        <div id="scroll-inner">
          <Strip activeView={view} />

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
