import { useEffect, useRef, useState } from 'react';
import { SECONDARY_STRIP_WIDTH, STRIP_RADIUS } from './Strip';
import { releaseLaunch, useLaunchLocked } from '../lib/launch'; // round 17: moved from SecondaryStrip.jsx (deprecated) to Strip.jsx (merged strip)

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
//
// 2026-10-22 (gabriel): (1) the 0–100 counter in the bottom left is gone — it also re-rendered this component on every frame just to
// change a number; (2) scrolling is locked until the reveal has finished: a transparent shield sits over the whole page (z-index 50; the nav
// strip is still invisible during the reveal, so it is not clickable either) and scroll keys are ignored, so wheel, touch, drag and keys cannot move the feed early. The lock is
// released when the reveal ends, and by a plain timer as well, so a hidden tab (no animation frames) or a slow device can never leave it on.
const DURATION_MS = 1800; // the one duration constant recovered from avantt's
                           // own bundle (a Tween.js reveal used elsewhere in
                           // their code, for an SVG stroke-draw animation) —
                           // reused here for the overall reveal length since
                           // no separate preloader-specific timing constant
                           // was recoverable from their minified source.
const RAIL_W = 320; // must match Strip.jsx's initial (pre-scroll) width

// 2026-09-30 (gabriel): the rail has rounded right corners (STRIP_RADIUS), so
// the cover starts STRIP_RADIUS further left, UNDER them, and is masked to
// show there only in the rail's two corner cut-outs — the corners take the
// cover's own colour (no dark sliver from the strip's green zone behind),
// in every palette. Its own right corners are rounded too, matching the
// strip's green zone it hands over to.
const R = STRIP_RADIUS;
const COVER_MASK = {
  image: `linear-gradient(to right, transparent ${R}px, #000 ${R}px), radial-gradient(circle ${R}px at 0 ${R}px, transparent ${R}px, #000 ${R + 0.5}px), radial-gradient(circle ${R}px at 0 0, transparent ${R}px, #000 ${R + 0.5}px)`,
  size: `100% 100%, ${R}px ${R}px, ${R}px ${R}px`,
  position: 'left top, left top, left bottom',
};

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

export default function Preloader({ onDone }) {
  const [fading, setFading] = useState(false);
  const locked = useLaunchLocked(); // lib/launch.js: held until the animation, the fonts and the feed (its first page and every card) are all in
  const [mounted, setMounted] = useState(true);
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const coverRef = useRef(null);

  useEffect(() => {
    function tick(now) {
      if (startRef.current === null) startRef.current = now;
      const t = Math.min(1, (now - startRef.current) / DURATION_MS);
      const eased = easeOutCubic(t);
      if (coverRef.current) {
        const full = Math.max(0, window.innerWidth - RAIL_W);
        const rest = Math.max(0, full - SECONDARY_STRIP_WIDTH);
        coverRef.current.style.width = `${full - rest * eased + R}px`; // + R: the part under the rail's corners
      }
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setFading(true);
        setTimeout(() => {
          releaseLaunch('animation');
          setMounted(false);
          onDone?.();
        }, 220);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { rafRef.current && cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll keys do nothing while locked (typing in a field still works).
  useEffect(() => {
    if (!locked) return undefined;
    const onKey = e => {
      if (!SCROLL_KEYS.has(e.key)) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [locked]);

  if (!mounted && !locked) return null;

  return (
    <>
      {locked && (
        // The scroll lock: nothing underneath receives wheel, touch or drag until the reveal is over.
        <div aria-hidden="true" data-launch-lock="" style={{ position: 'fixed', inset: 0, zIndex: 50, touchAction: 'none', overscrollBehavior: 'contain' }}
          onWheel={e => e.preventDefault()} onTouchMove={e => e.preventDefault()} />
      )}
      {mounted && <div
        ref={coverRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: RAIL_W - R,
          bottom: 0,
          background: 'var(--theme-dark3)',
          borderTopRightRadius: R,
          borderBottomRightRadius: R,
          maskImage: COVER_MASK.image, WebkitMaskImage: COVER_MASK.image,
          maskSize: COVER_MASK.size, WebkitMaskSize: COVER_MASK.size,
          maskPosition: COVER_MASK.position, WebkitMaskPosition: COVER_MASK.position,
          maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
          zIndex: 999,
          opacity: fading ? 0 : 1,
          transition: fading ? 'opacity 0.2s ease' : 'none',
          pointerEvents: 'none',
        }}
      />}
    </>
  );
}
