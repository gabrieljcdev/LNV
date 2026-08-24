import { useEffect } from 'react';
import { useLayout } from '../context/LayoutContext';

// ── Panel width scales to content ────────────────────────────────────────
// ContentPanel.jsx used to sit at one fixed width (min(75vw,480px))
// regardless of whether it held 2 tiles or 40. Instead of trying to make a
// position:fixed panel intrinsically size itself off nested CSS grids
// (unreliable across engines, and there's no live browser here to verify
// it against), each page just tells ContentPanel how wide it wants to be —
// a plain, deterministic number driven by how many tiles there are, same
// "JS computes it, a ref/context write applies it" idiom LayoutProvider
// already uses for the strip's own animated widths.
//
// Capped at PANEL_MAX_COLS columns on purpose: this is meant to still read
// as a narrow side drawer, not grow into a full-width data table just
// because an artist has 40 records.
//
// Kept in its own file (not BrowseGrid.jsx, where it originally lived)
// because a custom hook alongside component exports in the same file trips
// eslint's react-refresh/only-export-components rule.
const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 560;
const PANEL_PADDING   = 40; // matches the pages' own `padding: '20px'` on both sides
const PANEL_GAP       = 10; // matches TileGrid/RecordThumbGrid's own `gap`
const PANEL_MAX_COLS  = 3;

// Call with the current tile count and tile width (px) for whatever's
// showing right now (the all-items grid vs. a single selection's record
// grid have different counts and different tile widths — see each page's
// own call site). Pass `count === null` while data is still loading so the
// panel keeps its previous/default width instead of collapsing to the
// 1-column minimum mid-fetch.
export function useReportPanelWidth(count, tileWidth) {
  const { setD3Width } = useLayout();
  useEffect(() => {
    if (count == null) return;
    const cols = Math.max(1, Math.min(count || 1, PANEL_MAX_COLS));
    const width = PANEL_PADDING + cols * tileWidth + (cols - 1) * PANEL_GAP;
    setD3Width(Math.max(PANEL_MIN_WIDTH, Math.min(width, PANEL_MAX_WIDTH)));
  }, [count, tileWidth, setD3Width]);
}
