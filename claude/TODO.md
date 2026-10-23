# TODO: the one list (tidied 22 Oct 2026, updated 23 Oct)

This is the list to read and keep current. The old running notes (6 to 22 Oct, in date layers) are kept unchanged as the archive in
`claude/2026-10-06-late-handover.md`; each item below says where its full detail lives ("archive: Added 10 Oct" = that heading in the archive file).
Items marked **(check)** were written down earlier and I have not re-verified them against the code since.

## 0. Where we are
- **Live on waxopathy.com: `b72a4ff`** (23 Oct; frontend rebuilt, backend last restarted 22 Oct evening at `c91d4e2`). Nothing is waiting to be deployed.
- Everything from the 22 Oct arc and the 22/23 Oct links, bug-fix and Spotify work is live: research-only recording and "Your data", notifications, @tags, Hide, My feeds, found-via and tag chips, wrong-link flagging,
  decade chips, For later, /u/<name>, the launch scroll lock and smooth start, the feed-paging fix. What it is and how to undo it: `claude/2026-10-22-handover.md`.
- **Not yet looked at by eye on the live site, signed in:** the bell, Your data, Hide, For later, the chips, compose's link check and "Playable coverage" in Admin; and the five fixes below (spotlight survives a new post, "my feed" keeps your place, playlist rows readable, obvious highlights, Spotify fill). (The tool pane here cannot show real layout or scrolling.)
- Your uncommitted `frontend/src/lib/moduleKit.js` ("heat vision" sweep) is yours: never commit or stash it. Never `git stash` here.
- Rules in force: **research only** (nothing recorded ever picks what people hear or see), **opt-in** recording, **ids and slugs only**, **YouTube API data never kept past 30 days**,
  the site **connects people, it never recommends tracks**, and no word "wall" in the interface.

## 1. Needs a decision from you (nothing moves until you answer)
| Question | Why it matters |
|---|---|
| **Group feeds**: a visibility on posts (public or group), or lighter shared items? | Biggest social feature still unbuilt (archive: Added 10 Oct) |
| **Discogs OAuth**: register the Discogs app, put `DISCOGS_CONSUMER_KEY` / `SECRET` in `.env` | Unlocks proper "Connect Discogs" instead of typing a username |
| **Canary records**: which fake posts to seed | Catches bulk copying of the data |
| **Page `/posts/browse`** | It returns 46 KB at 69 posts, about 100 times that at 7,000; changing it changes what the drawers receive |
| **Remove the rejected card variants** (about 1,200 to 1,500 lines, 25% of `Feed.jsx`) | Module is the default; blocks, notes, paired, shelf/old are flag-only. They stay in git history and the `pre-shelf-stack` tag |
| **Research wording**: "the defining factor" or "a strong distinct signal"? Which acts count as labels? First opted-in group? | `claude/2026-10-22-research-programme.md` section 7 |
| **Which label header** did you mean by "not sure we need this larger track header"? (label drawer top?) | Then add label genre tags, website, profile (archive: Next session list 6 Oct, item 8) |
| **Make the Module card the default?** | Waiting on your say-so (archive: Added 14 Oct) |
| **Brand**: Chewing the Ceiling is chosen; the wordmark box on sign-in pages is blank until you give the wordmark | Do not invent the brand |
| **Hide**: just the post, or also mute the person? Should hiding a ♥'d entry leave your public feed? | Small; the current build hides the post only |
| **Playlist "In playlists" chip**: should shared-by-link lists show, not only public ones? | Small |

## 2. Bugs to chase
0. **Admin drawer opens black the first time** (23 Oct): the lazy-loaded admin drawer was the only one not pre-built at idle. Fixed in code (built at idle for admin accounts, and a "Loading…" line while it loads), committed, NOT deployed; confirm after deploy.
1. **Bad YouTube matches** for very short titles ("Meftah – 7" played a football video): the artist must appear in the title, reject sport/news words, minimum score.
2. **Comber 404 loop**: "[comber] Failed to fetch release … 404" once a minute in the server log. A 404 must end that release's retries (same kind of bug as the crawler loop, already fixed).
3. **Hide is not applied to `/posts/browse`**, so a hidden post still appears in drawer lists.
4. Theme palettes: fix the problem times of day (Deep Night etc.) (11 Oct). **(check)**
5. Artist and label names should open their drawer everywhere (collections, drawers) (11 Oct). **(check)**

