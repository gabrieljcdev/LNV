# Palette tool (`frontend/palette-tool.html`)

A dev page for colouring the blocks card by hand, one time-of-day theme at a time. In the repo since 13 Oct 2026 (commit `d63e336`); it is **not** part of the built site.

**Open it at `http://localhost:5173/palette-tool.html`** with the frontend dev server running (`npm --prefix frontend run dev`). Opening the file itself (or from the app's file link) shows a static `data:` copy that cannot save anything or reach your feed; the page says so at the top.

## What it does
- **Show: 8 posts · hand-coloured spectrum** (the default). Pick a theme tab, click any block of any of the 8 posts, and a drop-down lists that theme's colours (bg, sidebar, dark1-3, light1-2, showcase, accent, channel). A look stores the colour *name* (e.g. `accent`), so it follows the palette if the palette changes. Buttons: like previous / like next / all 8, rotate, reverse, re-seed from the old colourways, copy spectrum. Feed loop: wrap (1→8, 1→8) or ping-pong.
- **Show: board** — all 8 themes × their 8 posts in one view.
- **Show: all posts · this palette** — 16 real posts; clicking a box edits the palette colour behind it (colour picker). **one post · all 8 palettes** compares a post across themes.
- Left panel: the 10 colours of the selected palette (edit, contrast ratio), the "All palettes" reference table (click a swatch to drop that colour into the one you are editing), Preview wheel + replies, roundness and corner-cut sliders.
- Posts come from `/api/posts` (needs the backend on :3001); with none it falls back to 8 built-in sample posts.

## Where the data goes
| Button | Writes | Used by |
|---|---|---|
| (every change) | `localStorage` `lnv-palette-draft`, `lnv-spectrum-draft`, plus `lnv-tool-history` (60 snapshots) | the tool only; History + Restore, Download / Load backup (.json) |
| **Apply to my feed** | `lnv-palette-overrides`, `lnv-post-spectrum` | `themeService.js` (palette overrides) and `Feed.jsx` `handSpectrum()` (laid over the shipped spectrum, per palette) in *this browser* |
| **Copy spectrum** / Copy palette code | clipboard | paste into the project to ship it |

## Shipped
- `frontend/src/services/blockSpectrum.js` — the 8 looks per palette (what everyone sees). Format `{ mode, pals: { 'Evening': [{ hero, tracks, plays, details, post } × 8] } }`.
- `frontend/src/services/themeService.js` — the palettes themselves (Morning `light2` was changed to `#EAE6DC` from the tool).
- To change them later: open the tool, work, press **Copy spectrum**, then replace the `L(...)` rows in `blockSpectrum.js` (or ask Claude to bake it), commit, deploy (`deploy/HOSTING.md` step 12).

## Gotchas
- Browser storage is per address: `localhost:5173` and `waxopathy.com` do not share it. Do not clear it casually; **Download backup** first.
- Every change is snapshotted; if the work ever looks empty the tool offers to restore the latest copy.
