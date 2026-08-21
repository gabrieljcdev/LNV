import { useEffect, useRef, useState } from 'react';
import { SECONDARY_STRIP_WIDTH } from './Strip'; // round 17: moved from SecondaryStrip.jsx (deprecated) to Strip.jsx (merged strip)

// One-time load reveal, modeled on avantt.displaay.net's own preloader
// (reverse-engineered from their production JS bundle — see
// claude/avantt-scroll-analysis.md and the 2026-08-21 handover for how). On
// the real site, the rail shows a rotated numeral counter climbing 0→100
// while a placeholder column next to it visibly narrows from covering
// most of the viewport down to its final resting width, revealing the real
// (dark) content growing in from the right as it shrinks.
//
// LNV's rail and secondary strip are cheap to render immediately and
// correctly (unlike avantt's many content sections, there's nothing here
// that needs to "resolve" its real width) — so rather than reflowing the
// real grid during the reveal, this renders a fixed overlay that mimics the
// same shrink, then fades out once it has narrowed to the secondary strip's
// exact width/position, at which point the swap to the real strip
// underneath is seamless.
//
// Runs once per hard load — mounted by Layout, never remounted by in-app
// route changes. Purely time-based (not gated on real asset/data loading),
// so a slow network can never leave it stuck open.
const DURATION_MS = 1800; // the one duration constant recovered from avantt's
                           // own bundle (a Tween.js reveal used elsewhere in
                           // their code, for an SVG stroke-draw animation) —
                           // reused here for the overall reveal length since
                           // no separate preloader-specific timing constant
                           // was recoverable from their minified source.
const RAIL_W = 320; // must match Strip.jsx's initial (pre-scroll) width

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function Preloader({ onDone }) {
  const [progress, setProgress] = useState(0); // 0..100, for display only
  const [fading, setFading] = useState(false);
  const [mounted, setMounted] = useState(true);
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const coverRef = useRef(null);

  useEffect(() => {
    function tick(now) {
      if (startRef.current === null) startRef.current = now;
      const t = Math.min(1, (now - startRef.current) / DURATION_MS);
      const eased = easeOutCubic(t);
      setProgress(Math.round(eased * 100));
      if (coverRef.current) {
        const full = Math.max(0, window.innerWidth - RAIL_W);
        const rest = Math.max(0, full - SECONDARY_STRIP_WIDTH);
        coverRef.current.style.width = `${full - rest * eased}px`;
      }
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setFading(true);
        setTimeout(() => {
          setMounted(false);
          onDone?.();
        }, 220);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  return (
    <>
      <div
        ref={coverRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: RAIL_W,
          bottom: 0,
          background: 'var(--theme-dark3)',
          zIndex: 999,
          opacity: fading ? 0 : 1,
          transition: fading ? 'opacity 0.2s ease' : 'none',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '24px',
          bottom: '24px',
          zIndex: 1000,
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontFamily: 'VT323, monospace',
          fontSize: '64px',
          lineHeight: 1,
          color: 'var(--orange)',
          opacity: fading ? 0 : 1,
          transition: fading ? 'opacity 0.2s ease' : 'none',
          pointerEvents: 'none',
        }}
      >
        {String(progress).padStart(2, '0')}
      </div>
    </>
  );
}
