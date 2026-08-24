// ── Post-card background spectrum ────────────────────────────────────────
// The first 3 cards in the feed stay on the plain POST_BG_CYCLE (today's
// dark1/dark2/dark3 rotation) so the feed opens as a solid, settled block.
// From the 4th card on (idx 3, 0-based) each palette eases into its own
// spectrum instead of repeating the same few tokens forever.
//
// Everything below reads its colors through CSS color-mix() against the
// live --theme-* custom properties, never a hardcoded hex — so it keeps
// tracking the theme picker / auto clock exactly like the rest of the app.
// See claude/2026-08-23-post-spectrum-concepts.md in the project for the
// mockups + reasoning behind each palette's assignment.

export const SPECTRUM_START = 3 // idx 3 == the 4th card

// Palettes whose ramp routes through a third stop instead of a straight
// dark1 -> light2 line. Afternoon: "some orange to break it up a bit" —
// its own accent already is that orange.
const RAMP_MIDPOINT = { 'Afternoon': 'accent' }

// Palettes that pulse toward their accent instead of ramping dark1->light2.
// Deep Night's dark1->light2 swing goes near-black to near-white and blows
// out the mood, so it breathes toward its (much closer) accent instead.
const PULSE_PALETTES = new Set(['Deep Night'])

function triangle(t) {
  const x = ((t % 1) + 1) % 1 // ping-pong 0 -> 1 -> 0, guards against negative t
  return x < 0.5 ? x * 2 : (1 - x) * 2
}

function mix(tokenA, pctA, tokenB, pctB) {
  return `color-mix(in srgb, var(--theme-${tokenA}) ${pctA.toFixed(1)}%, var(--theme-${tokenB}) ${pctB.toFixed(1)}%)`
}

// The ramp/pulse bottom out at pure dark1 (or dark2, for the pulse) once per
// cycle. On palettes where that token is IDENTICAL to --theme-bg (Deep
// Night, Pre-dawn, Late Evening all define dark1 === bg), the bottom of the
// cycle is pixel-identical to the transparent mat it replaced — so the 4th
// post can render with literally zero visible change. FLOOR keeps every
// frame at least this far from the start token, so the spectrum is always
// perceptible, on every palette, right from the 4th post.
const FLOOR = 0.15

/**
 * @param {number} idx - card index in the feed (0-based)
 * @param {string} paletteName - active palette's `name`, e.g. currentPalette.name
 * @returns {string} a CSS color value (var() or color-mix()) for that card's mat
 */
export function spectrumBg(idx, paletteName) {
  const j = idx - SPECTRUM_START // 0 at the 4th card

  if (PULSE_PALETTES.has(paletteName)) {
    const raw = triangle(j / 6)
    const t = (FLOOR + raw * (1 - FLOOR)) * 0.7 // capped at 70% toward accent — a pulse, not a full swing
    return mix('dark2', (1 - t) * 100, 'accent', t * 100)
  }

  const mid = RAMP_MIDPOINT[paletteName]
  const raw = triangle(j / 10)
  const t = FLOOR + raw * (1 - FLOOR)

  if (mid) {
    return t < 0.5
      ? mix('dark1', (1 - t * 2) * 100, mid, t * 2 * 100)
      : mix(mid, (1 - (t - 0.5) * 2) * 100, 'light2', (t - 0.5) * 2 * 100)
  }

  return mix('dark1', (1 - t) * 100, 'light2', t * 100)
}
