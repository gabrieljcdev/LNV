# LNV — handover for the next Claude Code session (6 Oct, late)

Read this first. It replaces `claude/2026-10-06-handover.md` for anything
current; that file (and `2026-10-03-handover.md`) stay as the deep reference
for older details: card anatomy, crawlers, platform-API notes, naming
research, launch-readiness sections (§1–§12 in 10-03).

---

## Start here

1. **Branches — two pieces of work are NOT on `master` yet:**
   - **`legal`** — commit `01a7b3c`, pushed, **no pull request yet**. Privacy
     + Terms pages, download/delete account, report button + Admin → Reports,
     Discogs/YouTube credits. Open a PR, gabriel merges.
   - **`dedupe`** (checked out now) — the duplicate comber, **uncommitted**:
     `backend/services/catalogueComber.js` (new), `backend/services/discogsService.js`,
     `backend/routes/discogs.js`, `backend/server.js`,
     `frontend/src/components/Drawers.jsx`, `Feed.jsx`, `ReleasePreview.jsx`.
     Ask gabriel before committing ("commit and push it").
   - Both branches came off `master` @ `798e77c` (PR #6). They touch
     different parts of `Drawers.jsx`, so they should merge cleanly.
2. **Untracked on purpose (never commit):** `_to_delete/`, `_verify4.tar.gz`,
   `.claude/`, `frontend/mockup.html`, `frontend/compose-mockup.html`,
   `frontend/src/components/Feed.jsx.orig_backup_for_lint`,
   `claude/spotlight-list-mockup.html`, and the handover notes.
3. **The name still isn't final:** The Wax Hive (favoured), bolacha.uk, and
   now **Waxopathy** (waxopathy.com — gabriel says the domains are free; he
   likes the "wax disease" symbolism; unchecked by us). Don't rename anything.
4. **YouTube quota is the urgent constraint** — see "YouTube credits" below.

## Where things are

- Repo `C:\Users\gabriel\Desktop\LNV`: frontend `frontend/` (Vite React,
  :5173), backend `backend/` (Express 4 + better-sqlite3, :3001, nodemon).
  gabriel runs both dev servers himself; the backend restarts on file saves
  (not on `.env` edits — touch `server.js` to make it reread `.env`).
- **Keys in `backend/.env`** (never print them): DISCOGS_TOKEN,
  YOUTUBE_API_KEY, SPOTIFY_CLIENT_ID/SECRET, LASTFM_API_KEY/SHARED_SECRET.
  Names are listed in `backend/.env.example`.
- **Test login:** `lnv_admin` / `admin@lnv.test`; password is
  `DEV_ADMIN_PASSWORD` in `backend/.env`. Never paste it in chat.
- Dev data gets purged before launch, so don't write data migrations for it.
- Mockups (Design canvases): introductions https://claude.ai/artifact/PYkdUZZPZN3SBeR2aajNiQ,
  community https://claude.ai/artifact/EZ9wrZN4FepXrfhrYnvqJy,
  profile https://claude.ai/artifact/WpwKdQu3wELRDCELwszPRQ.

## How gabriel works

- Short asks, often screenshots, sometimes a long list in one go. **If a
  request is ambiguous, ask first** — in plain text with a recommendation
  (he dismisses multiple-choice boxes). He answers with a short "yes" or a
  redirect.
- **Clickable mockups first** for anything visual, then build.
- **Commit/push only when he says.** He often says "commit and push it",
  then "open a pull request", then "merge it" — do each only when asked.
- Product values: community, sharing music, **a clean break from
  Spotify-style algorithms**. Anything that ranks or recommends must be
  visible, explained, labelled α ALPHA, never engagement-driven, never
  reorder the chronological feed.
- Wording: **no "wall" anywhere** — it's your feed / someone's feed.
- He asks for "the complete todo" often — keep the TODO below current.

## Working notes (hard-won)

- **Lint:** `npx eslint src` in `frontend/` must stay **clean (0/0)**.
  No non-component exports from `.jsx` files (put helpers in `lib/*.js`).
- **Editing:** write Python edit scripts to the scratchpad with the Write
  tool and run them; **don't put scripts in bash heredocs** — quotes and
  `\b` in regexes get mangled (happened twice: a `\b` became a backspace).
  Keep each file's line endings (most are CRLF), assert each anchor
  matches once, `PYTHONIOENCODING=utf-8` for ♥ and arrows.
- **Vite misses quick double saves** on Windows and serves the old file —
  `touch` the files after editing, then reload.
- **Never do git surgery in the working tree** (no stash / partial staging).
- **Browser pane:** screenshots often time out or tile; measure with
  `javascript_tool`; when the tab is "hidden", React Query pauses retries.
  Reset the viewport (`preset: desktop`) after.
- **Signed-in checks:** short-lived session from a scratchpad script
  (`createSession(id)` / `endSession` in `backend/services/authService.js`),
  put `{token,user}` into `localStorage.lnv_auth`, end it and delete the
  file after. Undo test data. Don't touch gabriel's own data (his bio, the
  "dgtjicghjk" playlist).
- **Waiting:** foreground `sleep` chains are blocked — write a small
  polling script with a time limit instead.
- Users: 1 `lnv_admin` (admin, first friend), 2 `treebeast`, 3 `ADMIN`,
  4 `admin` (same name, different case), 7 `youze`.

## Built 5–6 Oct (merged unless noted)

Introductions (α) · channel ♥ for proper channels · strip profile menu ·
welcome card · gap sweep (every 6 h) · catalogue "Try again" · compose
scrolling fix · genre pills everywhere · drawer releases open in place
(`ReleasePreview.jsx`) · Spotify + Last.fm connected, all services used
cheapest-first, Admin → "Services today" · Bandcamp/SoundCloud genres from
the artist's own tags (`genreTags.js`) · default "My playlist" + one-tap +
· no more walls (Following drawer, `?feed=` links) · Community boards (α),
community tab in genres' place · **legal (branch `legal`, no PR)** ·
**duplicate comber (branch `dedupe`, uncommitted)**.

### The duplicate comber (`backend/services/catalogueComber.js`)

Discogs lists every pressing separately (Epic has *Thriller* ×609; ~62,000
repeated titles across stored catalogues). The comber folds pressings of
the same record into one catalogue row with a "N versions" count — nothing
deleted. Rules, never on title alone:
1. Suspects = same artist + tidied title in one catalogue.
2. Proof = Discogs' master: rows fold only under the SAME master. Different
   masters = different records (Richie Hawtin's three *From My Mind To
   Yours*, Andrés' three *Untitled* stay apart).
3. Ordinary titles: two pressings sampled; generic titles / "Various":
   every pressing checked.
4. Pressings with no master (white labels, digital uploads) join a record
   only if the **tracklists match** (≥80% titles, counts within 1; exact for
   1–2 tracks). Tesox white label → folded; Legends On Acid 2007 (18 tracks
   vs 11), Techno Trax cassette, King Series promo, F.U.S.E. single vs album
   → correctly kept apart.
5. Background, one Discogs call per 2.5 s, **slices of 20 checks**, the
   catalogue someone is viewing goes first, small catalogues before huge.
Columns on `discogs_catalogue`: `work_key`, `master_id`, `dup_of`,
`combed_at`. `getCataloguePage` hides `dup_of` rows and returns `versions`
+ `masterId`. UI: "· N versions" in drawer and spotlight rows; "All N
versions ↗" (Discogs master) in the release preview.
State at handover: 68 pressings folded; ~475,000 rows still to comb
(mostly labels 1610 / 1005 / 878 — the majors; that takes days).
**Not done yet:** a comber line in Admin → Status (`comberStats()` exists,
not wired).

## YouTube credits — why we hit the limit

6 Oct used 4,003 of 5,000 units = 40 searches × 100. **27 of the 40 found
nothing.** Sources: 5 from the gap sweep (its daily max), ~35 from clicking
tracks with no link in spotlights / drawer previews, **including album
play-through searching ahead** (`playNextFrom`, up to 3 per step). Channel
crawls are done and cost ~nothing now. Proposed fixes (agreed in principle,
not built):
- Try **Spotify (free) before any paid YouTube search**, not only past 80%
  (`SPOTIFY-FALLBACK` code in `routes/discogs.js`).
- **Pause the sweep's paid searches** (`GAP_SWEEP_YT_SEARCHES=0`) until the
  quota increase.
- **Play-through: don't search ahead** — only play tracks that already have
  a link.
- Misses are already cached (`youtube_cache`, `release_track_links`); check
  the miss TTL isn't letting the same search repeat too soon.
- **Apply for the quota increase now** — support.google.com/youtube/contact/yt_api_form.
  Offer to draft the answers (what LNV does, why it needs the units,
  caching, compliance).

## TODO

### Added 10 Oct (read this first — newest)
**State:** `dedupe` has the Spotify fix (live), and the card work below (commits `4294751`…`9b5bf6c`, **pushed but NOT yet deployed** when this was written — the live backend has no highlight route, playlists or latest replies until `git pull` + build + `systemctl restart lnv` on the server). Mockups: `frontend/mockup5.html` (card bottom, post windows, replies drawer, tracklist rows) and `frontend/mockup6.html` (the whole 800×820 card, replies panel, playlists pop-out); both are served by the dev server.

**Built 10 Oct (check on live after the deploy):**
- Spotify: ends-of-track hands over to the next track; seeking/clicking inside the Spotify embed no longer pauses it (`lib/playerGuard.js`, `TrackPlayer.jsx`). Still to confirm with a real album.
- Artist drawer: a track artist/remixer with no Discogs id on the post (Dixon) now finds his discography (`GET /api/discogs/artist-id?name=`, exact single match only).
- Shelf card: tracklist as rounded rows, title first then bold artists ("Title – **Artist**", also in spotlight rows); ☆/★ highlights per track (`track_highlights` table, `PUT/DELETE /api/posts/:id/tracks/:trackId/highlight`; your colour = accent gradient, the wall owner's/poster's = blue gradient, both = split); the post title or a short note (≤300) is "The post" quote, a description sits under it (all posts, old and new); reply box under the post with replies below it, newest first (`latestComments`, up to 6); footer: poster chip, main number, exact date + time, "Also posted by" chips, "In playlists" chips + pop-out (public lists only: `playlists.kind='list' AND on_profile=1`); replies side panel in the artist/label drawer style.
- Compose: short post (300 chars) by default, "write a full post" = title + description; **a new post needs a comment** (a line, or a title/description).
- Text sizes (one line each in `ShelfCard`, `Feed.jsx`): `trackText = 13` (track names), `textSize = 20` (comments, reply box, "The post" quote). Sleeve is back to 390 (card padding cut to `SHELF_PAD_Y = 44`).
- `timeAgo` now reads server UTC times as UTC.

**To do (gabriel, 10 Oct):**
- **Taste / recommendations database — a SEPARATE database file (decided 10 Oct), used alongside the music DB.** The music/catalogue DB is going to get very big and hard to maintain, so start the user-activity data in its own SQLite file from the beginning (attach it like the catalogue-split plan in `catalogue-scale-plan`, or open it as a second connection). What goes in: one `events` table (user, kind = highlight / play / skip / add-to-playlist / reply / post, post + track ids, time), plus per-user taste summaries; `track_highlights` is the first signal (consider moving it there). Purpose: the site's "algorithm" — suggest tracks from what people highlight and play, per wall. Decide: file name/location (`/var/lib/lnv/`, back it up with the nightly `lnv-backup`), what a privacy-safe event looks like, and keep it out of the music DB's backups so restores stay small.
- Confirm the star, the playlists chips, replies and the post time on live after the deploy; check a post with a title **and** a description, and a post with several replies at 20px.
- Playlist "In playlists" chip only shows public lists — decide whether shared-by-link lists should show too.
- The description text under a title is still 13px (`descSize`); decide whether to match the 15/20 sizes.
- Short post still to do: in the compose card, replies drawer polish on phone; phone feed was never touched.
- The earlier "9 Oct" list below still stands (auto-play through to the next post, jump-to-playing-post, pocket mode, Discogs OAuth, merge PR #9, etc.).

### Added 9 Oct (older — still valid)
**State:** `dedupe` / PR #9 holds everything from 7–9 Oct, committed and pushed, PR description current (no CI, auto-merge off). What was built, the decisions and how to test/revert: **`claude/2026-10-09-handover.md`**. Old cards: `?cards=old` / tag `pre-shelf-stack` / `claude/old-cards/`.

**⏹ Stopped — 9 Oct 2026.** Done since the 8 Oct note: Admin now shows artist/label names (not `#ids`); the Artists and Labels tabs include gabriel's own Discogs records, each row "N posts / M in catalogue"; the two Discogs lists show record counts on the profile and are private again (a start-up migration had made them public); the Discogs link is username-only with an optional profile-code check. Still running in the background: the playable check on the 214 records and ~260 queued catalogue crawls (Admin → Status).

**Hosting prepared 9 Oct (UpCloud London, Starter 4 GB / 2 CPU / 30 GB, €12/mo — Hetzner's cheap plans were sold out; doc + code; account made, trial not yet started):** step-by-step in `deploy/HOSTING.md`; `deploy/` has the Caddyfile, systemd service, backup + restore scripts; `backend/purge-posts.mjs` (dry-run by default; keeps the catalogue/caches/links/users, removes posts); `server.js` now has CORS from `FRONTEND_URL`, proxy trust and a clean shutdown in production; `frontend/.env.production` sets `/api`. gabriel's decisions: UpCloud; keep everything collected, purge the posts only. **Open:** dev accounts (5 users) — purge or keep? email provider (no sign-up confirmation in production without SMTP); off-server backup target (Storage Box?); merge PR #9 or deploy from `dedupe`.

**Bugs / ideas from gabriel, 9 Oct (evening):**
- **FIXED for posts 9 Oct (live) — artist drawer, Various / compilation / mix releases didn't show the artist:** a post row now names who is on it ("A, B, C +4", from `/api/posts/browse` `track_artists`, `PostRow` in `Drawers.jsx`). **Still open:** the Discogs *catalogue* rows (discography lists) of Various releases still show "Various" — needs the tracklist artists from Discogs, one release at a time. Original note: **BUG — artist drawer, Various / compilation / mix releases don't show the artist.** In the artist (and label) drawer's "On the feed" and discography rows, a release credited to "Various" shows no artist, so you can't tell who is on it. Needs a backfill: for posts, take the track artists (`post_tracks.artist`, or "Artist – Title" from the track name, as `/api/posts/browse` now does) and for catalogue rows (`discogs_catalogue`) the Discogs tracklist artists / credited names; then show them (or "Various — Artist, Artist, +N") on the row. Clarify with gabriel which drawer and row he means before building.
- **"For later" button next to the favourite heart in artist and label spotlights (gabriel, 9 Oct).** A bookmark so you can come back to a spotlight you'd otherwise lose when the feed moves on. Where saved items live is open — suggestion: a "For later" list on your profile (beside Favourite labels / Your artists / Your playlists) with a count, newest first, each row opening the artist/label drawer, and a way to remove it once done. Different from ♥ favourites, which feed "Your sound". Probably also wanted on channel spotlights and on posts; decide scope. Touches the favourites code (`favourites`/`favouritesApi` in `lib/collections.js`, `FavHeart` in the drawers/spotlights) and a new small table (`saved_for_later`: user, kind, name, created_at).
- **BUILT 9 Oct (live, `a28c6ef` + `40a8f3f`) — spend the unused YouTube units + Discogs first.** `services/spareQuota.js`: in the last 3 hours before the quota resets (midnight PACIFIC; counters now use `services/quotaDay.js`, fixing the UTC mismatch) it runs once per day, keeps a 200-unit reserve (`SPARE_QUOTA_RESERVE`), and searches in this order: (1) tracks people tried to play that only have a Spotify placeholder, (2) tracks of the Discogs lists (collection first), (3) live post tracks with no YouTube link; skips anything tried in the last 30 days (`spare_quota_tried`) and records over their 3 paid searches / breaker. Admin can run it: `POST /api/admin/spare-quota` with `{ "dry": true }` (count only) or `{ "force": true }`. `SPARE_QUOTA=0` switches it off. Log line in Admin: "Spare YouTube units: …". **Discogs first** (`services/discogsVideos.js`): when a release is opened (`/release/:id/track-links`), before a track search (`/youtube/search` with a release id) and before each spare search, Discogs' own `videos[]` are matched to the tracks (title + artist both must show, one unambiguous video, checked alive by oEmbed) and saved to `release_track_links` as source `discogs-video`, once per release per 30 days. Test: 25 collection records → 23 had Discogs videos, 15 tracks linked free. Still to do: look at the first real nightly run's log; consider a catalogue-wide Discogs-videos pass for the most-opened artists/labels; the old text below is the original plan.
- (original plan, now built) **Spend the unused YouTube units (gabriel asked 9 Oct).** Usage is far under the 5,000-unit day (8 Oct 1,004; 9 Oct 34 so far) and unused units don't roll over. Today `searchBudget.js` only rations (listening 70%, 3 paid searches a release, release breaker) and the gap sweeper's paid searches default to 0 (`GAP_SWEEP_YT_SEARCHES`). Build the "nightly spare-budget job" (the old step 4): a few hours before the quota resets, keep a reserve (~1,000 units for new posts / listening) and spend the rest, in this order: (1) tracks on posts that only have a Spotify placeholder or no link; (2) tracks on the Discogs lists; (3) popular catalogue tracks. Respect the per-release cap and the breaker; log each run in Admin. **First fix the day boundary:** our counters use the UTC date (`today()` in `youtubeService.js`, `gapSweeper.js`, `usageService.js`) but Google resets the quota at midnight Pacific (07:00/08:00 UTC), so between 00:00 and 07:00 UTC we think it's a fresh day while Google's is not — align the day to Pacific time first, or the job can overspend. Also keep the 30-day refresh (policy III.E.4) in mind for anything stored.
- **Post format — tweet-style (gabriel, 9 Oct; decided direction, not built).** The title + description form isn't right for every post. Direction: **one line by default** (about 300 characters, with a counter; Bluesky uses 300, X 280, Threads/Mastodon 500 — figures from third-party trackers), and a **"full post" option in the post window** (the current post title + long description) for album write-ups. **Comments under a post are also one line, and the most recent replies show under the post on the card; "view all" opens the comments drawer (side panel) with the full list of replies** (gabriel, 9 Oct). Decide how many to show under the card (2–3?) and whether a new reply bumps the oldest one out. The record, tracklist and links stay as they are. A short post shows its line as a quote on the card instead of an empty description area. **Mockups shown to gabriel 9 Oct (in chat only, not saved as a file — redraw from this):** (1) the card — the short post as a quote block in the description area, then the 2 newest replies (small initial avatar, bold name, one line, time at the right), then "View all N replies →" and "Reply"; (2) the post window — short by default (one box, counter "64 / 300", a "Write a full post" button and "Post"), and the full mode (optional post title + optional description, "Back to short post"); (3) the replies drawer — header "Replies · N on post 04", the post's line pinned at the top with an accent bar, replies one per row (bold name, time, line), "Show N earlier replies", and a one-line reply box with counter and "Reply" at the bottom. Cream drawer, red card, Barlow + IBM Plex Mono. **Still open (asked, not answered):** ~~2 replies on the card or 1/3?~~ ANSWERED 9 Oct: "a mixture of 1 and 2" — show 1 or 2 replies under the post (suggestion: 2 when they are short and fit, 1 when they are long or the card is tight; keep the card height steady). does "Reply" on the card open the drawer or reply in place? colours — cards change with the time-of-day theme, so use the card's own theme tokens. Also open: 300 characters; whether short posts get replies / "also" reactions. Touches `ComposeModal.jsx` (text fields), `posts` columns (`post_title`, `notes`), the card's description area, and the comments UI (`comments` table).

**Rotate the API keys (gabriel, 9 Oct):** `backend/.env` was open in the editor during a screenshot, so the Discogs token, YouTube key, Spotify client id + secret and Last.fm key/secret were visible in this session's transcript. Low risk, but rotate when convenient: make a new key/secret at each service, put the new values in the PC's `backend/.env` AND on the server (`/opt/lnv/backend/.env`, then `systemctl restart lnv`), and revoke the old ones. Don't screenshot `.env`. Also on the same list: the live `lnv_admin`, `lando` and `fab` passwords were shown once in chat — change them in the site.

**Player — gabriel, 9 Oct (bug + two features, nothing built yet):**
1. **FIXED 9 Oct (live; test it with a real Spotify embed + a YouTube track) — one thing plays at a time.** Cause: `lib/playerGuard.js` paused YouTube/SoundCloud iframes, but Spotify's embed is built by Spotify's API inside a wrapper, so it was never paused. Now Spotify controllers register with the guard (`registerSpotify`): any new player pauses them, and a play pressed inside a Spotify embed claims playback and pauses the rest. Original note: **BUG: only one thing may play at a time, whatever the medium.** Pressing play on a YouTube track while a Spotify track is open/"flipped" on a card ends up pressing play on the Spotify one (and/or both can run). Rule to build: one global "now playing" owner; starting any track (YouTube, Spotify, SoundCloud, Bandcamp…) stops/pauses the previous one first, and a play press only ever acts on the track that was pressed. Reproduce first: a card with a Spotify embed flipped open, then press play on a YouTube track on the same or another card.
2. **Auto-play through, in a logical order:** play every track on the record in order, then carry on to the next post in the feed, and so on. Related to the older "Play all / shuffle for the Discogs playlists" item (resolve each release only on its turn, free sources first) — build one queue that serves both. Skip tracks with no link; don't search ahead for paid YouTube links (see the 6 Oct credits notes).
3. **"Jump back to the post that's playing" button:** scrolls the feed to the card whose track is playing (and opens/highlights it); belongs on the queue/now-playing bar. Needs the playing track to know its post id.
Place: `Feed.jsx` (ShelfCard, `activeUrl`), `QueueBar.jsx`, the player/queue context.
5. **Pocket mode** (gabriel's idea, 9 Oct): a pull-out mini player / queue drawer, with a "pocket" button that opens a full-screen lock layer so a phone in a pocket makes no accidental presses. **Not** a screen lock: the screen stays on. Spec: only a few controls respond (play/pause, skip), ideally behind a slide-to-unlock handle; other taps ignored; swipe-back and pull-to-refresh off (`touch-action: none`, `overscroll-behavior: none`); keep the screen awake with the Screen Wake Lock API (or the phone locks itself and the embed pauses); pure black background (OLED saves battery), no animations, progress updated every few seconds. YouTube's embed rule: the player must stay visible and at least 200x200 px — so a transparent touch-blocking layer over it, never an opaque cover. **gabriel is reading YouTube's terms first** (developers.google.com/youtube/terms/required-minimum-functionality, plus the API Services Developer Policies) and will say what they allow: touch-blocking layer over the embed, background / audio-only play, minimum visible size. Don't build until he has. Honest limits: the screen is on (the main battery cost), the web can't dim the screen, and a deliberate power-button lock will probably still pause a YouTube embed. Goes with the one-track-at-a-time bug and the auto-play queue; the real screen-off answer is the phone app (Spotify / Apple SDKs).
4. **Compilation / Various-artists track rows: song first, then the bold artist** (gabriel, 9 Oct). Today a row reads "**Artist** – Title"; flip it to "Title – **Artist**" (artists and remixers stay bold, linked, comma-separated). Applies to the card track lines (`ShelfCard` row, ~`Feed.jsx` 1717, built from `shelfTrack`) and to spotlight / release-preview track rows (`rowArtists`), so the two look the same. Check long artist lists wrap cleanly after the title.

The complete list, in the order to take it (details are in the older blocks below):
1. **gabriel registers the Discogs app** (Settings → Developers → Create an Application; callback `http://localhost:3001/api/discogs-account/oauth/callback`) and puts `DISCOGS_CONSUMER_KEY` / `DISCOGS_CONSUMER_SECRET` in `backend/.env` → then build the **proper Discogs login (OAuth 1.0a)**: verified ownership, private lists, **sharing** the two playlists, and **write-back** buttons (＋ collection / ♡ want) — full plan in "Added 8 Oct" item 1. Never write with the site's own token (it is gabriel's account).
2. **PR #9: review and merge** to `master` (27 commits ahead; nothing from 7–9 Oct is on `master` yet). Decide squash vs keep; no CI to wait for.
3. **Hosting** (the 7 Oct note says Friday 10 Oct, but 10 Oct 2026 is a Saturday — confirm the day). Decide first, because imports now queue hundreds of crawls: the catalogue split (catalogue tables into their own SQLite file via ATTACH) and dropping `thumb` on giant catalogues — see `catalogue-scale-plan` in memory.
4. **API applications after hosting:** Bandcamp email (draft ready), YouTube quota (50,000/day; blocked on the 30-day refresh, legal pages, live site), SoundCloud (Artist Pro £6.25/mo), Apple (not researched) — "Added 7 Oct" items 2–5.
5. **Merge the `legal` branch**, gabriel fills the [blanks].
6. **Brand:** Waxopathy trademark search (gabriel); rename nothing in code until confirmed.
7. **Play all / shuffle for the Discogs playlists** — chain records one after another, resolving each release only on its turn (free sources first).
8. **Real-browser pass (gabriel):** spotlight changes (linked compilation artists, in-row "+ add to my feed", footer "view all"); a long description on #47/#48; pressing play in a Spotify embed (preview/full detection only fires on play); the new card, ♪ panel, compose button and Discogs screens on a phone (the phone feed was not touched); the Artists/Labels tabs and the Discogs drawer as gabriel sees them.
9. **Link work still open:** nightly job that swaps Spotify placeholders for YouTube links; the 30-day YouTube refresh; "playable coverage" numbers in Admin; stricter matching for very short titles ("Meftah – 7"); searches for compilation tracks should use each track's own artist (`post_tracks.artist` now exists); check links before posting in compose; label-page header; share links on profiles.
10. **Data:** older posts have no track artists until edited or swept; run the free source finder over the ~217 never-checked tracks (decision pending); two accounts can link the same Discogs username until OAuth.
11. **Small:** "+N" genre pill could open the genres drawer; unused `.lnv-compose-btn` rule in `index.css`; unused layouts in `frontend/mockup4.html`; Last.fm as a free match check (minor); theme-tinted glass question (unanswered).
12. **Before launch:** real-phone testing · email provider + domain mail · security pass + abuse controls · ★★ YouTube compliance audit + quota increase · backups, monitoring, rollback · hosting, domain, final name, purge dev data.

### Added 8 Oct (older — still valid)
**State:** `dedupe` / PR #9 holds everything from 7–8 Oct (shelf stack card, track artists, listening panel, compose button, Discogs lists). The old cards are one switch away: `?cards=old`, tag `pre-shelf-stack`, screenshots in `claude/old-cards/`.

**⏹ Stopped for the day — 8 Oct 2026.** Everything built today is committed and pushed on `dedupe` (PR #9, 15 commits, description up to date; no CI on it, auto-merge off). Shipped today: the shelf stack card (number, two-row genres, source chips, roomier description), track artists as bold links (feed card and spotlights), in-row "+ add to my feed" in spotlights, the "How do you listen?" panel with Spotify preview/full detection, the compose button riding with the first post, the old-card screenshots (`claude/old-cards/`), and gabriel's Discogs collection + wantlist as two private playlists (214 records for `treebeast`). **Running in the background tonight:** the playable check on those 214 records (~4s each), and a crawl queue of ~260 new artists/labels from them (Admin → Status shows it). **First thing next session:** gabriel registers the Discogs app and puts the key + secret in `backend/.env` (item 1 below) so the proper login can be built; then item 4 (check things in a real browser) and hosting (item 6 has the date question).

1. **Proper Discogs login ("Connect Discogs", OAuth 1.0a) — gabriel asked for this to be on the list.** Today the Discogs account is linked by typing the username (public lists only, `ownership: unverified`; optional profile-text code check). The login replaces that and unlocks the rest:
   - **gabriel registers a Discogs app** (discogs.com → Settings → Developers → Create an Application: name, website, callback `http://localhost:3001/api/discogs-account/oauth/callback`, later the real domain) and puts `DISCOGS_CONSUMER_KEY` / `DISCOGS_CONSUMER_SECRET` in `backend/.env`.
   - **Build:** request token → send them to `discogs.com/oauth/authorize` → callback → access token; `GET /oauth/identity` gives the username (so ownership is verified automatically). Discogs accepts the PLAINTEXT signature over HTTPS. Keep each person's token + secret on the server only (never the browser), with a Disconnect that deletes them. Tell people on the connect screen that Discogs gives the app full access to that account; we only use collection and wantlist.
   - **Then switch on:** reading private collections / wantlists; **sharing** the two playlists (blocked until verified); **writing back** — "＋ collection" / "♡ want" buttons on cards, spotlight rows and the Playlists drawer (`POST /users/{u}/collection/folders/1/releases/{id}`, `PUT /users/{u}/wants/{id}`, and the `DELETE`s), each also updating the imported playlist so the two stay in step. Never write with the site's own token (it belongs to gabriel's account).
   - Cheap step with no keys: "in your collection" / "on your wantlist" markers on cards and rows from the imported lists (read-only).
2. **Play all / shuffle for the Discogs playlists.** A queue needs a link per track, and a record has none until it's opened; chain records one after another, resolving each release only when its turn comes (free sources first).
3. **Discogs lists, loose ends:** the playable check runs ~4s per record (1,000 records ≈ 1h); imports feed each record's artists and labels into the catalogue crawl (a big wantlist queues hundreds of crawls — watch Admin → Status); unverified accounts can't share.
4. **Check in a real browser:** the spotlight changes (linked compilation artists, in-row "+ add to my feed", footer "view all"); a long description on #47/#48; pressing play in a Spotify embed (preview vs full detection only fires on play); the new card, ♪ panel and compose button on a phone; the Discogs dialog and drawer look.
5. **Track artists:** older posts have none until edited or swept; searches for compilation tracks should use each track's own artist (item 4 of the 6 Oct list is still open); run the free source finder over the 217 never-checked tracks (decision pending).
6. **Small:** "+N" genre pill could open the genres drawer; unused `.lnv-compose-btn` rule in `index.css`; unused mockup layouts in `frontend/mockup4.html`; Last.fm as a free match check (minor); hosting day (notes say Fri 10 Oct, which is a Saturday — Friday is 9 Oct).

### Added 7 Oct (older)
**State:** everything built so far is merged to `master` (PR #7, merge `1498046`). Next work starts from `master`. The `legal` branch (privacy/terms pages, reports) is still unmerged. Placeholder brand = Waxopathy (waxopathy .com / .co.uk / .uk / .org bought); the site is hosted on that for now.

1. **Hosting — gabriel does the server on Friday 10 Oct.** Plan agreed in chat: one small UK/EU VPS (SQLite needs a persistent disk and one always-on process, because the background jobs run inside the backend), Caddy for HTTPS, backend kept running automatically, daily backup of `backend/db/vinyl_crate.db` with a tested restore, Cloudflare for DNS, an email provider for verification/reset mail (not chosen yet). Claude writes the deployment steps as a doc once the choice is made.
2. **Bandcamp email — send it.** Draft (doc): https://claude.ai/code/artifact/5c188d13-d89c-44cd-af8b-0636149e9b0d . Fill [NAME] / [DOMAIN] / launch month / daily lookups. Bandcamp's API is for labels and merch-fulfilment partners only, so the email asks for guidance and any approved route; expect a no or a redirect. Send via the "contact us" link on their API page.
3. **YouTube quota application — apply once the blockers are done.** Draft (doc): https://claude.ai/code/artifact/d5078618-57ab-40b1-9361-1ae2fd74192b . Ask for **50,000 units a day** (about 500 searches; fallback 25,000). Blockers: (a) build the 30-day refresh — Google's policy III.E.4 allows non-authorized YouTube API data to be kept 30 days then refreshed or deleted, and we keep found links, titles and channel uploads longer (monthly `videos.list` batch, 1 unit per 50 IDs, about 400 units a month); (b) merge the legal pages with YouTube's ToS and Google's privacy policy linked; (c) site live at the final name; (d) check the real quota in Google Cloud (Quotas & System Limits); (e) screenshots. Do not claim compliance on the form until (a) is done.
4. **SoundCloud API.** Needs a SoundCloud **Artist Pro** subscription (£6.25 a month) to register an app. API terms (summary, read the full text first): session-only caching of their content, credit the uploader and SoundCloud with a visible link back to each track, no pages dedicated to one artist, no AI use, no "SoundCloud" in the app's name or domain. Rate limits are generous (only streaming is capped, 15,000 a day). Plan: subscribe month to month, register the app, add SoundCloud search as a step after Spotify, store only the track URL.
5. **Apple Music API — not yet researched.** To do: read Apple's terms; the full Apple Music API needs a developer token from the (paid) Apple Developer Program — verify the cost and requirements. A free alternative worked in a quick test without any key: the iTunes Search API returned a result with a link (30-second previews) — check its terms before using it.
6. **Merge the `legal` branch** (commit `01a7b3c`, no PR yet): gabriel fills the [blanks] (operator, address, email, hosting providers, report retention) and has the pages checked.
7. **Link work still to build:** step 4 = nightly job that swaps Spotify placeholders for YouTube links using only the spare budget and seeds from crawled channels; the 30-day YouTube data refresh (above); cache hit-rate and "playable coverage" numbers in Admin → Services; Bandcamp/SoundCloud/Apple use once access is granted; compose "check links before posting" (item 6 below).
8. **Last.fm** — answer: used for genre tags only (as a fallback when a Bandcamp/SoundCloud/Discogs page has none; in the gap sweep and when a post is resolved). Never for playable links. 13 calls on 6 Oct, cached 30 days. Could later add similar-artist or tag browsing, but nothing planned.
9. **How search and the database work** — full write-up (doc): https://claude.ai/code/artifact/b0141db9-18b1-44f9-a8b1-26d867430b89 .


### Next session — gabriel's list (6 Oct), in the order agreed
1. ~~YouTube savings~~ **built 6 Oct, uncommitted on `dedupe`**: `listen=1` → Spotify before paid search (compose unchanged), sweep paid searches default 0, play-through no longer searches ahead, misses cached 30 days. Still to do: the quota application.
2. **Finish duplicates:** commit `dedupe` when asked; Admin → Status line;
   watch the comber's first days (log lines "Duplicate comber: folded N").
   Also **two copies of the same release in one list** — gabriel saw it;
   he later said the duplicates were across label catalogues, which the
   comber covers; re-check whether any list still shows a pair.
3. **Bad matches:** "Meftah – 7" played a football highlight video
   (search `meftah|7`). Very short titles need much stricter YouTube
   matching (artist must appear in the video title, reject sport/highlight/
   news words, minimum score).
4. **Compilations ("Various"):** tracks aren't found because searches go
   out with no artist (`search||depart`). Use each track's own artist from
   the Discogs tracklist (`tracklist[].artists`) in `ReleasePreview`,
   `SpotlightCard.playTrack`, the gap sweep and compose.
5. **Tracks we can't find:** instead of "—", offer "Know where this is?
   Add a link" — the listener pastes a link, it's checked (platform +
   title), saved to `release_track_links` (source 'user').
6. **Compose: check links before posting** — show each track's link with a
   small preview / title from the platform and ask the poster to confirm.
7. **Infinite scroll** for artist and label catalogues (replace "Show 100
   more") — IntersectionObserver on the last row, `fetchNextPage`.
8. **Label pages:** gabriel: "not sure we need this larger track header
   (it's below in 'On the feed')" — **ask which header he means** (likely
   the top of the label drawer). There: label genre tags, the label's
   website, a profile if Discogs has one (`/labels/:id` gives `urls`,
   `profile`, `images`).
9. **Share links on profiles** — for your feed and for each playlist
   (copy-link buttons; playlists already have share tokens).

### Loose ends
- **⚑ SPOTIFY-FALLBACK** — revisit when the YouTube quota increase lands.
- **Placeholder introductions** (`PLACEHOLDER_INTROS`, Feed.jsx) — delete
  once real people match.
- **Channel ♥ numbers** (50 uploads, 1,000 subs, 1 year) — gabriel to confirm.
- Spotify search in the composer's cross-platform search.
- Playlist privacy (everything public for now).
- **Legal pages:** gabriel fills the [blanks] (operator, address, email +
  hosting providers, report retention) and gets them checked.

### Before launch
- Real-phone testing · email provider + domain mail · security pass +
  abuse controls (bot check, rate limits, admin ban/hide — reports now
  exist) · ★★ YouTube compliance audit + quota increase · backups,
  monitoring, rollback · hosting, domain, final name, purge dev data.

### After launch / bigger
- ★ Player on the go · phone app · fewer ads (several links per track) ·
  SEO + a page per post · venues/events (Ticketmaster) · radios.
- Profile pictures (keep the initial for now).
- More Community boards: DJs, labels, record shops.
- Label idea: "not on Discogs/Spotify" signal first (badge + admin list),
  then decide — rights, transparency, timing.

### Small open items
- Tidal playback in cards · live sets "where" field in compose · broken tab
  icon + page description · placeholder channel spotlight can go · unused
  files and leftover tables (10-03 §2).

### Future — record scanner for the phone app (added 9 Oct, gabriel: "a big USP")
In a record shop, point the phone at a record: see its details, listen, a link to Discogs and the price.
- **Identify:** barcode first (Discogs searches by barcode), then catalogue number read from the label/spine, then **our own cover matching**.
- **Cover matching, our own:** gabriel's decision — store **fingerprints (embeddings), not images**, tied to release rows; start with the releases already in our catalogue, not all of Discogs. A photo → same kind of numbers → nearest match = the release family; barcode/cat no. then picks the exact pressing.
- **FIRST: read Discogs's current API + image terms** (images may be restricted data — not verified). Do not collect anything until that is settled.
- **Pilot:** test on the 214 imported records with phone photos of the sleeves; measure how often the right one is top.
- **Price:** Discogs lowest price + number for sale (suggested prices need a connected seller account). Show as "from £X, N for sale", link to Discogs.
- **Listen:** the existing link pipeline. Start as a phone-sized web page with camera access.
- **Fingerprint crawler (gabriel, 9 Oct):** a slow background queue over every release we hold or crawl: fetch one cover, make the fingerprint, save it, delete the image at once. One fingerprint per distinct cover (pressings share sleeves), backs off when catalogue crawls are busy, "Fingerprints N of M" line in Admin → Status. Open: image model (local vs paid API) and VPS size. Build only after the Discogs terms answer; queue + Admin line may be built first with fetching switched off.

---
## Added end of 6 Oct
- `dedupe` is committed and pushed (`66131b1`: duplicate comber + YouTube savings). **No PR yet** — gabriel will say.
- Domains bought: waxopathy .com / .co.uk / .uk / .org (names.co.uk). Name still not final in code; trademark search is gabriel's. Renewals £22.99 / £38.99 — transfer registrar after ~11 months.
- Bandcamp API email drafted as a doc (https://claude.ai/code/artifact/5c188d13-d89c-44cd-af8b-0636149e9b0d); Bandcamp's API is label/merch-partners only, so it asks for guidance. Unused `findBandcampLink` in `bandcampService.js` could be deleted.
- **Next: get LNV hosted** (gabriel's next session), then YouTube quota application, then the TODO list above.

---
## 7 Oct — link database strategy (read before purging dev data)
- **Step 0 built, uncommitted on `dedupe`:** found links never expire (re-checked via free oEmbed after 90 days), one normalised track key, saved release links beat any search, Spotify placeholders saved as `provisional`. Tests passed.
- **Plan:** use the ~6 pre-launch weeks to fill the link database so launch is mostly cache hits. Search is only ~50/day; channel reads are 1 unit per 50 videos — seed by crawling label/artist channels from Discogs profile `urls` (step 1), not by searching.
- **BEFORE THE LAUNCH PURGE: KEEP `youtube_cache`, `release_track_links`, `yt_channels`, `yt_channel_videos`** (keyed by Discogs/YouTube ids, not users or posts). Purge everything else.
- Build order: 1 Discogs `urls` + channel reads · 2 source/provisional flag on every link + Spotify album step · 3 cat no./label in search, per-post cap (3), 30% budget reserved for new posts · 4 nightly upgrade/seeding job · 5 "Add a link". Also: cache hit-rate in Admin → Services; apply for the YouTube quota increase.

---
## 7 Oct (later) — where the link work stands
Pushed on `dedupe`: comber + YouTube savings (66131b1) · links kept for good, release breaker, query cleanup (a6404c5) · heading rows skipped (8411f8c) · Discogs profile links + channel adoption (5e25fa8) · Spotify album step + per-track fallback + unique link keys (0903678).

**Built, NOT committed yet — "Add a link":**
- `backend/services/trackLinks.js` + `routes/trackLinks.js` (`/api/track-links`: check, add, vote) + admin endpoints `/api/admin/link-submissions`.
- Gates: allowed sources only (YouTube video, SoundCloud track, Spotify track — Bandcamp can't be played yet) -> the link's real title (oEmbed) is compared with the track (`linkVerdict` in youtubeService): strong = live at once, credited "added by"; weak = pending (poster-only until 2 other people say right, or an admin approves); no title match = refused. 2 "wrong" votes take a live user link down; an admin's vote/approve/reject is final. 20 adds/day (5 for accounts under 3 days). A user link is never overwritten by a search or the Spotify step (`source = 'user'` guards).
- UI: `TrackLinkAdd.jsx` (AddLinkRow under tracks with no link; UserLinkNote "added by … · wrong link?"), wired into Feed.jsx (spotlight rows) and ReleasePreview.jsx; Admin -> Links tab. Checked in the browser; 42 backend checks pass.
- Found and fixed on the way: `trackKey` used a-z only, so Russian/Greek/Japanese titles all collapsed to "" and would have shared one cache row — now any script.
- Decisions I took (gabriel can change): pending links poster-only; 2 confirmations; the report/"wrong" vote is separate from the `legal` branch's report button (not merged here).

**Still to do (link work):** step 3 (per-post cap of 3 paid searches, 30% of the day reserved for new posts), step 4 (nightly job: replace Spotify placeholders with YouTube links, seed from channels), cache hit-rate + playable coverage in Admin -> Services, Bandcamp/SoundCloud API use once access is granted, compose "check links before posting" (TODO 6).
**Before the launch purge keep:** `youtube_cache`, `release_track_links`, `yt_channels`, `yt_channel_videos`, `yt_channel_urls`, `profile_links`, `profile_checked`, `release_spotify`, `track_link_submissions`, `track_link_votes`.

**Link health (7 Oct, uncommitted, with "Add a link"):** `backend/services/linkHealth.js` — a YouTube link whose owner switched embedding off (Theo Parrish "Second Chances": "Video unavailable") or that was removed is detected with the free oEmbed call (4xx = won't play), cleared from the post track and saved tables, and replaced by a Spotify placeholder (saved one, else the release's Spotify album via the new `services/releaseSpotify.js`, else one track search). Runs a moment after a post is saved/edited and as a daily sweep (300 links, every 30 days). Paid searches now send `videoEmbeddable=true`; crawled uploads are checked before use. First run fixed post #78 and #61. Track-key bug (non-Latin titles) fixed earlier today.

**Step 3 done (7 Oct, uncommitted):** `services/searchBudget.js` — listening may use 70% of the YouTube day (`YOUTUBE_LISTEN_SHARE`), new posts get the rest; at most 3 paid searches per release (`PAID_SEARCHES_PER_RELEASE`, counted in `release_track_links.paid`); the release breaker unchanged. Held tracks still get free steps + Spotify. **Next: step 4** — nightly job to swap Spotify placeholders for YouTube links using only the spare budget, seeding from channels; then cache hit-rate / playable coverage in Admin -> Services.
