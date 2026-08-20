import { useState, useRef, useCallback, useEffect } from 'react';
import { LayoutContext } from './LayoutContext';
import { applyPalette, getAutoIndex } from '../services/themeService';

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

 const scrollToPost = useCallback((postId) => {
   closeD3();
   const feed = feedRef.current;
   const postEl = postRefs.current.get(postId);
   if (!feed || !postEl) return;
   const feedRect = feed.getBoundingClientRect();
   const postRect = postEl.getBoundingClientRect();
   const distance = Math.abs(postRect.left - feedRect.left);
   const duration = Math.min(1200, Math.max(200, (distance / 3000) * 1000));
   const start = feed.scrollLeft;
   const target = feed.scrollLeft + (postRect.left - feedRect.left);
   const startTime = performance.now();
   function ease(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
   function step(now) {
     const p = Math.min((now - startTime) / duration, 1);
     feed.scrollLeft = start + (target - start) * ease(p);
     if (p < 1) { requestAnimationFrame(step); } else {
       postEl.style.transition = 'box-shadow 0.15s';
       postEl.style.boxShadow = '0 0 0 3px #e85d04';
       setTimeout(() => { postEl.style.boxShadow = ''; }, 600);
     }
   }
   requestAnimationFrame(step);
   // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

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
   function updateSpacer() {
     if (window.lnvSpacerLocked) return;
     if (scrollInner && scrollSpacer) scrollSpacer.style.height = (scrollInner.scrollWidth + window.innerHeight) + 'px';
   }
   updateSpacer();
   const resizeObs = new ResizeObserver(updateSpacer);
   if (scrollInner) resizeObs.observe(scrollInner);

   // ── Smooth scroll ticker ──────────────────────────────────────────────
   // Native wheel/trackpad/touch input drives #scroll-outer's real scrollTop
   // (no custom wheel handler — let the browser's own momentum happen). Every
   // animation frame we read that scrollTop as a *target* and damp-lerp a
   // `current` value toward it, then apply `current` to the feed and to
   // handleFeedScroll's layout writes. This is what makes it glide instead of
   // snapping frame-to-frame with raw scroll events — same technique as
   // avantt.displaay.net's ScrollContainer (target = native scroll position,
   // visual position chases it via framerate-independent damping each tick).
   let raf = null;
   let lastTime = performance.now();
   let current = 0;
   const DAMPING = 12; // higher = snappier / less glide, lower = floatier. ~12 settles in ~150-200ms.

   function tick(now) {
     const dt = Math.min(0.1, (now - lastTime) / 1000); // clamp so a tab-switch pause can't cause a huge jump
     lastTime = now;
     const so = document.getElementById('scroll-outer');
     if (so) {
       const maxOuter = so.scrollHeight - so.clientHeight;
       const target = maxOuter > 0 ? so.scrollTop / maxOuter : 0;
       const factor = Math.min(1, DAMPING * dt);
       current += (target - current) * factor;
       if (Math.abs(target - current) < 0.0002) current = target;

       if (feedRef.current) {
         const maxFeed = Math.max(0, feedRef.current.scrollWidth - feedRef.current.clientWidth);
         const scrollX = current * maxFeed;
         feedRef.current.scrollLeft = scrollX;
         handleFeedScroll(scrollX);
       } else {
         // No feed mounted — same fixed-range fallback the old handler used
         handleFeedScroll(current * 5000 * 0.4);
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
     feedRef, postRefs, registerPostRef, scrollToPost, handleFeedScroll,
   }}>
     {children}
   </LayoutContext.Provider>
 );
}
