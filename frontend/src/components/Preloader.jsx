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
// 2026-10-22 (gabriel): (1) the 0–100 counter in the bottom left is gone; (2) scrolling is locked until everything has loaded (lib/launch.js): a
// transparent shield sits over the whole page (z-index 50; the nav strip is still invisible during the reveal, so it is not clickable either) and scroll
// keys are ignored, so wheel, touch, drag and keys cannot move the feed early. The lock is released when the last hold goes, and by a plain timer as well.
//
// (3) A smoother reveal (2026-10-22, "looks a bit janky"). It used to set `style.width` on a masked element every frame from JavaScript: each frame
// re-ran layout and re-rasterised a three-gradient mask on the main thread, the same thread React was busy building the feed on, so it stuttered. Now
// the narrowing is one tall panel moved with `transform` (a Web Animations API animation, which the browser runs on the compositor, off the main
// thread), clipped at the rail's right edge by a wrapper; the rail's two rounded corner pieces are small and static. The panel's right edge sits where the
// old element's did at every moment, so it looks the same, only smoother. It is also slightly slower (2.2 s, was 1.8 s) with an ease-in-out curve (it
// used to start with an abrupt jump). Reduced-motion users get no animation.
const DURATION_MS = 2200;
const EASING = 'cubic-bezier(0.65, 0, 0.35, 1)'; // ease-in-out: gentle start, long settle
const RAIL_W = 320; // must match Strip.jsx's initial (pre-scroll) width

// 2026-09-30 (gabriel): the rail has rounded right corners (STRIP_RADIUS), so
// the cover reaches STRIP_RADIUS further left, UNDER them, and shows there only in the rail's two corner cut-outs — the corners take the
// cover's own colour (no dark sliver from the strip's green zone behind), in every palette. Its own right corners are rounded too, matching the
// strip's green zone it hands over to.
const R = STRIP_RADIUS;
const CORNER_MASK = {
  image: `radial-gradient(circle ${R}px at 0 ${R}px, transparent ${R}px, #000 ${R + 0.5}px), radial-gradient(circle ${R}px at 0 0, transparent ${R}px, #000 ${R + 0.5}px)`,
  size: `${R}px ${R}px, ${R}px ${R}px`,
  position: 'left top, left bottom',
};

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

export default function Preloader({ onDone }) {
  const [fading, setFading] = useState(false);
  const locked = useLaunchLocked(); // lib/launch.js: held until the animation, the fonts and the feed (its first page and every card) are all in
  const [mounted, setMounted] = useState(true);
  const panelRef = useRef(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    const full = Math.max(0, window.innerWidth - RAIL_W);
    const rest = Math.max(0, full - SECONDARY_STRIP_WIDTH); // how far the panel's right edge travels
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let finishTimer = null;
    const anim = panel.animate(
      [{ transform: 'translateX(0px)' }, { transform: `translateX(${-rest}px)` }],
      { duration: reduce ? 1 : DURATION_MS, easing: EASING, fill: 'forwards' },
    );
    anim.finished.then(() => {
      setFading(true);
      finishTimer = setTimeout(() => {
        releaseLaunch('animation');
        setMounted(false);
        onDone?.();
      }, 220);
    }).catch(() => { /* cancelled on unmount */ });
    return () => { anim.cancel(); clearTimeout(finishTimer); };
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
        // The scroll lock: nothing underneath receives wheel, touch or drag until everything has loaded.
        <div aria-hidden="true" data-launch-lock="" style={{ position: 'fixed', inset: 0, zIndex: 50, touchAction: 'none', overscrollBehavior: 'contain' }}
          onWheel={e => e.preventDefault()} onTouchMove={e => e.preventDefault()} />
      )}
      {mounted && (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 999, pointerEvents: 'none', opacity: fading ? 0 : 1, transition: fading ? 'opacity 0.2s ease' : 'none' }}>
          {/* From the rail's right edge: everything left of it is clipped, so the panel can slide under the rail. */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: RAIL_W, right: 0, overflow: 'hidden' }}>
            <div ref={panelRef} data-launch-panel=""
              style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `max(0px, calc(100vw - ${RAIL_W}px))`, background: 'var(--theme-dark3)', borderTopRightRadius: R, borderBottomRightRadius: R, willChange: 'transform' }} />
          </div>
          {/* The rail's two rounded corners, drawn in the cover's colour: small and still. */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: RAIL_W - R, width: R, background: 'var(--theme-dark3)', maskImage: CORNER_MASK.image, WebkitMaskImage: CORNER_MASK.image, maskSize: CORNER_MASK.size, WebkitMaskSize: CORNER_MASK.size, maskPosition: CORNER_MASK.position, WebkitMaskPosition: CORNER_MASK.position, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }} />
        </div>
      )}
    </>
  );
}
