import { useState, useRef, useCallback, useEffect } from 'react';
import { LayoutContext } from './LayoutContext';
import { applyPalette, getAutoIndex } from '../services/themeService';

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
 const brandRef = useRef(null);
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
   // Highlight once the damped scroll (DAMPING=12, settles in ~150-200ms
   // per scroll-distance step, capped well under a second here) has landed.
   setTimeout(() => {
     postEl.style.transition = 'box-shadow 0.15s';
     postEl.style.boxShadow = '0 0 0 3px #e85d04';
     setTimeout(() => { postEl.style.boxShadow = ''; }, 600);
   }, 500);
   // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [driveFeedScroll]);

 // Scroll-driven strip chrome: as the user scrolls into the feed, the
 // strip narrows from 320px (room for the tab labels + brand wordmark) down
 // to a 108px icon rail, the tab row fades in past the halfway point, and
 // the brand wordmark fades out. stripRef/brandRef are attached to the
 // corresponding elements in Strip.jsx.
 const handleFeedScroll = useCallback((scrollX) => {
   const feed = feedRef.current;
   const maxScroll = feed
     ? Math.max(1, (feed.scrollWidth - feed.clientWidth) * 0.4)
     : 2000; // fixed range when no feed — onOuterScroll passes progress * 5000 * 0.4 = progress * 2000
   const raw = Math.min(scrollX / maxScroll, 1);
   const eased = raw < 0.5 ? 2*raw*raw : -1+(4-2*raw)*raw;
   const safeEased = isNaN(eased) ? 0 : eased;
   const newD1Width = 320 - (320 - 108) * safeEased;
   const newBrandOp = Math.max(0.15, 1 - safeEased * 2);
   if (stripRef.current) stripRef.current.style.width = `${newD1Width}px`;
   if (brandRef.current) brandRef.current.style.opacity = `${newBrandOp}`;
   const pillsEl = stripRef.current?.querySelector('#lnv-tabs');
   if (pillsEl) {
     const pillOp = Math.max(0, Math.min(1, (newD1Width - 180) / (320 - 180)));
     pillsEl.style.opacity = `${pillOp}`;
     pillsEl.style.pointerEvents = pillOp > 0.2 ? 'all' : 'none';
   }
 }, []);

 // Init strip width and wire outer scroll → layout animation
 useEffect(() => {
   if (stripRef.current) stripRef.current.style.width = '320px';
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

   // ── Smooth scroll ticker ──────────────────────────────────────────────
   // Native wheel/trackpad/touch input drives #scroll-outer's real scrollTop
   // (no custom wheel handler — let the browser's own momentum happen). Every
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
   const DAMPING = 12; // higher = snappier / less glide, lower = floatier. ~12 settles in ~150-200ms.

   function tick(now) {
     const dt = Math.min(0.1, (now - lastTime) / 1000); // clamp so a tab-switch pause can't cause a huge jump
     lastTime = now;
     const so = document.getElementById('scroll-outer');
     if (so) {
       const target = so.scrollTop * PX_PER_SCROLL;
       const factor = Math.min(1, DAMPING * dt);
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
     if (raf) cancelAnimationFrame(raf);
   };
 }, [handleFeedScroll]);

 return (
   <LayoutContext.Provider value={{
     stripRef, brandRef,
     d3Content, d3Props, openD3, closeD3,
     currentTrack, setCurrentTrack,
     feedRef, postRefs, registerPostRef, scrollToPost, handleFeedScroll, driveFeedScroll,
   }}>
     {children}
   </LayoutContext.Provider>
 );
}
