import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useLayout } from '../context/LayoutContext';
import Clock from './Clock';
import { getUser, logout, isAdmin } from '../lib/auth';
import { goHome, homeMode, useFeedMode, showMyProfile, wallLink } from '../lib/collections';
import { queue } from '../lib/queue';

// Your initial on the strip (2026-10-05): a small menu — your profile, a
// link to it, sign out. (Clicking the initial used to sign you out.)
// Drawn in a portal beside the button: the strip clips what overflows it.
function ProfileMenu({ user, onProfile, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [at, setAt] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = e => { if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  function toggle() {
    const r = btnRef.current.getBoundingClientRect();
    setAt({ left: r.right + 12, bottom: window.innerHeight - r.bottom });
    setCopied(false);
    setOpen(v => !v);
  }
  const item = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', border: 0, borderRadius: 10, background: 'transparent', color: 'var(--theme-text-pri)', fontFamily: "'Barlow', sans-serif", fontSize: 14, textAlign: 'left', cursor: 'pointer' };
  const hover = { onMouseEnter: e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--theme-accent) 16%, transparent)'; }, onMouseLeave: e => { e.currentTarget.style.background = 'transparent'; } };
  return <>
    <button ref={btnRef} onClick={toggle} title={`${user} — your profile and account`} aria-label={`${user} — your profile and account`} aria-haspopup="menu" aria-expanded={open}
      style={{ color: open ? '#fff' : 'var(--theme-text-pri)', fontSize:'13px', fontWeight:700, fontFamily:'Barlow, sans-serif', background: open ? 'var(--theme-accent)' : 'var(--theme-dark3)', border:'1px solid var(--theme-border)', cursor:'pointer', width:'32px', height:'32px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.2s' }}
    >{user.charAt(0).toUpperCase()}</button>
    {open && at && createPortal(
      <div ref={menuRef} role="menu" aria-label="Your account"
        style={{ position: 'fixed', left: at.left, bottom: at.bottom, zIndex: 400, width: 230, padding: 6, background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', borderRadius: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.35)', fontFamily: "'Barlow', sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 10px' }}>
          <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--theme-text-pri)', color: 'var(--theme-dark3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{user.charAt(0).toUpperCase()}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 15, color: 'var(--theme-text-pri)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user}</span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--theme-text-ter)' }}>signed in</span>
          </span>
        </div>
        <button role="menuitem" autoFocus style={item} {...hover} onClick={() => { setOpen(false); onProfile(); }}>My profile</button>
        <button role="menuitem" style={item} {...hover} onClick={() => { navigator.clipboard?.writeText(wallLink(user)).then(() => setCopied(true)).catch(() => {}); }}>{copied ? '✓ Link copied' : 'Copy a link to my profile'}</button>
        <div style={{ height: 1, background: 'var(--theme-border)', margin: '4px 8px' }} />
        <button role="menuitem" style={{ ...item, color: 'var(--theme-text-sec)' }} {...hover} onClick={onSignOut}>Sign out</button>
      </div>,
      document.body
    )}
  </>;
}

const BASE = import.meta.env.VITE_API_URL;

// Tabs marked `panel: true` open the drawer (ContentPanel, via openD3) —
// they browse the auto-collected artists/genres/labels data. Tabs without
// it swap the feed-zone content itself (Layout's `view` state).
const TABS = [
  { id: 'feed',        label: 'home' },
  null,
  { id: 'artists',     label: 'artists',   panel: true },
  { id: 'genres',      label: 'genres',    panel: true },
  { id: 'labels',      label: 'labels',    panel: true },
  null,
  // 2026-10-01: readme → live sets (its content moved into About), and
  // About opens as a drawer like the rest instead of replacing the feed.
  { id: 'live',        label: 'live sets', panel: true },
  { id: 'about',       label: 'about',     panel: true },
];

// ── ROUND 17 (2026-08-21) — merged strip ────────────────────────────────
// Rounds 9-16 spent the whole session trying to get a SEPARATE "secondary"
// strip element to collapse at a different rate than this rail and still
// read as visually in sync with it — never fully worked, and round 15's
// change (which should have been mathematically unmistakable) produced no
// perceptible difference at all, a strong signal the two-element approach
// itself was the problem, not the specific constants.
//
// Gabriel's fix: don't animate two elements — animate ONE, with a
// two-color background. `RAIL_WIDTH` (108px) is a permanent floor that
// never collapses further (the icon tabs live here, always visible/
// clickable, matches the pre-existing "never disappears" requirement).
// Past that, a second color zone (`secondaryStripRef`, the old
// SecondaryStrip's background) fills the rest of the box and holds the
// wordmark. Both this outer box's width AND the inner zone's width are
// driven by the exact same `raw` value every frame (LayoutProvider's
// handleFeedScroll) — they cannot desync, because there's only one number
// driving both, instead of two independently-tuned ranges trying to
// approximate staying in sync.
//
// This also restores the ORIGINAL rounds-2-10 behavior of both zones
// moving at the identical rate (round 11 decoupled them on a theory —
// "fully vanishing reads as more sudden, so it needs to be slower" — that
// five rounds of attempts never actually validated feeling better; this
// goes back to the simpler, structurally-guaranteed-in-sync version and
// lets gabriel's live test be the actual judge rather than more guessing).
//
// ROUND 18 (2026-08-21): first cut of the merge pinned zone 1 (the icon
// rail's own color) at a permanent RAIL_WIDTH (108px), never animated —
// gabriel confirmed the merge worked but wanted zone 1 back to "starting
// larger and seeming to collapse like before," i.e. the rail's own zone
// should ALSO animate from its old resting RAIL_OPEN_WIDTH (320px) down to
// RAIL_WIDTH (108px), exactly like the pre-round-17 rail did — not a fixed
// floor from the start. `railZoneRef` now gets its width written every
// frame from the same `raw` as the outer box (LayoutProvider's
// handleFeedScroll), using the exact pre-round-17 rail formula. Zone 2
// (`secondaryStripRef`) no longer needs its own width at all — its `left`
// is written to the SAME railZoneWidth value every frame, and `right:0`
// (plain CSS) tracks the outer box's own shrinking right edge — so zone 2
// always starts exactly where zone 1 ends, provably gapless since both
// edges come from the identical number, not two separately-rounded ones.
// The wordmark moved from its own separate absolutely-positioned wrapper
// into a normal flex child of zone 2 itself, so its position tracks zone
// 2's box automatically instead of needing its own left-tracking.
//
// Also hardened against gabriel's other report — a thin sliver of the
// wrong color visible at what he described as "underneath" — with two
// defensive, cost-nothing changes: `boxSizing:'border-box'` on the outer
// box (so its `border-right` no longer silently adds 1px on top of the
// JS-set width, a possible source of a 1px rounding gap at the right edge)
// and a matching fallback `background` on the outer box itself (so ANY
// stray 1px gap, wherever its actual cause turns out to be, shows the
// correct zone color underneath instead of exposing the page's own
// background).
export const RAIL_WIDTH = 108;             // permanent icon-rail floor — zone 1 never collapses past this
export const RAIL_OPEN_WIDTH = 320;        // zone 1's own resting width, unchanged since round 1 —
                                            // now actually used to animate zone 1 again (round 18)
export const SECONDARY_STRIP_WIDTH = 210;  // secondary zone's width at full rest — kept as a named
                                            // export purely as a geometry constant; Preloader.jsx's
                                            // own overlay animation references it to mimic this
                                            // resting state, it no longer sizes a separate real element.
export const STRIP_OPEN_WIDTH = RAIL_OPEN_WIDTH + SECONDARY_STRIP_WIDTH; // 530 — combined resting width
// Right-hand corner radius of both strip zones (2026-09-30, = DESIGN_BASE.artRadius).
// The feed runs this far UNDER the strip (Layout.jsx) so its rounded corners
// show the feed passing beneath — never the page background.
export const STRIP_RADIUS = 40;

export default function Strip({ activeView }) {
  const onFeed = useLocation().pathname === '/' && activeView === 'feed';
  const { setCurrentTrack, stripRef, railZoneRef, secondaryStripRef, railWordmarkRef, fBarsRef, navTabsRef, d3Content, openD3, closeD3 } = useLayout();

  // Non-panel tabs (main feed / readme / about) swap the feed-zone content
  // itself — they should also close the artist/genre/label drawer
  // (ContentPanel, opened via openD3) if one happens to be open, so
  // navigating away from a drawer doesn't leave it sitting open over
  // content it no longer relates to.
  function handleTabClick(tab) {
    if (tab.panel) { openD3(tab.id); return; }
    closeD3();
    // The first tab always brings back the home view — "my feed" once
    // signed in, the main feed for visitors (2026-10-03).
    if (tab.id === 'feed') goHome();
    window.lnvNavigate?.(tab.id);
  }
  const user = getUser();
  const feedMode = useFeedMode();

  async function handleLogout() {
    await logout();
    window.location.href = '/';
  }

  async function handleRandom() {
    try {
      const res = await fetch(BASE + '/tracks/random');
      const data = await res.json();
      if (!data.youtube_url) return;
      queue.close(); // one player at a time: the random track replaces the playlist
      setCurrentTrack({ title: data.title, artist: data.artist + ' — ' + data.album, youtubeUrl: data.youtube_url, postId: data.post_id, albumArt: data.cover_image || data.thumb_image || null });
    } catch (err) { console.error('Random error:', err); }
  }

  return (
    <div id="lnv-strip" ref={stripRef} style={{ left:0, position:'sticky', width:`${STRIP_OPEN_WIDTH}px`, minWidth:`${RAIL_WIDTH}px`, height:'100vh', flexShrink:0, zIndex:100, boxSizing:'border-box', overflow:'hidden', background:'transparent' /* was var(--theme-dark2) + a 1px borderRight: both showed as a green sliver round zone 1's rounded corners once fully collapsed (gabriel, 2026-09-30) — the colour and the edge line live on zone 2 now, which is 0 wide when collapsed */, transition:'background 0.8s, border-color 0.8s' }}>
      {/* Zone 1 — the icon rail's own color. Animates RAIL_OPEN_WIDTH (320px)
          down to RAIL_WIDTH (108px), written every frame by
          LayoutProvider's handleFeedScroll from the same `raw` that drives
          the outer box — same formula the pre-round-17 rail always used. */}
      <div ref={railZoneRef} style={{ position:'absolute', left:0, top:0, bottom:0, width:`${RAIL_OPEN_WIDTH}px`, background:'var(--theme-sidebar)', transition:'background 0.8s', overflow:'hidden',
        // Right-hand corners rounded, open / collapsing / collapsed alike —
        // gabriel, 2026-09-30. 40 = DESIGN_BASE.artRadius in Feed.jsx (the
        // covers' radius); was 14, too subtle at this height. Feed.jsx's
        // FLOAT_RADIUS (cards, intro) is set from STRIP_RADIUS so all match.
        borderTopRightRadius:STRIP_RADIUS, borderBottomRightRadius:STRIP_RADIUS }}>
        {/* FADE text wordmark. FIXED position (round 23) — never moves as
            the rail collapses, only opacity animates (fadeTextOpacity,
            LayoutProvider). ROUND 24: gabriel wants this centered for the
            SETTLED (fully collapsed, RAIL_WIDTH=108px) rail width, not the
            at-rest 320px one — round 23's left:'115px' was centered for the
            wrong (open) width and read as "too far right." At ~90px wide,
            "FADE" barely fits the 108px collapsed rail at all, so centered-
            for-108 unavoidably sits close to the edge (~9px each side) —
            that's not a bug, it's the only way it centers in the narrower
            state without overflowing it. fontSize/letterSpacing/lineHeight
            are the exact values gabriel confirmed "perfect" in an earlier
            round. */}
        <div
          id="lnv-brand"
          ref={railWordmarkRef}
          style={{
            position: 'absolute',
            left: '28px',
            bottom: '40px',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontFamily: 'Barlow, sans-serif',
            fontSize: '100px',
            fontWeight: 900,
            color: 'var(--pastel-blue-mid)',
            letterSpacing: '-3px',
            lineHeight: '36px',
            whiteSpace: 'nowrap',
            opacity: 0,
          }}
        >
          FADE
        </div>
      </div>
      {/* Zone 2 — the old "secondary strip" color. Only its `left` is
          written by JS, to the exact same railZoneWidth value zone 1's
          width was just set to — `right:0` (plain CSS) tracks the outer
          box's own shrinking right edge on its own. Zone 2 therefore always
          starts exactly where zone 1 ends: both edges come from one shared
          number, so there's no separate rounding to drift apart. No content
          of its own anymore — the F-bars graphic that used to live here
          moved out to be a direct sibling below (see ROUND 22 comment
          there) so its bigger size can't be clipped by this zone's own
          overflow:hidden as it narrows during the reveal window. */}
      {/* 2026-09-30 (gabriel): zone 2 now starts at left 0, UNDER zone 1
          (zIndex -1 inside the strip's own stacking context), with the
          rail's rounded right corners — so as the strip collapses it looks
          like a card rolling in beneath the rail, like the feed does, and
          fills the rail's corner cut-outs. LayoutProvider no longer moves
          its left; it hides it once fully under (raw = 1). The old 1px
          edge line is gone (the feed cards have none either). */}
      <div ref={secondaryStripRef} style={{ position:'absolute', left:0, right:0, top:0, bottom:0, zIndex:-1, background:'var(--theme-channel, var(--theme-dark2))', borderTopRightRadius:STRIP_RADIUS, borderBottomRightRadius:STRIP_RADIUS, transition:'background 0.8s', overflow:'hidden' }}>
        {/* The landing clock's twin (gabriel, 2026-09-30: the clock should
            stay visible until it goes under the WHITE rail). The real clock
            (FeedIntro) is covered by this zone as it scrolls left; this copy
            is drawn in the same spot, clipped to this zone, so the clock
            reads as riding over the green and tucking under the rail. Its
            `right` and opacity are written every frame by Feed()'s
            landing-clock loop, alongside the real clock's. */}
        {onFeed && <div id="lnv-strip-clock" aria-hidden="true" style={{ position:'absolute', top:28, right:0, textAlign:'right', opacity:0, pointerEvents:'none' }}><Clock /></div>}
      </div>

      {/* F-bars logomark — the animated equalizer-to-F graphic. ROUND 22
          (2026-08-22): moved OUT of zone 2 to be a direct child of the
          outer strip (like #lnv-tabs below) — zone 2 actually NARROWS
          during the early part of the reveal window (both the outer strip
          and zone 1 shrink at different rates as `raw` advances), so a
          bigger graphic nested inside zone 2's own overflow:hidden risked
          getting clipped right as it needed the most room. `left` is now
          written every frame by LayoutProvider's handleFeedScroll as
          `railZoneWidth + F_BARS_LEFT_GAP` — always just past the rail's
          own (animated) right edge, same visual spot as before, just not
          clipped by it. The inline `left` below is only the at-rest
          fallback.
          Idle at rest (raw=0): 4 bars stand as vertical live-EQ columns
          with a bounce (`eqBounce`, index.css) staggered per-bar, anchored
          to a shared baseline (see ScrollReveal.dc.html's transform-origin
          fix on `.bar-inner` in index.css — CSS rotate() is clockwise, so a
          bar's ORIGINAL right edge is what lands at the visual BOTTOM once
          rotated 90deg, which is why the bounce is anchored there and not
          the left edge). As raw advances through the reveal window
          (LayoutProvider's REVEAL_RANGE, shortened this round so the
          handoff reads faster/crisper) each bar rotates 90deg -> 0deg and
          slides into its settled, left-aligned F-stroke position, while
          this whole graphic fades OUT in lockstep with the FADE text (zone
          1, above) fading IN. Exactly 4 children (no more, no less) —
          LayoutProvider's applyFBarLayout indexes them positionally via
          fBarsRef.current.children[i].
          Sized up again this round (168 -> 200) per gabriel's ask — bare
          positioning wrapper only, no visible badge box (dropped last
          round), just the bars themselves against zone 2's background. */}
      <div
        id="lnv-fbars"
        ref={fBarsRef}
        style={{
          position: 'absolute',
          left: '328px',
          bottom: '40px',
          width: '200px',
          height: '200px',
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bar-outer" style={{ position: 'absolute' }}>
            <div className="bar-inner" style={{ width: '100%', height: '100%', borderRadius: '5px', background: 'var(--off-white)' }} />
          </div>
        ))}
      </div>

      {/* Core navigation (artists/genres/labels/readme/about, random play,
          identity) — always CLICKABLE at every scroll position, but per
          gabriel's ask it's now hidden at rest and fades in over the last
          20% of the collapse (see LayoutProvider's handleFeedScroll /
          tabsOpacity), landing fully visible right as the rail finishes
          narrowing. Pinned at left:0 regardless of zone 1's current animated
          width — it's a sibling, not nested inside zone 1.
          Padding sized to match BrowseGrid.jsx's BrowseTile drawer pills
          (11px/19px) — but axis-swapped: these buttons are vertical text
          (writingMode:'vertical-rl'), so the padding that runs ALONG the
          text (top/bottom here, vs. left/right for the drawer's horizontal
          pills) gets the bigger 19px value, and the padding ACROSS the text
          (left/right here) gets 11px. `width:34px` stays fixed — it's the
          pill's cross-axis thickness, bounded by #lnv-tabs' own 44px
          column, not something to size up the way the drawer pills did.
          Not verified live — worth checking the tab stack doesn't run past
          100vh on a shorter screen now that each tab is taller. */}
      <div id="lnv-tabs" ref={navTabsRef} style={{ position:'absolute', left:0, top:0, width:'44px', display:'flex', flexDirection:'column', alignItems:'center', padding:'14px 0 0', gap:'4px', opacity:0 }}>
        {TABS.map((tab, i) => {
          if (!tab) return <div key={'d'+i} style={{ width:'22px', height:'1px', background:'var(--theme-border)', margin:'4px 0' }} />;
          const isActive = tab.panel ? d3Content === tab.id : activeView === tab.id && (tab.id !== 'feed' || feedMode.type === homeMode().type);
          return (
            <button key={tab.id} data-tab={tab.id}
              onClick={() => handleTabClick(tab)}
              style={{ writingMode:'vertical-rl', transform:'rotate(180deg)', fontFamily:"'Barlow', sans-serif" /* was VT323 — Barlow like the feed and drawers, gabriel 2026-10-01 */, fontWeight:600, fontSize:'13px', letterSpacing:'0.06em', color: isActive ? '#fff' : 'var(--theme-text-ter)', background: isActive ? 'var(--theme-accent)' : 'transparent', border: isActive ? 'none' : '1px solid var(--theme-border)', cursor:'pointer', padding:'19px 0', width:'34px', textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, /* centred both ways: flex + line-height 1 drops Barlow's extra line-gap, which sat the text off-centre */ whiteSpace:'nowrap', textTransform:'lowercase', borderRadius:'99px', transition:'color 0.2s, background 0.2s, border-color 0.8s' }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background='var(--theme-dark3)'; e.currentTarget.style.color='var(--theme-text-pri)'; }}}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--theme-text-ter)'; }}}
            >{tab.id === 'feed' && user ? 'my feed' : tab.label}</button>
          );
        })}
        <div style={{ width:'22px', height:'1px', background:'var(--theme-border)', margin:'5px 0' }} />
        <button onClick={handleRandom} title="Play random track"
          style={{ color:'var(--theme-accent)', fontSize:'16px', background:'transparent', border:'1px solid var(--theme-border)', cursor:'pointer', width:'32px', height:'32px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.2s, border-color 0.8s' }}
          onMouseEnter={e => e.currentTarget.style.background='var(--theme-dark3)'}
          onMouseLeave={e => e.currentTarget.style.background='transparent'}
        >▶</button>
        <div style={{ width:'22px', height:'1px', background:'var(--theme-border)', margin:'5px 0' }} />
        {/* Playlists and walls (2026-10-03, CollectionDrawers.jsx). Signed in only;
            a round button like ▶ for the same height reason as admin below. */}
        {user && (() => {
          const active = d3Content === 'walls' || d3Content === 'playlists';
          return (
            <button onClick={() => (active ? closeD3() : openD3('playlists'))} title="Playlists and following" aria-label="Playlists and following"
              style={{ color: active ? '#fff' : 'var(--theme-accent)', fontSize:'15px', background: active ? 'var(--theme-accent)' : 'transparent', border:'1px solid var(--theme-border)', cursor:'pointer', width:'32px', height:'32px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'4px', transition:'background 0.2s' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background='var(--theme-dark3)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background='transparent'; }}
            >{/* A playlist, not ♥ — ♥ means keeping a record now (2026-10-06). */}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h11" /><path d="M3 12h11" /><path d="M3 18h7" /><path d="M18 17V6l4-1" /><circle cx="16" cy="17" r="2" /></svg></button>
          );
        })()}
        {/* Admin (2026-10-02) — admin accounts only: opens the admin drawer
            (status, logs, users). A round button like ▶ and the identity
            one, not a vertical pill: the tab stack is ~680px already and a
            pill would push the identity button off a 768px-tall screen. */}
        {user && isAdmin() && (() => {
          const active = d3Content === 'admin';
          return (
            <button onClick={() => (active ? closeD3() : openD3('admin'))} title="Admin — status, logs and users" aria-label="Admin"
              style={{ color: active ? '#fff' : 'var(--theme-accent)', fontSize:'15px', background: active ? 'var(--theme-accent)' : 'transparent', border:'1px solid var(--theme-accent)', cursor:'pointer', width:'32px', height:'32px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'4px', transition:'background 0.2s' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background='var(--theme-dark3)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background='transparent'; }}
            >⚙</button>
          );
        })()}
        {/* Identity — your initial when signed in (a menu: your profile,
            its link, sign out — ProfileMenu above); otherwise a link to
            /login (see lib/auth.js). */}
        {user ? (
          <ProfileMenu user={user} onSignOut={handleLogout}
            onProfile={() => { closeD3(); window.lnvNavigate?.('feed'); showMyProfile(); }} />
        ) : (
          <a href="/login" title="Sign in or create an account" aria-label="Sign in"
            style={{ color:'var(--theme-text-ter)', fontSize:'14px', background:'transparent', border:'1px solid var(--theme-border)', cursor:'pointer', width:'32px', height:'32px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none' }}
          >＋</a>
        )}
      </div>
    </div>
  );
}
