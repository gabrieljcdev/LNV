import { useState, useRef, useCallback, useEffect } from 'react';
import { LayoutContext } from './LayoutContext';
import { applyPalette, getAutoIndex } from '../services/themeService';

export function LayoutProvider({ children }) {
 const [activeTab, setActiveTab] = useState('collection');
 const [drawerOpen, setDrawerOpen] = useState(true);
 const [drawerIsLanding, setDrawerIsLanding] = useState(true);
 const [d3Content, setD3Content] = useState(null);
 const [d3Props, setD3Props] = useState({});
 const [currentTrack, setCurrentTrack] = useState(null);
 const [landingPanelOpen, setLandingPanelOpen] = useState(true);

 const feedRef = useRef(null);
 const stripRef = useRef(null);
 const drawerRef = useRef(null);
 const brandRef = useRef(null);
 const landingPanelRef = useRef(null);
 const postRefs = useRef(new Map());
 const drawerOpenRef = useRef(true);

 function openDrawer(tab) {
   if (activeTab === tab && drawerOpen) {
     drawerOpenRef.current = false; setDrawerOpen(false); setActiveTab(null);
     if (typeof window.lnvUnlockLayout === 'function') window.lnvUnlockLayout();
   } else {
     drawerOpenRef.current = true; setDrawerIsLanding(false); setActiveTab(tab); setDrawerOpen(true);
     if (typeof window.lnvLockLayout === 'function') window.lnvLockLayout();
   }
 }
 function closeDrawer() {
   drawerOpenRef.current = false; setDrawerOpen(false); setActiveTab(null);
   if (typeof window.lnvUnlockLayout === 'function') window.lnvUnlockLayout();
 }
 function closeLandingPanel() { setLandingPanelOpen(false); }
 function openD3(content, props = {}) { setD3Content(content); setD3Props(props); }
 function closeD3() { setD3Content(null); setD3Props({}); }
 function registerPostRef(postId, ref) { postRefs.current.set(postId, ref); }

 const scrollToPost = useCallback((postId) => {
   closeDrawer();
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
   const drawerWidth = Math.max(2, Math.round(260 * Math.max(0, Math.min(1, (newD1Width - 108) / (320 - 108)))));
   const landingProgress = Math.min(1, safeEased * 2.5);
   const landingWidth = Math.max(2, Math.round(420 * (1 - landingProgress)));
   if (landingPanelRef.current) {
     landingPanelRef.current.style.width = `${landingWidth}px`;
     landingPanelRef.current.style.minWidth = '0px';
     landingPanelRef.current.style.overflow = 'hidden';
     landingPanelRef.current.style.pointerEvents = landingProgress > 0.9 ? 'none' : 'auto';
     const bg = getComputedStyle(document.documentElement).getPropertyValue('--theme-sidebar').trim();
     if (bg) landingPanelRef.current.style.background = bg;
   }
   if (stripRef.current) stripRef.current.style.width = `${newD1Width}px`;
   if (drawerRef.current) drawerRef.current.style.width = `${drawerWidth}px`;
   if (brandRef.current) brandRef.current.style.opacity = `${newBrandOp}`;
   const pillsEl = stripRef.current?.querySelector('#lnv-tabs');
   if (pillsEl) {
     const pillOp = Math.max(0, Math.min(1, (newD1Width - 180) / (320 - 180)));
     pillsEl.style.opacity = `${pillOp}`;
     pillsEl.style.pointerEvents = pillOp > 0.2 ? 'all' : 'none';
   }
   const scrollProgress = Math.max(0, Math.min(1, (320 - newD1Width) / (320 - 108)));
   const logoEl = drawerRef.current?.querySelector('[data-logo]');
   const hintEl = drawerRef.current?.querySelector('[data-hint]');
   if (logoEl) { logoEl.style.transform = `translateX(${-scrollProgress * 180}px)`; logoEl.style.opacity = `${Math.max(0, 1 - scrollProgress * 1.5)}`; }
   if (hintEl) hintEl.style.opacity = `${Math.max(0, 1 - scrollProgress * 1.5)}`;
 }, []);

 // Init strip/drawer widths and wire outer scroll → layout animation
 useEffect(() => {
   if (stripRef.current) stripRef.current.style.width = '320px';
   if (drawerRef.current) drawerRef.current.style.width = '260px';
   if (landingPanelRef.current) { landingPanelRef.current.style.width = '420px'; landingPanelRef.current.style.minWidth = '0px'; }
   // Apply correct time-based theme on mount
   applyPalette(getAutoIndex());
   const themeInterval = setInterval(() => applyPalette(getAutoIndex()), 60000);
   // (cleanup returned below)
   // Expose for direct calls from non-React code
   window.lnvHandleFeedScroll = handleFeedScroll;
   window.lnvCollapseLanding = () => {
     const steps = 30;
     let i = 0;
     const interval = setInterval(() => {
       i++;
       const progress = i / steps;
       handleFeedScroll(progress * 2000);
       if (i >= steps) clearInterval(interval);
     }, 16);
   };
   const scrollOuter = document.getElementById('scroll-outer');
   const scrollSpacer = document.getElementById('scroll-spacer');
   const scrollInner = document.getElementById('scroll-inner');
   window.lnvSpacerLocked = false;
   function updateSpacer() {
     if (window.lnvSpacerLocked) return;
     if (scrollInner && scrollSpacer) scrollSpacer.style.height = (scrollInner.scrollWidth + window.innerHeight) + 'px';
   }
   // Re-query inside handler so it works even if DOM wasn't ready at mount
   function onOuterScroll() {
     const so = document.getElementById('scroll-outer');
     if (!so) return;
     const maxOuter = so.scrollHeight - so.clientHeight;
     const progress = maxOuter > 0 ? so.scrollTop / maxOuter : 0;
     // If feed exists, sync its scrollLeft and use its range
     if (feedRef.current) {
       const maxFeed = Math.max(0, feedRef.current.scrollWidth - feedRef.current.clientWidth);
       const target = progress * maxFeed;
       feedRef.current.scrollLeft = target;
       handleFeedScroll(target);
     } else {
       // No feed — pass scrollX such that raw = progress
       // maxScroll in handleFeedScroll = scrollX * 2 (no-feed branch)
       // So to get raw = progress, we need scrollX / (scrollX * 2) = 0.5 always — BROKEN
       // Fix: use a fixed large range so progress maps correctly
       // raw = scrollX / (FIXED_MAX * 0.4), so scrollX = progress * FIXED_MAX * 0.4
       handleFeedScroll(progress * 5000 * 0.4);
     }
   }
   updateSpacer();
   const resizeObs = new ResizeObserver(updateSpacer);
   if (scrollInner) resizeObs.observe(scrollInner);
   // Attach directly to scroll-outer — re-query in case it wasn't in DOM at closure time
   const attachScroll = () => {
     const so = document.getElementById('scroll-outer');
     if (so) { so.removeEventListener('scroll', onOuterScroll); so.addEventListener('scroll', onOuterScroll); }
   };
   // Also handle wheel events — wheel drives scrollTop which then fires scroll
   function onWheel(e) {
     const so = document.getElementById('scroll-outer');
     if (!so) return;
     e.preventDefault();
     const maxScroll = so.scrollHeight - so.clientHeight;
     const newTop = Math.max(0, Math.min(maxScroll, so.scrollTop + e.deltaY));
     so.scrollTop = newTop;
     so.dispatchEvent(new Event('scroll'));
   }
   const attachWheel = () => {
     const so = document.getElementById('scroll-outer');
     if (so) { so.removeEventListener('wheel', onWheel); so.addEventListener('wheel', onWheel, { passive: false }); }
   };
   attachScroll();
   attachWheel();
   setTimeout(() => { attachScroll(); attachWheel(); }, 100);
   return () => {
     resizeObs.disconnect();
     const so = document.getElementById('scroll-outer');
     so?.removeEventListener('scroll', onOuterScroll);
     so?.removeEventListener('wheel', onWheel);
   };
 }, [handleFeedScroll]);

 return (
   <LayoutContext.Provider value={{
     stripRef, drawerRef, brandRef, landingPanelRef,     landingPanelOpen, closeLandingPanel,
     activeTab, drawerOpen, drawerIsLanding, openDrawer, closeDrawer,
     d3Content, d3Props, openD3, closeD3,
     currentTrack, setCurrentTrack,
     feedRef, postRefs, registerPostRef, scrollToPost, handleFeedScroll,
   }}>
     {children}
   </LayoutContext.Provider>
 );
}
