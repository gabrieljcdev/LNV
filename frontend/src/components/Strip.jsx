import { useLayout } from '../context/LayoutContext';
import { getUser, logout } from '../lib/auth';

const BASE = import.meta.env.VITE_API_URL;

// Tabs marked `panel: true` open the drawer (ContentPanel, via openD3) —
// they browse the auto-collected artists/genres/labels data. Tabs without
// it swap the feed-zone content itself (Layout's `view` state).
const TABS = [
  { id: 'feed',        label: 'main feed' },
  null,
  { id: 'artists',     label: 'artists',   panel: true },
  { id: 'genres',      label: 'genres',    panel: true },
  { id: 'labels',      label: 'labels',    panel: true },
  null,
  { id: 'readme',      label: 'readme' },
  { id: 'about',       label: 'about' },
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

export default function Strip({ activeView }) {
  const { setCurrentTrack, stripRef, railZoneRef, secondaryStripRef, secondaryWordmarkRef, d3Content, openD3 } = useLayout();
  const user = getUser();

  function handleLogout() {
    logout();
    window.location.href = '/';
  }

  async function handleRandom() {
    try {
      const res = await fetch(BASE + '/tracks/random');
      const data = await res.json();
      if (!data.youtube_url) return;
      setCurrentTrack({ title: data.title, artist: data.artist + ' — ' + data.album, youtubeUrl: data.youtube_url, postId: data.post_id, albumArt: data.cover_image || data.thumb_image || null });
    } catch (err) { console.error('Random error:', err); }
  }

  return (
    <div id="lnv-strip" ref={stripRef} style={{ left:0, position:'sticky', width:`${STRIP_OPEN_WIDTH}px`, minWidth:`${RAIL_WIDTH}px`, height:'100vh', flexShrink:0, zIndex:100, boxSizing:'border-box', borderRight:'1px solid var(--theme-border)', overflow:'hidden', background:'var(--theme-dark2)', transition:'background 0.8s, border-color 0.8s' }}>
      {/* Zone 1 — the icon rail's own color. Animates RAIL_OPEN_WIDTH (320px)
          down to RAIL_WIDTH (108px), written every frame by
          LayoutProvider's handleFeedScroll from the same `raw` that drives
          the outer box — same formula the pre-round-17 rail always used. */}
      <div ref={railZoneRef} style={{ position:'absolute', left:0, top:0, bottom:0, width:`${RAIL_OPEN_WIDTH}px`, background:'var(--theme-sidebar)', transition:'background 0.8s' }} />
      {/* Zone 2 — the old "secondary strip" color. Only its `left` is
          written by JS, to the exact same railZoneWidth value zone 1's
          width was just set to — `right:0` (plain CSS) tracks the outer
          box's own shrinking right edge on its own. Zone 2 therefore
          always starts exactly where zone 1 ends: both edges come from one
          shared number, so there's no separate rounding to drift apart. */}
      <div ref={secondaryStripRef} style={{ position:'absolute', left:`${RAIL_OPEN_WIDTH}px`, right:0, top:0, bottom:0, background:'var(--theme-dark2)', transition:'background 0.8s', display:'flex', flexDirection:'column', justifyContent:'flex-end', paddingBottom:'40px', overflow:'hidden' }}>
        {/* Zone 2's content — the relocated brand wordmark. Lives as a
            normal flex child of zone 2 now (not its own separately-
            positioned wrapper), so it automatically tracks zone 2's own
            (now-animated) box with no extra left-tracking needed. Its
            opacity fade is written by handleFeedScroll from the same
            `raw` as everything else. */}
        <div
          id="lnv-brand"
          ref={secondaryWordmarkRef}
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontFamily: 'Barlow, sans-serif',
            fontSize: '100px',
            fontWeight: 900,
            color: 'var(--theme-text-ter)',
            letterSpacing: '-3px',
            lineHeight: '36px',
            whiteSpace: 'nowrap',
            opacity: 1,
            paddingLeft: '50px',
            paddingRight: '30px',
            transition: 'color 0.8s',
          }}
        >
          FADE
        </div>
      </div>

      {/* Always visible/clickable at every scroll position — this is core
          navigation (artists/genres/labels/readme/about, random play,
          identity), so it can't disappear once you've scrolled into the
          feed. Pinned at left:0 regardless of zone 1's current animated
          width — it's a sibling, not nested inside zone 1. */}
      <div id="lnv-tabs" style={{ position:'absolute', left:0, top:0, width:'36px', display:'flex', flexDirection:'column', alignItems:'center', padding:'14px 0 0', gap:'3px', opacity:1 }}>
        {TABS.map((tab, i) => {
          if (!tab) return <div key={'d'+i} style={{ width:'18px', height:'1px', background:'var(--theme-border)', margin:'4px 0' }} />;
          const isActive = tab.panel ? d3Content === tab.id : activeView === tab.id;
          return (
            <button key={tab.id} data-tab={tab.id}
              onClick={() => tab.panel ? openD3(tab.id) : window.lnvNavigate?.(tab.id)}
              style={{ writingMode:'vertical-rl', transform:'rotate(180deg)', fontFamily:'VT323, monospace', fontSize:'11px', letterSpacing:'2px', color: isActive ? '#fff' : 'var(--theme-text-ter)', background: isActive ? 'var(--theme-accent)' : 'transparent', border: isActive ? 'none' : '1px solid var(--theme-border)', cursor:'pointer', padding:'10px 4px', width:'26px', textAlign:'center', whiteSpace:'nowrap', textTransform:'lowercase', borderRadius:'99px', transition:'color 0.2s, background 0.2s, border-color 0.8s' }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background='var(--theme-dark3)'; e.currentTarget.style.color='var(--theme-text-pri)'; }}}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--theme-text-ter)'; }}}
            >{tab.label}</button>
          );
        })}
        <div style={{ width:'18px', height:'1px', background:'var(--theme-border)', margin:'5px 0' }} />
        <button onClick={handleRandom} title="Play random track"
          style={{ color:'var(--theme-accent)', fontSize:'14px', background:'transparent', border:'1px solid var(--theme-border)', cursor:'pointer', width:'26px', height:'26px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.2s, border-color 0.8s' }}
          onMouseEnter={e => e.currentTarget.style.background='var(--theme-dark3)'}
          onMouseLeave={e => e.currentTarget.style.background='transparent'}
        >▶</button>
        <div style={{ width:'18px', height:'1px', background:'var(--theme-border)', margin:'5px 0' }} />
        {/* Identity — username only, no password (see lib/auth.js). Click
            when logged in to log out; when logged out, links to /login. */}
        {user ? (
          <button onClick={handleLogout} title={`${user} — click to log out`}
            style={{ color:'var(--theme-text-pri)', fontSize:'11px', fontWeight:700, fontFamily:'Barlow, sans-serif', background:'var(--theme-dark3)', border:'1px solid var(--theme-border)', cursor:'pointer', width:'26px', height:'26px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}
          >{user.charAt(0).toUpperCase()}</button>
        ) : (
          <a href="/login" title="Choose a username"
            style={{ color:'var(--theme-text-ter)', fontSize:'12px', background:'transparent', border:'1px solid var(--theme-border)', cursor:'pointer', width:'26px', height:'26px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none' }}
          >＋</a>
        )}
      </div>
    </div>
  );
}