**Fixed 22/23 Oct and LIVE (`cf2ee22`, `b72a4ff`):** please look at each in a real browser.
- Adding a record from an artist/label spotlight no longer makes the spotlight vanish: new posts arriving at the front (yours, or the 30-second refresh) are put on the front and the rest of the shelf stays as it was (it used to rebuild and reshuffle everything). Tried on desktop (spotlights identical before/after a new post). **Phone not tried.** The shelf shifts one card to the right when a post is added at the front (the same as before); not compensated.
- "My feed" keeps your place: where you were in each feed is remembered, and returning to it (from a friend's feed, a playlist) puts you back there instead of on your profile card. The mechanism was tried with simulated positions only (the test pane has no animation frames, so real scrolling is unseen).
- Playlists: a playlist opened from a card, the queue bar or a link now opens (a shared one used to never open; a stale one could stay on top). **Track titles white on white fixed**: the playlist and Following rows were buttons whose background was set to "undefined", so the browser's light grey showed behind white text in dark themes (fixed in the shared Row). Tried across all 8 palettes (dark ones now 19.9:1). "View as feed" shows only tracks that came from posts: that is how it is built (see Build next); the paging problem that cut it short was the feed bug fixed earlier.
- Highlights: a highlight set in compose does show on the card (checked: saved by the server, returned, drawn); it is now obvious: the whole row glows in the accent colour with a bar on the left, bold title and a big accent star (it was a slightly brighter star).
- Spotify embed in the Module card's square media box: it was cut off between its two real sizes. In a box 152 to 351 px tall it now uses the compact 152 px player, centred; at 352 or more the full one. First fixed with a compact 152 px player, which left black bars (gabriel, 23 Oct); now the full 352 px layout is scaled to fit the box exactly so it fills the space (`b72a4ff`). The size is measured in the browser; not seen rendering, not tried with a real Spotify track playing.

## 3. Build next
### Player and listening
- **One global player** that pops out and never stops; queue from anywhere ("add to queue / play next"); playlists open in it; play-through to the next record; jump back to the playing post; pocket mode (10 Oct, archive: NEXT WEEK item 1, and "Player" in Added 9 Oct).
- "Play all / shuffle" for Discogs lists (resolve each record only on its turn, free sources first).
- Starting a track anywhere closes every other open player (Spotify was fixed; re-check everything).
- **"Listening to now"** box on someone's profile, with a play-it-too button (10 Oct). It needs the opt-in rules first.
### Links and playback
- BUILT 22 Oct and LIVE (`c91d4e2`, backend restarted):
  - **Compose checks each track's link before posting**: the platform's real title is shown under the link with "✓ looks right / ? check this one / ✗ does not look right" (uses `/api/track-links/check`, free oEmbed); posting asks "Post anyway / Go back and look" if any look wrong. The API was tried against real YouTube; the compose screen itself was not tried in a browser (the note box needs a resolved link).
  - **Compilations use each track's own artist** in the gap sweep (SQL, falls back to the post's first artist unless it is "Various") and in compose's Discogs-video matching (the other compose searches already did).
  - **Spotify placeholder -> YouTube**: `services/placeholderSwap.js`, hourly and a minute after start, database only (no units). A post track whose link is still the Spotify placeholder recorded in the link book gets the YouTube link once one exists. `PLACEHOLDER_SWAP=0` switches it off. The nightly spare-units job now also swaps (it used to set the YouTube link but leave the Spotify one showing). Tried on a throwaway copy of the data.
  - **Admin Status, "Playable coverage"** (`services/coverage.js`): tracks on live posts by best link (YouTube, SoundCloud, Bandcamp, other, Spotify only, nothing), % playable and % in full, the link book's numbers, and how many placeholders are waiting to swap. Tried on the data copy (dev: 85% playable, 77% in full).
  - **30-day rule for channel data**: channel title/thumbnail/counts refresh every 25 days with the other refreshes (a channel the API no longer returns is deleted with its uploads); `youtube_channel_cache` is deleted after 25 days and `yt_channel_urls` after 30; what cannot be renewed is deleted at 30 days. Tried on the data copy (old rows gone, new kept). The Admin "YouTube 30 days" counts include them.
