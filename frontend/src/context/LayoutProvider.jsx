import { useState, useRef, useCallback, useEffect } from 'react';
import { LayoutContext } from './LayoutContext';
import { applyPalette, getAutoIndex } from '../services/themeService';
import { RAIL_WIDTH, RAIL_OPEN_WIDTH, STRIP_OPEN_WIDTH, STRIP_RADIUS } from '../components/Strip';
import { applyFBarLayout, BARS_OUT_RANGE, TEXT_IN_RANGE } from '../lib/fbars';

// Horizontal feed px moved per vertical wheel/trackpad px that #scroll-outer
// receives. #scroll-outer's scrollTop is the SINGLE source of truth for feed
// position — the RAF ticker below reads it every frame and writes the
// (damped) result to feedRef.scrollLeft. Anything that wants to move the
// feed (drag-to-scroll, scrollToPost) must go through scrollTop too, via
// driveFeedScroll — writing feedRef.scrollLeft directly gets silently
// undone on the very next animation frame by the ticker.
const PX_PER_SCROLL = 1.5;

// Gap kept between the rail's own right edge and the F-bars graphic's own
// left edge (the graphic sits just past the rail, at the start of zone 2)
// - see Strip.jsx round 22 comment for why it's positioned relative to the
// whole strip now instead of nested inside zone 2.
const F_BARS_LEFT_GAP = 8;

