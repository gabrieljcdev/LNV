# Performance and code audit, 22 Oct 2026

Measured first, then fixed the biggest wins, as the TODO asked. Everything below was measured on the real feed (a local dev server proxying
`/api` to the live site, so real data) unless it says otherwise. Six commits on `dedupe`, **not pushed or deployed**.

## What was found, and what changed

| Measure (live feed, same machine) | Before | After | How |
|---|---|---|---|
| DOM elements | 22,430 | 14,705 (−34%) | spotlight rows and sleeve strip |
| Images in the page | 1,206 | 745 | same |
| Full style recalculation (any change to a page-wide CSS variable) | 110 ms | 67 ms (−39%) | fewer elements |
| Layout after one scroll step | 12.2 ms | 6.8 ms (−44%) | fewer elements |
| Main script | 849 KB (232 KB compressed) | 735 KB (200 KB) | post window + admin drawer load on demand |
| One feed page's per-post lookups, DB of 5,000 posts / 60,000 tracks | 134 ms | 8 ms (about 17×) | missing indexes added |
| Frame budget for reference | 16.7 ms at 60 fps | | |

### Done (commits)
1. **Launch:** scrolling is locked until the reveal ends (a transparent shield over the page, scroll keys swallowed, a timer releases it so a
   hidden tab can never stay locked); the 0 to 100 counter in the bottom left is gone, and `Preloader` no longer re-renders on every frame
   (`1e54209`, `7a04af1`).
2. **Spotlight cards** were about half the feed. Ten of them each rendered every loaded catalogue row (up to 100) plus a sleeve marquee of 40
   images drawn twice. Now: 30 rows at first, 30 more as the list is scrolled (the open row is always shown; the next page is fetched only once
   everything loaded is showing), and the strip is 24 sleeves with `content-visibility: auto` on a fixed-height box, so offscreen strips are
   skipped and their animation does not run. Fewer sleeves also means fewer background cover fetches to Discogs (`ef8e494`).
3. **Bundle:** `ComposeModal` (mounted only while open, warmed up 4 s after load) and `AdminDrawer` (admins only) load on demand (`c1950b4`).
4. **Dead code:** eight files nothing imported were removed: `AdCard`, `ArtistHoverCard`, `FileIcon`, `GenreHoverCard`, `LabelHoverCard`,
   `SecondaryStrip` (deprecated), `WaveformGraphic`, `lib/postBody` (about 500 lines; the build was byte-identical, so they were dead) (`a0f4078`).
5. **Backend indexes:** every per-post lookup a feed page makes (artists, labels, genres, tracks, comment counts, playlist membership, and the
   Discogs-id lookups) was a full table scan, once per post per page. Invisible at 69 posts, quadratic as it grows (`7c9bf1c`).
6. **Memory leak:** `spareQuota.js` kept every Discogs release it touched in a module-level Map that never shrank, so a server left up for days
   held them all. Capped at 200 and emptied each run (`06ce386`). It is one concrete cause of the server's high memory, not proven to be the only one.

## How it was measured, and what could not be

The built-in browser pane is hidden here, so it produces **no animation frames**. That means: I could not measure real frame rates, I could
not watch `IntersectionObserver` fire (it never did, even for a plainly visible test element), and `content-visibility: auto` never switched
a subtree from skipped to rendered (also true for a plain on-screen test element). So:

- The numbers above are **work per frame** (style, layout, element counts), measured directly. They are real, and they fall, but they are
  **not fps**. Run it in a visible browser with the Performance tab before calling scrolling "perfectly smooth".
- I first built "mount the strip only when its card is near the screen" with `IntersectionObserver`. I removed it again because I could not
  verify it, and because an observer rooted at the viewport gets no look-ahead from `rootMargin` here (the feed's own scroll clipping applies
  first), so strips would have popped in late. The CSS approach has no such failure mode: the strip's height is fixed (measured at exactly
  240 px), so skipping cannot shift anything.