- Still open: **Nightly job: seed from crawled channels** (step 4 of the 7 Oct link plan); **"Tracks with nothing to play"** are still only counted, not chased; Tidal links in cards; Last.fm as a free match check (minor).
- Short-title matching ("Meftah – 7") is listed under Bugs, item 8.
### Feed and cards
- **"View as feed" for a playlist** shows only the tracks that came from posts. Decide: a card for tracks that did not (a small "track" card), or leave it.
- **Add to a playlist from the compose window**, applied only when the post succeeds (15 Oct).
- **A whole playlist as one card** in your feed (10 Oct).
- **Post format**: one-line (about 300 characters) by default is built; the full post is optional. Decide what is left (9 Oct).
- Card text tidy-ups: take the poster's name/date out of "The post" header etc. (10 Oct); post number as a solid circle (12 Oct).
- Hide button on the one card variant whose heart is a pill. Phone feed: everything done today was desktop only.
### Catalogues and search
- Make artist/label names clickable everywhere; "+N" genre pill opens the genres drawer.
- Label pages: genre tags, website, profile (after you answer the header question).
- Add-a-label leftovers: labels on their own domain (only `*.bandcamp.com` works), a year for Bandcamp releases, a missing cover.
### People and community
- **Send a track to a friend**, controlled by the receiver (10 Oct).
- **Group feeds** (after your decision), **feedback / "bluepost" button** for testers (10 Oct).
- **Edit-profile review**: the profile screens grew piece by piece (10 Oct). Profile pictures later.
- More Community boards (DJs, labels, shops). Notifications: more kinds as needed.
- Privacy check end to end with two accounts: visitors see only your posts, not your friends' (14 Oct).
### Accounts and imports ("Connect your accounts", 15 Oct)
- One connection framework (read-only, on request, disconnect deletes tokens), then one platform at a time: **Discogs first, then Spotify**, YouTube, SoundCloud, Apple, Last.fm, Bandcamp by pasted URL. Details: archive Added 15 Oct.
- Import a Spotify playlist (10 Oct); Discogs list loose ends (playable check is slow, imports queue crawls).
### Phone
- The phone front end needs a lot of work (10 Oct, archive: "Keep developing the phone front end"). Real-phone testing is a launch blocker.

## 4. Before anyone but you is switched on, and before launch
- **Words**: rewrite the About, the welcome and a privacy notice (they still say "Nothing learns from you"). Merge the `legal` branch (`01a7b3c`; you fill the [blanks]).
- **Legal**: solicitor reads the notice; a DPIA (profiling); ICO fee; an age limit; register as a company (10 Oct, archive: Register as a company).
- **Data safety**: off-server backup (backups sit on the same server today), UpCloud panel firewall (22/80/443), SSH hardening, encryption at rest for `activity.db` and backups, access log, breach plan (72 hours).
- **IP**: stop the repo being copied (it is public on GitHub: private with a deploy key), notices, trademark search for the name.
- **API applications** after the site is steady: **YouTube quota** (50,000 a day; needs legal pages and the 30-day refresh, which is done), Bandcamp (draft email ready; you are waiting on a better working version first), SoundCloud (Artist Pro), Apple. Re-read Spotify's developer policy (reported ban on ML training) and Discogs' stored-data terms.
- **Rotate the API keys** (9 Oct: `.env` was visible in a screenshot).
- Email provider and domain mail (sign-ups cannot confirm without it). Error monitoring and rollback plan.
- Merge PR #9 / `dedupe` to `master` when you say so (nothing from 7 Oct on is on `master`). Open a PR only when asked.
- Server `.env`: `RATE_LIMIT_MAX=1000000` overrides the new 6000 read limit (remove the line to use the default); a stray `backend/.env.bak-ratelimit` is on the server.
- Before the launch purge, keep `youtube_cache`, `release_track_links`, `yt_channels`, `yt_channel_videos`, `yt_channel_urls`, `profile_links`, `profile_checked`, `release_spotify`, `track_link_submissions` (archive: 7 Oct).