export function LayoutProvider({ children }) {
 const [d3Content, setD3Content] = useState(null);
 const [d3Props, setD3Props] = useState({});
 // Panel (ContentPanel.jsx) width, in px — null means "use ContentPanel's
 // own static default for this content type." The artist/genre/label
 // drawer pages report their own ideal width here (see BrowseGrid.jsx's
 // useReportPanelWidth) so the drawer scales to how much content is
 // actually in it instead of sitting at one fixed width regardless.
 const [d3Width, setD3Width] = useState(null);
 const [currentTrack, setCurrentTrack] = useState(null);

 const feedRef = useRef(null);
 const stripRef = useRef(null);
 // Where the feed really is, and whether a drawer is open: the left strip folds to its rail while a drawer is open
 // (it sits above the drawer, so at the start of the feed it hid most of it), and unfolds to where the feed is on close.
 const lastScrollXRef = useRef(0);
 const d3OpenRef = useRef(false);
 const railZoneRef = useRef(null);
 const secondaryStripRef = useRef(null);
 const railWordmarkRef = useRef(null); // FADE text wordmark — flush bottom-left of the rail (zone 1), see Strip.jsx
 const fBarsRef = useRef(null); // F-bars logomark graphic — zone 2, near zone 1's edge (round 20), see Strip.jsx
 const navTabsRef = useRef(null);
 // Feed's compose (+) button — shown only once the strip has fully
 // collapsed, i.e. you're on the main feed (gabriel, 2026-10-01).
 const composeBtnRef = useRef(null);
 const postRefs = useRef(new Map());

 function openD3(content, props = {}) { setD3Content(content); setD3Props(props); setD3Width(null); }
 function closeD3() { setD3Content(null); setD3Props({}); setD3Width(null); }
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
   // - STRIP_RADIUS: the feed's left edge sits that far under the strip (Layout.jsx)
   const target = Math.max(0, Math.min(feed.scrollLeft + (postRect.left - feedRect.left) - STRIP_RADIUS, maxFeed));
   driveFeedScroll(target);
   // Highlight once the damped scroll (DAMPING=15, settles in ~150-200ms
   // per scroll-distance step, capped well under a second here) has landed.
   setTimeout(() => {
     // Inset: cards sit in a rounded, overflow:hidden frame (Feed's
     // FloatSlot), which clipped the old outer ring to nothing.
     postEl.style.transition = 'box-shadow 0.2s';
     postEl.style.boxShadow = 'inset 0 0 0 4px var(--theme-accent)';
     setTimeout(() => { postEl.style.boxShadow = ''; }, 900);
   }, 500);
 }, [driveFeedScroll]);

 // Jump the feed to a post from anywhere (search box, drawers). Feed
 // registers its own handler in jumpHandlerRef — it can fetch a post that
 // isn't loaded yet; until it has, this falls back to scrollToPost.
 const jumpHandlerRef = useRef(null);
 const jumpToPost = useCallback((postId) => {
   closeD3();
   (jumpHandlerRef.current || scrollToPost)(postId);
 }, [scrollToPost]);

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
 const handleFeedScroll = useCallback((scrollX, forced = false) => {
   if (!forced) { lastScrollXRef.current = scrollX; if (d3OpenRef.current) scrollX = Number.MAX_SAFE_INTEGER; }
   const introWidth = Math.max(600, window.innerWidth - RAIL_WIDTH); // matches FeedIntro's actual rendered width (Feed.jsx, back to 100%)
   const effectiveRange = Math.min(COLLAPSE_RANGE, introWidth * 0.95);
   const raw = Math.max(0, Math.min(scrollX / effectiveRange, 1));
   const outerWidth = STRIP_OPEN_WIDTH - (STRIP_OPEN_WIDTH - RAIL_WIDTH) * raw; // 530 → 108
   if (stripRef.current) stripRef.current.style.width = `${outerWidth}px`;
   const railZoneWidth = RAIL_OPEN_WIDTH - (RAIL_OPEN_WIDTH - RAIL_WIDTH) * raw; // 320 → 108, same formula as the pre-round-17 rail
   if (railZoneRef.current) railZoneRef.current.style.width = `${railZoneWidth}px`;
   // Zone 2 now runs UNDER zone 1 from left 0 (Strip.jsx, gabriel 2026-09-30)
   // so it reads as a card sliding beneath the rail, like the feed does: only
   // its right edge (the outer box's) moves. Hidden once it's fully under, so
   // no anti-aliased sliver shows round the shared rounded corners.
   if (secondaryStripRef.current) secondaryStripRef.current.style.visibility = raw >= 1 ? 'hidden' : '';
   if (composeBtnRef.current) composeBtnRef.current.dataset.show = raw >= 1 ? '1' : '';
   // Nav tabs (#lnv-tabs — the rail's own icon/directory buttons) start
   // invisible at rest (raw=0) and fade in over the LAST 20% of the
   // collapse, landing fully visible right as the rail finishes narrowing
   // to RAIL_WIDTH (raw=1) — gabriel's ask: hidden on load, revealed "just
   // before complete collapse."
   const tabsOpacity = Math.max(0, Math.min((raw - 0.8) / 0.2, 1));
   if (navTabsRef.current) navTabsRef.current.style.opacity = `${tabsOpacity}`;

   // ROUND 19 — F-bars <-> FADE text launch handoff, driven by the SAME
   // `raw` as everything else, over an early window (raw 0 -> REVEAL_RANGE)
   // instead of the tabs' late one: on launch (raw=0) the F-bars graphic is
   // fully visible mid-idle-bounce; as raw advances through the window it
   // rotates/settles into the F shape while fading OUT, in lockstep with the
   // FADE text fading IN — one shared `revealT` driving both halves, so they
   // can never desync (same one-shared-value principle as the rest of this
   // function).
   // ROUND 25 — independent ramps, see BARS_OUT_RANGE/TEXT_IN_RANGE comment
   // above: barsT reaches 1 (fully rotated + faded out) fast; textT reaches 1
   // (fully faded in) slowly. They're no longer the same number.
   const barsT = Math.max(0, Math.min(raw / BARS_OUT_RANGE, 1));
   const textT = Math.max(0, Math.min(raw / TEXT_IN_RANGE, 1));
   const fBarsOpacity = 1 - barsT;
   const fadeTextOpacity = textT;
   // ROUND 22 — F-bars graphic moved OUT of zone 2 (secondaryStripRef) to be
   // a direct child of the outer strip instead (see Strip.jsx round 22
   // comment) so its now-bigger 200x200 footprint is never clipped by zone
   // 2's own overflow:hidden as zone 2 narrows during the reveal window.
   // Positioned every frame at railZoneWidth + a small fixed gap, so it
   // still reads as "just past the rail" the way it did nested in zone 2.
   if (fBarsRef.current) {
     fBarsRef.current.style.left = `${railZoneWidth + F_BARS_LEFT_GAP}px`;
     fBarsRef.current.style.opacity = `${fBarsOpacity}`;
     applyFBarLayout(fBarsRef.current, barsT);
   }
   // ROUND 23 — gabriel corrected round 22: the FADE text has a FIXED
   // position, it never moves. `left` is a plain static value in Strip.jsx
   // (centered for the rail's at-rest width) — only opacity is written here.
   if (railWordmarkRef.current) railWordmarkRef.current.style.opacity = `${fadeTextOpacity}`;
   // Kept from round 16's diagnostic instinct — cheap, no behavior change,
   // useful if another round of live numbers is ever needed again.
   window.lnvDebugStrip = { windowInnerWidth: window.innerWidth, introWidth, effectiveRange, scrollX, raw, outerWidth, railZoneWidth, tabsOpacity, barsT, textT, fBarsOpacity, fadeTextOpacity };
 }, []);

 // A drawer opening folds the strip down to its rail (smoothly); closing it puts the strip back to match the feed.
 useEffect(() => {
   d3OpenRef.current = !!d3Content;
   const strip = stripRef.current, zone = railZoneRef.current;
   const t = 'width 0.4s cubic-bezier(0.4,0,0.2,1)';
   if (strip) strip.style.transition = t;
   if (zone) zone.style.transition = t;
   handleFeedScroll(d3Content ? Number.MAX_SAFE_INTEGER : lastScrollXRef.current, true);
   const done = setTimeout(() => { if (strip) strip.style.transition = ''; if (zone) zone.style.transition = ''; }, 450);
   return () => clearTimeout(done);
 }, [d3Content, handleFeedScroll]);

 // Init strip width and wire outer scroll → layout animation
 useEffect(() => {
   if (stripRef.current) stripRef.current.style.width = `${STRIP_OPEN_WIDTH}px`;
   if (railZoneRef.current) railZoneRef.current.style.width = `${RAIL_OPEN_WIDTH}px`;
   if (secondaryStripRef.current) secondaryStripRef.current.style.visibility = '';
   if (navTabsRef.current) navTabsRef.current.style.opacity = '0'; // hidden at rest, before the first handleFeedScroll frame runs
   if (railWordmarkRef.current) railWordmarkRef.current.style.opacity = '0'; // FADE text - fixed position (Strip.jsx), only opacity animates
   if (fBarsRef.current) {
     fBarsRef.current.style.opacity = '1'; // F-bars - fully visible at rest
     fBarsRef.current.style.left = `${RAIL_OPEN_WIDTH + F_BARS_LEFT_GAP}px`;
     applyFBarLayout(fBarsRef.current, 0); // idle layout at rest
   }
   // Apply correct time-based theme on mount
   applyPalette(getAutoIndex());
   const themeInterval = setInterval(() => applyPalette(getAutoIndex()), 60000);
   // (cleared in the cleanup below — it used not to be, so every re-run
   // of this effect left another timer going)
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
     // The artist/genre/label drawer (ContentPanel.jsx, #lnv-drawer + its
     // #lnv-drawer-backdrop scrim) sits on top of the feed as a distinct
     // overlay surface, not part of the horizontally-scrolling content —
     // unlike everything else in the feed (see Feed.jsx's comment on why
     // the comment box/tracklist are deliberately overflow:hidden instead
     // of scrollable, so they never compete with this handler), the open
     // drawer SHOULD win when the cursor is over it: gabriel's ask was that
     // hovering the open drawer must not scroll the main feed. Bail out
     // before preventDefault so the browser handles the wheel natively —
     // that's what lets the drawer's own overflowY:'auto' list actually
     // scroll instead of doing nothing (preventDefault'd) while ALSO
     // driving the feed underneath, which is what happened before this.
     // Pop-ups over the feed (the compose window, data-overlay) scroll on
     // their own the same way (2026-10-06).
     if (e.target.closest?.('#lnv-drawer, #lnv-drawer-backdrop, [data-overlay]')) return;
     // 2026-09-25: boxes inside a card that scroll on their own (post
     // description, long tracklists, the comment list) opt in with
     // data-inner-scroll. They get the wheel while they can still move in
     // that direction; at their top/bottom edge the wheel falls through to
     // the feed as before, so the feed never feels "stuck" on a card.
     const inner = e.target.closest?.('[data-inner-scroll]');
     if (inner && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
       const canDown = inner.scrollTop + inner.clientHeight < inner.scrollHeight - 1;
       const canUp = inner.scrollTop > 0;
       if ((e.deltaY > 0 && canDown) || (e.deltaY < 0 && canUp)) return;
     }
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
     clearInterval(themeInterval);
     resizeObs.disconnect();
     if (so) so.removeEventListener('wheel', onWheel);
     if (raf) cancelAnimationFrame(raf);
   };
 }, [handleFeedScroll]);

 return (
   <LayoutContext.Provider value={{
     stripRef, railZoneRef, secondaryStripRef, railWordmarkRef, fBarsRef, navTabsRef, composeBtnRef,
     d3Content, d3Props, d3Width, setD3Width, openD3, closeD3,
     currentTrack, setCurrentTrack,
     feedRef, postRefs, registerPostRef, scrollToPost, handleFeedScroll, driveFeedScroll, jumpToPost, jumpHandlerRef,
   }}>
     {children}
   </LayoutContext.Provider>
 );
}
