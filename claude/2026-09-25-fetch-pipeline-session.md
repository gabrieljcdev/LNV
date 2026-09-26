# 2026-09-25 — Fetch fixes, links, edit/delete, in-card scrolling (Claude Code session)

Branch: `discogs-id-chain` → PR https://github.com/gabrieljcdev/LNV/pull/1
Handover this session started from: `claude/2026-09-25-fetch-pipeline-handover.md`
(saved alongside this file — the `claude/` docs it referenced were never on disk).

The planned fetch-pipeline build (local catalogue, step 1 onward) has **not**
started. This session went to live fixes gabriel found while testing compose
and the feed. Everything below is verified as noted; "live" = checked in the
running app (localhost:5173 / :3001), "API" = checked by calling the backend.

---

## First checks (from the handover)

| Check | Finding |
|---|---|
| 08-26 work | Was uncommitted. Committed as `89a408c`, PR #1 opened. |
| Stale git locks | `.git/HEAD.lock` + `.git/index.lock` (0 bytes, from 08-29) removed so commits work. `*.lock.stale*` files still there. |
| `backfill-discogs-ids.mjs` | Never run. Dry run showed correct matches; **not applied** — gabriel: existing posts are placeholders and will be stripped. Superseded by the Discogs matcher below anyway. |
| `GET /api/users/ADMIN:1` 404 | Not a bug. `:1` is Chrome's source-line suffix; Login.jsx probes `/users/ADMIN`, 404s, then creates the user. |
| Admin fallback in ComposeModal | Gone. Note `isAdmin()` only recognises `lnv_admin`, not `ADMIN`. |
| PostCard missing-key warning | `BOX.art` had no key. Fixed. |

---

## Fetch / compose

### YouTube
- **"Artist - Topic" channels**: suffix stripped; the auto-generated
  "Provided to YouTube by…" description is parsed for artists, release,
  label and year. Topic uploads are never classed as live sets. (API: post 40's
  link now matches Discogs release 35007170.)
- **Cover art**: was hard-coded `maxresdefault.jpg`, which 404s to a grey
  placeholder on older uploads. Now: Discogs cover when matched, else the best
  thumbnail YouTube actually has (Data API thumbnails / oEmbed `hqdefault`).
- **Pasted link lands on its track** in the tracklist (matched by cleaned title).
- **Discogs search terms cleaned** on every platform: `(feat. …)`,
  `(Official Video)`, `[Audio]`, ` - Topic` etc. removed (`cleanForSearch`).

### Discogs match validation (all platforms)
Discogs' top search hit used to be taken on trust ("Dj.Mc – Walk Ya Down"
became a 33-track DJ Revolution mixtape). `isPlausibleMatch` now requires:
title agrees with the release title or a track title (all distinctive words),
and the artist agrees with a release artist — or a track artist on "Various"
compilations. Generic words (DJ, MC, The…) don't count. No plausible match →
platform data only. (API: regression set of 7 links — 5 correct matches kept,
2 wrong matches now correctly rejected.)

### Bandcamp
- Bandcamp's oEmbed endpoint is dead (404 for every URL) — every Bandcamp paste
  failed. Now reads the album/track page: title, artist, full-size cover,
  tracklist + durations, release year, tags → genres, embed player id.
- Must use an **honest User-Agent** (`LNV/0.1 (+github url)`). A spoofed Chrome
  UA from Node trips Bandcamp's bot check (3 KB challenge page). Comment in code
  says not to "fix" this by faking a browser.

### Discogs links of any kind
`resolveDiscogsUrl` (discogsService) + `GET /api/discogs/resolve-url`:
`/shop/item/`, `/sell/item/` (marketplace listing → its release, 1 API call),
`/master/`, `?master_id=` (→ main release), `/sell/release/`, `?release_id=`,
locale prefixes. Cached. Compose uses it for any Discogs link that isn't a plain
`/release/`; the post stores the release URL, not the (expiring) shop URL.
Sold listing → readable error. (API: all variants tested.)