## 5. Performance and memory (details: `2026-10-22-performance-audit.md`, `2026-10-22-memory-report.md`)
- All cards are mounted for about one on screen (about 14,700 elements): **window the feed** using remembered widths. Never `content-visibility` on whole slots.
- Check real scrolling and loading in Chrome DevTools in a visible browser (the pane here cannot).
- Discogs covers are about 85 MB of the 88 MB decoded at start: a **server-side resize-and-cache proxy** (check Discogs image terms first).
- Sweep (`?sweep=1`, your `moduleKit.js`): only touch boxes near the viewport, skip for reduced motion, one custom property per box. Do not commit your edits for you.
- Batch per-post lookups (`getFullPost` is about 10 queries each); trim the 7 KB per-post payload.
- Comber: read in slices past about 1M rows. One shared MutationObserver instead of 77. 9 old lint problems (BrandScaleTool, Dialogs, `Feed.jsx` escapes). No tests for the scroll lock, progressive mount or indexes.
- Server unit edits (need a go-ahead): systemd `MemoryHigh` well above 1.5 GB; `--heapsnapshot-signal=SIGUSR2`.

## 6. Check back on
- **Memory (read 23 Oct, 13.3 h after the restart, 122 samples):** program memory 189 MB (was about 176 MB at the first measurement), V8 heap 15.4 MB, trend +17.2 MB a day (heap +1.4). Too early to call: the first day after a restart always climbs while SQLite fills its page cache (up to 128 MB) and the statement and link caches warm, and the panel turns the number red above 8 MB a day. The heap is nearly flat, which is the good sign. Judge it after 3 days: a leak is program memory still climbing after day 3 with the heap climbing too, or passing about 300 MB.
- **Admin Status, Memory, after 2 to 3 days**: flat program memory = no leak; a steady climb = a leak (the cache counters say whether it is ours).
- **Admin Status, "YouTube 30 days"**: first runs are a catch-up (up to 2,500 units a day).
- **Admin, "How people move"**, after using the site as `lnv_admin`.
- The comber's duplicate folding (log "Duplicate comber: folded N") and whether any list still shows a pair of the same release.

## 7. Ideas, not started
- Spotlights as a crate of vinyl spines (11 Oct); the vertical-bands and cascading-drawers card ideas (12 Oct; bookmarked).
- Genre/style connection graph in the taste database (11 Oct); the research programme (`2026-10-22-research-programme.md`).
- **Record scanner for the phone app** (9 Oct): barcode first, then catalogue number, then our own cover fingerprints. First read Discogs' image terms; collect nothing until then.
- Player on the go, a phone app, "fewer ads" (several links per track).
- Label "not on Discogs/Spotify" signal; a Community board per record shop.

## 8. Loose ends (small)
- Placeholder introductions (`PLACEHOLDER_INTROS`, `Feed.jsx`) to delete when real ones exist. Channel ♥ thresholds (50 uploads, 1,000 subscribers, 1 year) to confirm.
- Spotify search in the composer's cross-platform search. Playlist privacy (all public for now). Unused `.lnv-compose-btn` rule and `mockup4.html` layouts.
- Mockup files and `claude/2026-10-11-card-round2.md` and `2026-10-12-notes-card.patch` are untracked on purpose.
- Working notes (hard-won): lint with `npx eslint` in `frontend/`; edit CRLF files with CRLF-aware tools; write edit scripts with the Write tool, not shell heredocs; Vite can miss a quick double save on Windows; the hidden browser pane has no animation frames or `IntersectionObserver`.

## 9. Done (kept short; the archive and handovers have the detail)
Hosting live on UpCloud and waxopathy.com · duplicate comber · YouTube savings and the 30-day refresh · Add a link for tracks nobody found · infinite scroll in catalogues
· share links (your feed `/u/<name>`, playlists) · Spotify one-at-a-time fix · replies, private replies, highlights · persistent drawers · Introductions and Community boards
· Add a label from Bandcamp · 429s and crawler 404 loop · all of section 0 · feed reaching all 71 posts (confirmed by gabriel) · artist drawer blank on first click (confirmed fixed by gabriel).
