// The FADE F-bars logomark's reveal (moved here from LayoutProvider.jsx on
// 2026-10-05 so the phone intro, PhoneIntro in Feed.jsx, plays the same
// animation as the desktop strip). Pure maths + style writes; no React.

// ── ROUND 19 (2026-08-22) — F-bars logomark, ported from canvas ─────────
// gabriel corrected round 18: the F-bars badge does NOT replace the FADE
// text wordmark, it sits alongside it (see Strip.jsx's own round-19
// comment), and the "jump like a live EQ, rotate 90deg into the settled F"
// animation designed and verified in the ScrollReveal.dc.html canvas
// prototype (claude/2026-08-21-fade-logomark-and-reveal-animation.md) is
// now wired to REAL scroll instead of being canvas-only.
//
// Each bar is a fixed rectangle (width = its final horizontal F-stroke
// length, height = a fixed thickness) that never changes shape — only
// ROTATION (90deg -> 0deg) and CENTER POSITION (idle vertical-EQ columns ->
// settled left-aligned F stack) animate as `t` (aka `revealT` below) goes
// 0 -> 1. Rotating a wide-short rect 90deg makes it read as a tall-narrow
// EQ column "for free," exactly like the canvas prototype.
//
// Numbers below are the canvas prototype's, rescaled to this graphic's
// 200x200 footprint (vs. the canvas's 280x300 bar area) — thickness
// 40->29, gap 14->7, etc. (ROUND 22, 2026-08-22: sized up again from the
// round-21 168x168 pass per gabriel's "increase the size" ask. 200 is also
// the largest this can safely get at its current position — see Strip.jsx
// round 22 comment on why the graphic moved out of zone 2's own clipping
// box — without risking getting clipped by the outer strip's own
// overflow:hidden at raw=0, where the strip is at its widest.)
const F_BAR_LENGTHS = [133, 50, 90, 50];
const F_BAR_THICKNESS = 29;
const F_BAR_GAP = 7;
export const F_BADGE_SIZE = 200;
const F_LEFT_PAD = 33;
const F_FINAL_CENTER_X = F_BAR_LENGTHS.map((len) => F_LEFT_PAD + len / 2);
const F_CONTENT_HEIGHT = F_BAR_LENGTHS.length * F_BAR_THICKNESS + (F_BAR_LENGTHS.length - 1) * F_BAR_GAP;
const F_TOP_PAD = (F_BADGE_SIZE - F_CONTENT_HEIGHT) / 2;
const F_FINAL_CENTER_Y = (() => {
  const ys = [];
  let cursor = F_TOP_PAD;
  for (let i = 0; i < F_BAR_LENGTHS.length; i++) {
    ys.push(cursor + F_BAR_THICKNESS / 2);
    cursor += F_BAR_THICKNESS + F_BAR_GAP;
  }
  return ys;
})();
// Idle (live-EQ) layout — evenly spaced vertical columns, bottom-aligned to
// a shared baseline; each column's on-screen height is that bar's own
// `length`, which is what gives the idle columns their varied heights.
const F_BASELINE_Y = 167;
const F_INIT_CENTER_X = [50, 83, 117, 150];
const F_INIT_CENTER_Y = F_BAR_LENGTHS.map((len) => F_BASELINE_Y - len / 2);
// ROUND 25 (2026-08-22): gabriel wants the F-bars fade-OUT and the FADE
// fade-IN to run at DIFFERENT speeds, not the same shared window — F-bars
// disappearing quickly/abruptly, FADE appearing slowly/gradually. Split the
// old single `REVEAL_RANGE` into two independent ranges. `barsT` (F-bars
// rotation + opacity) and `textT` (FADE opacity) are each their own 0->1
// ramp over `raw`, with no requirement that they reach 1 at the same time —
// they're visually independent now, just both still driven off the same
// `raw` (nothing new starts its own separate scroll-tracking).
export const BARS_OUT_RANGE = 0.04; // short - F-bars rotates/fades out fast
export const TEXT_IN_RANGE = 0.4;   // long - FADE fades in slowly

function computeFBarLayout(t) {
  const rotation = Math.round(90 * (1 - t) * 100) / 100;
  const bounceActive = t < 0.08; // only near the very start of the reveal window
  return F_BAR_LENGTHS.map((len, i) => {
    const cx = F_INIT_CENTER_X[i] + (F_FINAL_CENTER_X[i] - F_INIT_CENTER_X[i]) * t;
    const cy = F_INIT_CENTER_Y[i] + (F_FINAL_CENTER_Y[i] - F_INIT_CENTER_Y[i]) * t;
    return {
      left: cx - len / 2,
      top: cy - F_BAR_THICKNESS / 2,
      w: len,
      h: F_BAR_THICKNESS,
      rotation,
      bounceActive,
      delay: [0, 0.15, 0.3, 0.45][i],
    };
  });
}

// Writes computeFBarLayout(t) onto the 4 bar-outer children of `container`
// (fBarsRef.current — see Strip.jsx). Kept as a plain function of its
// container arg (not a closure over the ref) so it can be called identically
// from both handleFeedScroll (per-frame) and the mount effect (initial
// paint), without either needing to depend on the other's closure.
export function applyFBarLayout(container, t) {
  if (!container) return;
  computeFBarLayout(t).forEach((bar, i) => {
    const outer = container.children[i];
    if (!outer) return;
    outer.style.left = `${bar.left}px`;
    outer.style.top = `${bar.top}px`;
    outer.style.width = `${bar.w}px`;
    outer.style.height = `${bar.h}px`;
    outer.style.transform = `rotate(${bar.rotation}deg)`;
    const inner = outer.firstElementChild;
    if (inner) {
      inner.style.animation = bar.bounceActive ? 'eqBounce 0.9s ease-in-out infinite' : 'none';
      inner.style.animationDelay = `${bar.delay}s`;
    }
  });
}