### YouTube links for the whole tracklist
- Compose bug: `backgroundYTSearch` read `discogsVideos` state right after
  setting it, so it never ran on a fresh fetch. Fixed (videos passed in).
- New pass 2: one **YouTube `search.list`** per track still empty, via
  `GET /api/discogs/youtube/search` → `searchTrackVideo` (youtubeService).
  - One query per track (old unused route tried up to 7 = 700 units).
  - Cached in `youtube_cache`: hits 90 days, misses 14 days.
  - Daily cap `YOUTUBE_DAILY_UNIT_CAP` (default 5000 units ≈ 50 searches),
    tracked in new `api_quota` table. Compose shows "DAILY YOUTUBE SEARCH LIMIT
    REACHED".
  - Accept only if title matches AND artist appears in video title/channel.
  - Compilations search with each track's own Discogs artist (tracklist now
    carries per-track `artists`; `RELEASE_SHAPE_VERSION = 2` refetches older
    cached releases once).
  - Also runs for platform-only tracklists (e.g. Bandcamp) and after picking an
    alternate release. Stops if the tracklist is replaced; never overwrites a
    hand-typed URL.
  (API: Jabberwocky's A and B2 found — B2 via the "Peter O - Topic" channel.)

### Compose saves the Discogs release
Compose only ever sent `discogs_id` for pasted discogs.com links, so
YouTube/SoundCloud/Bandcamp posts that matched Discogs were saved without it
(posts #40–#44). Now sends `discogs_id` + release URL for every platform.

---

## Feed / post card

- **Click album art → plays track A** (first track with a link, else the post's
  link), same flip/highlight as clicking the row. (live)
- **SoundCloud and Bandcamp posts start flipped** to their player (SoundCloud
  `visual=true`, Bandcamp large/minimal embed from the saved `embed_url`) —
  the player shows the artwork. (live: #43 SoundCloud, #44 Bandcamp)
- **Badges are links**:
  - platform badge → whatever is playing (B2 open on YouTube → YOUTUBE opens B2);
    label/colour follow the playing platform;
  - `◈ DISCOGS` → release page, or a Discogs **search** (artist + title) when
    no release is matched yet — shown on every non-live-set post;
    (previously gated on `post.source`, a field posts don't have, so it never showed)
  - `BUY ↗` → Discogs marketplace for the release, or the Bandcamp page.
  - Old "↗ discogs / ↗ youtube" text row removed (duplicated; YT one sometimes
    linked the embed URL). (live)
- **"Various" isn't an artist**: excluded from artist spotlights, the artists
  index (`GET /api/artists`), and not clickable to the artist drawer. Still
  shown on the post (gabriel's call: compilations post as the compilation).
- **Spotlight duplicate keys** (console flood): Discogs lists a release once per
  artist role. Backend merges by type+id (roles joined); frontend dedupes and
  keys `type:id` (covers old cache). Masters no longer count as "on site".
- **Edit / delete post** buttons in the byline, author only (or `lnv_admin`):
  - Edit = ComposeModal in edit mode (pre-filled, PATCH, re-fetch allowed).
  - Delete = confirm → DELETE.
  - Backend `canModify` check on PATCH/DELETE (403 otherwise). PATCH now also
    replaces artists/labels/genres/tracks and accepts `discogs_id`/`discogs_url`.
  - **SQLite `foreign_keys` is off**, so the schema's ON DELETE CASCADEs never
    fired — delete now removes child rows explicitly (post_artists, post_labels,
    post_genres, post_tracks, comments, spotlights).
  (API: 403s for other user / no user; author edit + delete; zero orphans. live:
  buttons + pre-filled edit form.)
- **Post description** was saved but clipped by the fixed-height card.

### In-card scrolling (description, tracklist, comments)
- Description takes only the space left, scrolls in place, fades until the end;
  long notes keep ≥3 lines. Line breaks preserved, long words wrap.
- Tracklist shows **all** tracks (was first 6 + "+N more"), scrolls when needed.
- Comment list already had a scrollbar but the wheel never reached it.
- `useScrollFit` / `fadeMask` / `INNER_SCROLL_STYLE` in Feed.jsx; boxes opt in
  with `data-inner-scroll`. LayoutProvider's wheel handler lets such a box take
  the wheel while it can move that way; at its edge the wheel goes to the feed.
- **Removed the legacy inline scroll script in `frontend/index.html`** (initial
  commit). It had a `document` wheel listener that `preventDefault`ed every
  wheel with its own momentum, and every frame rewrote `#lnv-strip` /
  `#lnv-drawer` widths, `#lnv-brand` / `#lnv-tabs` opacity and
  `#scroll-inner.scrollLeft` — all owned by LayoutProvider now. Nothing in
  `src/` used its globals. **Possibly the root cause of the long-open "feed
  scroll feel" issue — needs gabriel's live check with a real trackpad.**
  (Verified by synthetic events; the pane was hidden so no real-wheel test.)

---

## Spotlight redesign — Studio PIC index (late session)
Reference: awwwards.com/inspiration/list-and-grid-view-studio-pic. gabriel
chose "strip on top, list below".
- **Header**: name at 34px with the catalogue count in superscript
  (`Nina Kraviz [248]`), spotlight tag + small mark image.
- **Sleeve strip** (240px): every sleeve drifting left in an endless loop
  (`@keyframes lnv-marquee` in index.css, duration = 6 s per sleeve, min 30 s),
  pauses on hover, off under prefers-reduced-motion; click a sleeve → opens its
  row and scrolls the list to it (list scrollTop, not scrollIntoView).
- **Index list**: no · title · label/role (artist on label spotlights) · catno ·
  year; accent dot = already on LNV; click → inverted row + tracklist. Track
  click → player opens directly under that track (autoplay). Channel uploads
  and own posts without a tracklist (live sets) open straight into their
  player. Subjects with no catalogue list their own LNV posts the same way.
- **Track links saved**: new table `release_track_links (release_id, position,
  title, youtube_url, youtube_title, source, fetched_at)`. A track-click search
  (and compose's track search) saves its result — found or not — against the
  Discogs release + position; `GET /api/discogs/release/:id/track-links` loads
  them when a row opens, so tracks play instantly and known misses show "—".
  Misses retried after 14 days.
- **Full-size covers**: list thumbs are 150px and signed. `GET
  /api/discogs/covers?keys=release:ID,master:ID` returns cached 600px covers
  now and queues the rest (1 Discogs call / 2 s, cached forever); the card
  re-asks every 5 s while any are pending. (Verified: 12/12, 18/18, and a 25-
  sleeve strip filling in.)
- Release lists now keep artist / label / catno / format (cache keys bumped to
  `artist-releases:v2:` / `label-releases:v2:`). Only page 1 (25) of a
  discography is listed even when the count is larger.
- Not seen live by me (pane hidden): the strip's motion and row fades —
  gabriel to eyeball.

## Search fix + album play-through (after the spotlight push)
- **Typing "38" broke the page**: a no-match search left the view stranded
  past the end of a now-empty shelf. (1) The "No results" panel was `flex: 1`
  after a viewport-wide intro, so it was ~40 px wide just off-screen — now a
  card-width panel. (2) The reset-on-new-results wrote `feedRef.scrollLeft`
  during render, which LayoutProvider's ticker overwrote every frame. Now an
  effect, only when the SEARCH text changes (never the 30 s refresh), calls
  `driveFeedScroll` to the first result / no-results panel, or 0 on clear.
  (Removing the render-time ref write also dropped Feed.jsx lint 7 → 5.)
  Noted, not fixed: `/api/posts?search=` returns the unfiltered `total`.
- **Album play-through**: `TrackPlayer` (Feed.jsx) wraps the embed; for YouTube
  it adds `enablejsapi=1` and attaches the official IFrame Player API (loaded
  once) to detect ENDED. PostCard: track/art clicks autoplay, and on end the
  next track with a link plays. Spotlight: `playNextFrom(i)` plays the next
  linked track, searching unknown ones on the fly (≤3 searches per step,
  known misses skipped). Verified: Jabberwocky post A ended → B1 played
  (seeked to 2 s before the end, muted). YouTube only — SoundCloud widget API
  possible later; Bandcamp has no end event.

## 2026-09-26 — card redesign exploration, live-set card, spotlight masters
- **Mockup** `frontend/mockup.html` (dev-only, untracked): real posts in
  candidate templates (A sleeve hero, B back cover, C record out, F pull
  quote, G wide set), size (full/medium/compact) and scroll (glide/snap/
  vertical) switches. gabriel's calls: floating cards with space between
  and a mix of post types appeal; the description must be prominent on
  every card; no crate spines; G (live set) approved as-is. The feed's
  full-height cards + vertical-wheel-to-sideways glide read as
  disorienting ("sea sick") — Medium + Snap was the suggested direction;
  not built into the feed yet.
- **Live-set card (shipped)**: `LiveSetCard` in Feed.jsx, used for posts
  typed livemix OR with set-like titles (`isLiveSetPost`). Wide 16:9
  screen (play → autoplay embed via TrackPlayer; video id falls back to
  the cover thumbnail's for old link-less posts), name + set line at the
  regular card's sizes (DESIGN_BASE artist/title, 30px), post description
  with the same label/size/in-card scroll, quiet byline (replies, poster,
  time, edit/delete via the new shared `usePostActions`). Padding: the
  regular cards' 120px top/bottom; 56px each side. The video height is
  min(1088-wide 16:9, what fits after padding + text), and the card width
  = that video's width + 2×56, so tags/year/edit sit flush with the video.
  Ink picked per card from its background colour.
- Tried and reverted: media-on-top for plate-bottom cards (gabriel: "no
  that doesn't work").
- **Spotlight masters fix**: an artist's Discogs list is ~⅓–⅔ masters; a
  master id fetched as a release is an unrelated record (Buck Bumble OST →
  "The Throne Of Drones"). Masters now resolve to their main release for
  the tracklist, saved links and "+ add to feed" (master URL).

## 2026-09-26 (later) — album card, floating cards, uniform sizing
- **AlbumCard** (posts with > 6 tracks, `isAlbumPost`): same width, padding
  and type tokens as the regular card (all read from `d`). Top row: sleeve
  (390px, rounded 40) with the post description beside it; bottom row:
  badges / artist / title / metaline with the big 180px numeral under them
  ("lower orientation" numeral) | two-column tracklist. Sleeve/track click
  plays in place with play-through. Tried and dropped along the way: the
  record peeking out of the sleeve, a top-right numeral.
- **Inverted (plate-bottom) regular card retired**: both rotation slots
  (`v0:album`, `v1:album`) are plateBottom:false. Code paths kept, unused.
- **Floating cards**: every feed card sits in `FloatSlot` — rounded 14px,
  layered shadow (`FLOAT_SHADOW`), `FLOAT_GAP` 28px between cards,
  `FLOAT_INSET_Y` 14px above/below (cards 872px tall on a 900px screen).
  Cards' internal padY is 32 (DESIGN_BASE, was 120). Surface: white with
  a 22px dot grid (`FEED_SURFACE`, `FEED_DOT`) that stays put while cards
  scroll over it. FeedGap two-tone seams removed. Tried and dropped: CSS
  zoom scaling, plain white, a per-card contrasting palette underlay
  (parked — gabriel will revisit the surface).
- **Uniform sizing**: art 390px on single and album cards (one `artSize`);
  every card type shares the same height; live-set card keeps its width by
  sizing its video from the old 88px inset (`LIVE_VIDEO_INSET_Y`). Live
  video and album sleeve rounded to `artRadius` (40), like post-card art.
- `useCardInk` shared by LiveSetCard/AlbumCard (text colour per card bg).

## Backend: Discogs matcher (new)
`backend/services/discogsMatcher.js`: posts with no `discogs_id` (not live sets)
are looked up with the same `tryDiscogsLookup` + plausibility check — after
each new post, 10 s after startup, then hourly. Each unmatched post is retried at
most daily (`posts.discogs_checked_at`, new column). 8 s between posts (≤ ~45
Discogs calls/min). First run matched 6 posts (spot-checked correct: Nina
Kraviz "Different Nicky", Mr. Fingers "Introduction"). Precursor to the plan's
enrichment worker (step 3), which should replace it.

## Schema changes (auto-migrations in `db/database.js`)
- `api_quota (provider, day, units)` — daily API spend.
- `posts.discogs_checked_at TEXT`.
- (from 08-26) `youtube_channel_cache`.

## Files
backend: `db/database.js`, `routes/{artists,discogs,media,posts}.js`,
`server.js`, `services/{discogsService,youtubeService}.js`,
`services/discogsMatcher.js` (new).
frontend: `index.html`, `src/components/{ComposeModal,Feed}.jsx`,
`src/context/LayoutProvider.jsx`.

`backend/routes/media.js` line endings: the committed file had mixed CRLF/LF
(from the 08-26 work); committed consistently CRLF (staged with
`core.autocrlf=false` so autocrlf wouldn't flip the whole file to LF).

Verification throughout: `node --check` on backend files, `npm run build`,
eslint — no new errors (pre-existing: 7 `react-hooks/refs` in Feed.jsx,
unused `extractYTId` in ComposeModal.jsx, 2 in LayoutProvider.jsx).

---

## Open / next

**Needs gabriel live**
1. Feed wheel/trackpad scroll feel + rail collapse animation after removing the
   index.html script.
2. Scroll inside a long description / tracklist / comment list.
3. Paste a Discogs shop link, a Bandcamp album, a Topic video, a V/A release.
4. Edit + delete on own posts.

**Decisions pending**
- **BPM + key — DROPPED (gabriel, 2026-09-25: "not necessary")**. Also looked
  at and rejected: MusicalKeyCNN (MIT, key only, ~66.7% on GiantSteps) + QM Vamp
  tempo/key plugins via Sonic Annotator (GPL, run as a separate program) —
  would have needed PyTorch + Sonic Annotator installs. Earlier notes: only worth doing from free,
  simple outside data; no audio analysis. Options found: Deezer's `bpm` field
  (free, keyless, but filled for only 3/9 test tracks, no key) and GetSongBPM
  (free API with BPM + key; needs gabriel to register a key and a visible
  attribution link; coverage of underground releases untested). If revisited:
  put the key in backend/.env and test coverage against the feed first.
  Earlier choices if it's ever built: auto + editable, Camelot (8A), per track row.
- Make `ADMIN` an admin too (currently only `lnv_admin` can edit/delete others'
  posts)?
- Rail placement for search + post button (from the handover) — unanswered.

**Known gaps**
- Bandcamp buy link for releases pasted from other platforms, and Spotify/Apple
  cross-links → MusicBrainz step (plan step 4).
- Post type still uses the old heuristic (e.g. HÖR sets #30/#31 stored as
  "album") → plan step 5.
- SoundCloud/Bandcamp players load on feed load (fine now; lazy-mount if many).
- Housekeeping: `_to_delete/`, `_verify4.tar.gz`, `Feed.jsx.orig_backup_for_lint`,
  `.git/*.lock.stale*`, `SecondaryStrip.jsx`, `PLACEHOLDER_CHANNEL_POSTS`.

**Fetch-pipeline plan (unchanged, not started)**: catalogue tables + seed →
url_index/local-first `/resolve` → lazy alternates → queue worker/buckets →
MusicBrainz cross-links → type detection + compose rework → spotlights from the
catalogue. See the handover doc.
