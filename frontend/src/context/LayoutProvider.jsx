import { useState, useRef, useCallback, useEffect } from 'react';
import { LayoutContext } from './LayoutContext';
import { applyPalette, getAutoIndex } from '../services/themeService';
import { RAIL_WIDTH, RAIL_OPEN_WIDTH, STRIP_OPEN_WIDTH } from '../components/Strip';

// Horizontal feed px moved per vertical wheel/trackpad px that #scroll-outer
// receives. #scroll-outer's scrollTop is the SINGLE source of truth for feed
// position — the RAF ticker below reads it every frame and writes the
// (damped) result to feedRef.scrollLeft. Anything that wants to move the
// feed (drag-to-scroll, scrollToPost) must go through scrollTop too, via
// driveFeedScroll — writing feedRef.scrollLeft directly gets silently
// undone on the very next animation frame by the ticker.
const PX_PER_SCROLL = 1.5;

export function LayoutProvider({ children }) {
 const [d3Content, setD3Content] = useState(null);
 const [d3Props, setD3Props] = useState({});
 const [currentTrack, setCurrentTrack] = useState(null);

 const feedRef = useRef(null);
 const stripRef = useRef(null);
 const railZoneRef = useRef(null);
 const secondaryStripRef = useRef(null);
 const secondaryWordmarkRef = useRef(null);
 const postRefs = useRef(new Map());

 function openD3(content, props = {}) { setD3Content(content); setD3Props(props); }
 function closeD3() { setD3Content(null); setD3Props({}); }
 function registerPostRef(postId, ref) { postRefs.current.set(postId, ref); }

 // Move the feed to an absolute horizontal pixel position by driving
 // #scroll-outer's scrollTop (see PX_PER_SCROLL comment above) — the RAF
 // ticker then glides feedRef.scrollLeft toward it with its own damping, so
 // callers don't need their own animation loop.
 const driveFeedScroll = useCallback((scrollX) => {
   const so = document.getElementById('scroll-outer');
   if (!so) return;
   const maxOuter = Math.max(0, so.scrollHeight - so.clientHeight);
   so.scrollTop = Math.max(0, Math.min(scrollX / PX_PER_SCROLL, maxOuter));
 }, []);

 const scrollToPost = useCallback((postId) => {
   closeD3();
   const feed = feedRef.current;
   const postEl = postRefs.current.get(postId);
   if (!feed || !postEl) return;
   const feedRect = feed.getBoundingClientRect();
   const postRect = postEl.getBoundingClientRect();
   const maxFeed = Math.max(0, feed.scrollWidth - feed.clientWidth);
   const target = Math.max(0, Math.min(feed.scrollLeft + (postRect.left - feedRect.left), maxFeed));
   driveFeedScroll(target);
   // Highlight once the damped scroll (DAMPING=15, settles in ~150-200ms
   // per scroll-distance step, capped well under a second here) has landed.
   setTimeout(() => {
     postEl.style.transition = 'box-shadow 0.15s';
     postEl.style.boxShadow = '0 0 0 3px #e85d04';
     setTimeout(() => { postEl.style.boxShadow = ''; }, 600);
   }, 500);
   // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [driveFeedScroll]);

 // ── ROUND 17 (2026-08-21) — merged strip, single collapse curve ────────
 // Rounds 9-16 tried to make TWO separately-animated elements (the icon
 // rail + a "secondary" brand strip) collapse at different, carefully-
 // tuned rates and still read as visually synchronized — never worked
 // reliably; round 15's change should have been mathematically
 // unmistakable and gabriel reported no perceptible difference at all,
 // which was the signal the two-element approach itself was the problem.
 //
 // Gabriel's fix: Strip.jsx is now ONE element with two color zones
 // (`stripRef` = the whole box, `secondaryStripRef` = the inner "secondary
 // color" zone past the permanent RAIL_WIDTH floor — see Strip.jsx's own
 // round-17 comment for the visual side). Both widths, plus the wordmark's
 // opacity, are now driven by the SAME `raw` value below — there is only
 // one number, so the two zones cannot desync the way two independently-
 // ranged values could. This also restores the original rounds-2-10
 // behavior (both zones moving at an identical rate) rather than round
 // 11's decoupled-rate theory, which five rounds of attempts never
 // actually validated as feeling better — worth actually testing the
 // simpler synchronized version live before assuming decoupling was ever
 // the right idea.
 //
 // `COLLAPSE_RANGE = 1400` is unchanged from round 10 (confirmed good for
 // the rail across many rounds). The one safety net kept from rounds 12-13
 // — `effectiveRange` never exceeds 95% of the actual room available
 // before post #1 arrives (`introWidth`, tied to FeedIntro's own width in
 // Feed.jsx) — costs nothing on wide screens (where 1400 already fits) and
 // prevents any residual color-zone sliver from poking into post #1's card
 // on narrow ones, without needing FeedIntro widened at all anymore
 // (reverted back to 100% of the viewport — round 14/15's `
 // INTRO_WIDTH_MULTIPLIER` hack for buying the secondary strip extra room
 // is no longer needed now that there's nothing to give extra room TO).
 //
 // ROUND 18 (2026-08-21): gabriel wanted zone 1 (the rail's own color)
 // back to visibly starting larger and collapsing, matching how the rail
 // always looked before round 17 — round 17's first cut pinned it at a
 // permanent RAIL_WIDTH floor from the very start, which lost that. Now
 // `railZoneWidth` uses the exact pre-round-17 rail formula (320 → 108),
 // and zone 2's position is derived from THAT SAME number (its `left`),
 // not computed independently — still just one shared value driving every
 // visual effect, the whole point of round 17, just with a third thing
 // (zone 1's own width) now also tracking it instead of being fixed.
 const COLLAPSE_RANGE = 1400;
 const handleFeedScroll = useCallback((scrollX) => {
   const introWidth = Math.max(600, window.innerWidth - RAIL_WIDTH); // matches FeedIntro's actual rendered width (Feed.jsx, back to 100%)
   const effectiveRange = Math.min(COLLAPSE_RANGE, introWidth * 0.95);
   const raw = Math.max(0, Math.min(scrollX / effectiveRange, 1));
   const outerWidth = STRIP_OPEN_WIDTH - (STRIP_OPEN_WIDTH - RAIL_WIDTH) * raw; // 530 → 108
   if (stripRef.current) stripRef.current.style.width = `${outerWidth}px`;
   const railZoneWidth = RAIL_OPEN_WIDTH - (RAIL_OPEN_WIDTH - RAIL_WIDTH) * raw; // 320 → 108, same formula as the pre-round-17 rail
   if (railZoneRef.current) railZoneRef.current.style.width = `${railZoneWidth}px`;
   if (secondaryStripRef.current) secondaryStripRef.current.style.left = `${railZoneWidth}px`; // zone 2 always starts exactly where zone 1 ends
   if (secondaryWordmarkRef.current) secondaryWordmarkRef.current.style.opacity = `${Math.max(0, 1 - raw * 2)}`;
   // Kept from round 16's diagnostic instinct — cheap, no behavior change,
   // useful if another round of live numbers is ever needed again.
   window.lnvDebugStrip = { windowInnerWidth: window.innerWidth, introWidth, effectiveRange, scrollX, raw, outerWidth, railZoneWidth };
 }, []);

 // Init strip width and wire outer scroll → layout animation
 useEffect(() => {
   if (stripRef.current) stripRef.current.style.width = `${STRIP_OPEN_WIDTH}px`;
   if (railZoneRef.current) railZoneRef.current.style.width = `${RAIL_OPEN_WIDTH}px`;
   if (secondaryStripRef.current) secondaryStripRef.current.style.left = `${RAIL_OPEN_WIDTH}px`;
   // Apply correct time-based theme on mount
   applyPalette(getAutoIndex());
   const themeInterval = setInterval(() => applyPalette(getAutoIndex()), 60000);
   // (cleanup returned below)
   // Expose for direct calls from non-React code
   window.lnvHandleFeedScroll = handleFeedScroll;
   const scrollSpacer = document.getElementById('scroll-spacer');
   const scrollInner = document.getElementById('scroll-inner');
   window.lnvSpacerLocked = false;

   function neededSpacerHeight() {
     const baseWidth = scrollInner ? scrollInner.scrollWidth : 0;
     const feed = feedRef.current;
     const maxFeed = feed ? Math.max(0, feed.scrollWidth - feed.clientWidth) : 0;
     // Enough vertical range to reach the end of the feed at PX_PER_SCROLL,
     // plus room for the non-feed layout width and a full viewport of slack.
     return Math.max(baseWidth, maxFeed / PX_PER_SCROLL) + window.innerHeight;
   }
   function updateSpacer() {
     if (window.lnvSpacerLocked) return;
     if (scrollSpacer) scrollSpacer.style.height = neededSpacerHeight() + 'px';
   }
   updateSpacer();
   const resizeObs = new ResizeObserver(updateSpacer);
   if (scrollInner) resizeObs.observe(scrollInner);

   // ── Manual wheel capture ────────────────────────────────────────────
   // Letting the browser translate wheel input into native scrollTop itself
   // (the original approach — just read so.scrollTop each RAF frame) is what
   // avantt's own reverse-engineered tick() does too, but in practice on
   // this page it produced a laggy/chunky feel on wheel input specifically,
   // while drag (which writes so.scrollTop synchronously on every
   // mousemove via driveFeedScroll) felt perfect — both end up going through
   // the exact same damped RAF ticker below, so the only variable left is
   // *how* so.scrollTop gets updated. Chrome doesn't guarantee that native
   // wheel-driven scrolling of a non-document element commits scrollTop to
   // the main thread every frame — it can be coalesced/eased by the
   // compositor at its own cadence, which then gets *re*-damped by our own
   // lerp on top, i.e. double-smoothing. Fix: capture the wheel event
   // ourselves, preventDefault so the browser never gets to touch native
   // scroll at all, and write so.scrollTop synchronously — same direct-write
   // pattern the drag handler already uses and that's already proven smooth.
   const so = document.getElementById('scroll-outer');
   function onWheel(e) {
     e.preventDefault();
     if (!so) return;
     let dy = e.deltaY;
     if (e.deltaMode === 1) dy *= 16;               // line mode → approx px
     else if (e.deltaMode === 2) dy *= window.innerHeight; // page mode → px
     const maxOuter = Math.max(0, so.scrollHeight - so.clientHeight);
     so.scrollTop = Math.max(0, Math.min(so.scrollTop + dy, maxOuter));
   }
   if (so) so.addEventListener('wheel', onWheel, { passive: false });

   // ── Smooth scroll ticker ──────────────────────────────────────────────
   // Every
   // animation frame we read that scrollTop and derive a *pixel* target
   // (scrollTop * PX_PER_SCROLL, clamped to the feed's actual scrollable
   // width) and damp-lerp a `current` value toward it, then apply `current`
   // to the feed and to handleFeedScroll's layout writes. This is what makes
   // it glide instead of snapping frame-to-frame with raw scroll events —
   // same technique as avantt.displaay.net's ScrollContainer (target =
   // native scroll position, visual position chases it via
   // framerate-independent damping each tick).
   let raf = null;
   let lastTime = performance.now();
   let current = 0;
   // Matches avantt.displaay.net's ScrollContainer exactly (reverse-engineered
   // from its production bundle, module 34437's `t7` export — a plain
   // lerp(a,b,t)=a*(1-t)+t*b with t clamped to [0,1]): DAMPING=15 multiplied
   // by real elapsed seconds each frame gives a frame-rate-independent catch-up
   // factor (~0.25/frame at 60fps — quarter of the remaining distance per
   // frame). Avantt also skips damping entirely on touch input (factor=1,
   // i.e. 1:1 with the native touch-scroll position) since touch already has
   // its own OS-level momentum and double-damping it just adds lag — mirrored
   // below via isCoarsePointer.
   const DAMPING = 15;
   const isCoarsePointer = typeof window.matchMedia === 'function'
     && window.matchMedia('(pointer: coarse)').matches;

   function tick(now) {
     const dt = Math.min(0.1, (now - lastTime) / 1000); // clamp so a tab-switch pause can't cause a huge jump
     lastTime = now;
     const so = document.getElementById('scroll-outer');
     if (so) {
       const target = so.scrollTop * PX_PER_SCROLL;
       const factor = isCoarsePointer ? 1 : Math.min(1, DAMPING * dt);
       current += (target - current) * factor;
       if (Math.abs(target - current) < 0.5) current = target;

       if (feedRef.current) {
         const maxFeed = Math.max(0, feedRef.current.scrollWidth - feedRef.current.clientWidth);
         const scrollX = Math.min(current, maxFeed);
         feedRef.current.scrollLeft = scrollX;
         handleFeedScroll(scrollX);
         // Keep the spacer sized to the live feed width so the vertical
         // range always has enough room to reach the end of the content —
         // card widths/counts change (search, new posts) after mount, and
         // the ResizeObserver above can't see scrollWidth-only changes.
         if (scrollSpacer && !window.lnvSpacerLocked) {
           const needed = neededSpacerHeight();
           if (Math.abs(parseFloat(scrollSpacer.style.height) - needed) > 40) {
             scrollSpacer.style.height = needed + 'px';
           }
         }
       } else {
         // No feed mounted — pass the raw pixel target through
         handleFeedScroll(current);
       }
     }
     raf = requestAnimationFrame(tick);
   }
   raf = requestAnimationFrame(tick);

   return () => {
     resizeObs.disconnect();
     if (so) so.removeEventListener('wheel', onWheel);
     if (raf) cancelAnimationFrame(raf);
   };
 }, [handleFeedScroll]);

 return (
   <LayoutContext.Provider value={{
     stripRef, railZoneRef, secondaryStripRef, secondaryWordmarkRef,
     d3Content, d3Props, openD3, closeD3,
     currentTrack, setCurrentTrack,
     feedRef, postRefs, registerPostRef, scrollToPost, handleFeedScroll, driveFeedScroll,
   }}>
     {children}
   </LayoutContext.Provider>
 );
}