- Lazy images: 1,160 of 1,175 were already `loading="lazy"`. That part was fine.

To re-measure: open the site (or `API_PROXY=https://waxopathy.com npx vite` in `frontend/`) and run in the console:
count `document.querySelectorAll('*').length`; time a forced style recalculation with
`document.body.style.setProperty('--probe', n)` then `getComputedStyle(document.body)`; time a scroll step with
`so.scrollTop = ...; document.body.offsetHeight` on `#scroll-outer`.

## Still open, in the order I would do them

1. **All 77 cards are mounted for about one on screen (still 14,705 elements).** This is the biggest remaining cost. Putting
   `content-visibility` on each `FloatSlot` is the easy move but is unsafe here: card widths vary (426 to 956 px) and come from their content, so
   placeholder widths would shift the scroll position mid-feed, and the feed maps `scrollTop` to `scrollLeft` itself. The safe design is
   windowing with remembered widths: measure each card once, store the width, and render only cards within N screens while reserving the exact
   stored width for the rest. That needs checking in a visible browser. **Expected: another third to half off elements and layout.**
2. **Rejected card variants, about 1,200 to 1,500 lines, 25% of `Feed.jsx` (436 KB of source).** Module is the default (since 14 Oct). Reachable only
   by URL flag: the blocks card (`?cards=blocks`, `ShelfCard` branch around line 2835), the notes card (around 3043), the paired boxes card
   (around 3260), and the shelf stack / older cards (`?cards=new` / `?cards=old`). `BANDS_CARDS` and `DRAWERS_CARDS` are already gone. Removing
   them shrinks the bundle, the parse time, and the number of code paths to keep working. They stay in git history and the `pre-shelf-stack` tag.
   **Needs your yes** (anyone with an old `lnv-cards` value saved in their browser would be moved to Module).
3. **The sweep.** Your uncommitted `moduleKit.js` already adds a skip-when-nothing-changed check and colour lookup tables, which is most of
   what I would have suggested, so I left it alone. What measured today: reading 472 box rectangles costs about 0.7 ms when layout is clean, and
   writing the colours of 100 boxes about 2.2 ms. That is small next to layout. Remaining ideas: only touch boxes near the viewport (cache the list
   and skip the rest), skip entirely under `prefers-reduced-motion`, and write one custom property per box instead of nine.
4. **`/posts/browse` scales with the whole site.** 46 KB raw (12 KB compressed) at 69 posts, so about 100× that at 7,000 posts, on every drawer
   open. Already on the TODO as "page it"; the drawers need changing with it.
5. **`getFullPost` runs about ten queries per post** and the feed returns about 7 KB per post (143 KB for 20). Fine now (the API answers in 100
   to 220 ms, mostly network). Batch the lookups per page, and trim unused fields, before the site is ten times bigger.
6. **Server memory (1.2 GB peak seen in the logs).** The leak fixed above is one cause. Take a heap snapshot of the running server before
   guessing further.
7. **One `MutationObserver` per card (77).** Every palette change makes each card run `getComputedStyle`. Rare and cheap, but easy to turn into
   one shared observer.
8. **Lint:** 9 older problems, none in code touched today, none a correctness bug: `BrandScaleTool.jsx` (3: a dev tool still wired into the
   nav strip; its own comment says to delete it with the tool), `Dialogs.jsx` (3, exports that break fast refresh), `Feed.jsx` (2 useless escapes
   at line 1760 and 1 stale disable comment at 2528).
9. **No tests exist** for the scroll lock, the progressive rows, or the indexes. The index and cache changes were checked on throwaway databases
   with `EXPLAIN QUERY PLAN` and a scale test.

## Not touched
`frontend/src/lib/moduleKit.js` (your uncommitted sweep work) and `claude/2026-10-06-late-handover.md` (your edits plus mine) are not in any of these commits.
