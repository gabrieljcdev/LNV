# 13 Oct 2026: the blocks look (handover)

Everything below is **live on waxopathy.com** (last deploy `32a22dc`, bundle `index-pxYu3I99`). The phone feed shipped with it: the post card (`f3c3751`), and in the last deploy the landing, profile and sign-in on phone too.

## What was built
- **Blocks post card** (`Feed.jsx`, `ShelfCard` with `BLOCKS_CARDS`, default; `?cards=notes|paired|new|old` go back). No card behind the post: rounded blocks with one chamfered corner on the feed background. Hero (cover, locked header, Add to feed under the genres, post number in a solid circle), tracks (fills its column, only the list scrolls), plays from, details, the post (no scroll, 3-line clamp), Reply pill in the post foot. The card never scrolls on desktop; the phone slide scrolls.
- **Playlist wheels:** a track's **+** opens your playlists as a wheel at the cursor (that track, or all N); the wheel in Details opens other people's public playlists with this record (tap = open as a feed). A lit slice never navigates (the feed mode is remembered, which caused the stuck one-card feed; playlist feeds are also no longer restored on reload, `lib/collections.js`).
- **Colour:** every block takes palette colours. `services/blockSpectrum.js` holds the 8 hand-coloured looks per palette (palette-colour names); the feed arranges them by tone, light to dark by the profile-card colour, ping-pong (`toneSorted`; `order: 'tone' | 'hand'`). Palettes without a spectrum fall back to 7 colourways (`BLOCK_WAYS`). Morning `light2` is now `#EAE6DC`.
- **Palette tool** `frontend/palette-tool.html` (doc: `claude/palette-tool.md`): colour 8 posts per theme from a drop-down of that theme's colours, board view, history, backup. Open it at `http://localhost:5173/palette-tool.html`, never as a file.
- **Landing, profile, sign-in** in the same look (`Collect.jsx` `WelcomeCard` / `WallCard`, `pages/Login.jsx`). Shared kit: `lib/blocksKit.js` + `components/Blocks.jsx` (`Blk` sets `--blk-bg`).
- **Phone feed:** `PhoneFeed` renders the blocks card in a bare slide; replies are a bottom sheet.

## Deploying (HOSTING.md step 12, corrected)
As **root**: `git pull`, `chown -R lnv:lnv .git backend frontend/src`, `npm run build` in `frontend` (as root). `sudo -u lnv git pull` and building as `lnv` both fail. Restart `lnv` only if `backend/` changed.

## Open / next
- Restyle the suggestions card (`IntroCard`), About / Contact / Donate and the drawers in the blocks look.
- Brand: headings on the landing and sign-in say "Chewing the Ceiling"; the page `<title>` and the rest of the code still say "Late Night Vibes"; trademark search still pending.
- The palettes themselves are still tonal in places (the colour work gabriel flagged); the spectrum hides most of it.
- 8 old lint errors (BrandScaleTool, Dialogs, one regex in Feed.jsx); not from this work.
- Local dev DB holds a test account `claudetest37e3` and two empty test playlists.
- Not committed on purpose: `mockup7`-`mockup27.html`, `search-map.html`, the other `claude/` notes and patch. `mockup27.html` shows landing / profile / sign-in on every palette; `mockup26.html` is the blocks-card concept.
- Gotcha for tools: files opened from the app's file link become static `data:` copies (no storage, no `/src` imports, no API). Always give the `localhost:5173` address.
