# TODO: what still needs attention (cleared of finished work on 23 Oct 2026)

Only open items are listed here. Everything finished lives in the handovers and git history: `claude/2026-10-22-handover.md` (22 Oct arc), `claude/2026-10-23-domain-and-email.md`
(domain move and email), and the old date-layered notes in `claude/2026-10-06-late-handover.md` ("archive" below). Items marked **(check)** were written down earlier and not re-verified.

## 0. Where we are
- **Live on chewingtheceiling.com at `1d574bd`.** The .co.uk, the www names and waxopathy.com redirect to it. Nothing is waiting to be deployed.
- **Email sending works (Resend) but lands in junk; receiving (`hello@`) is not set up.** Details in section 1.
- Rules in force: **research only** (nothing recorded ever picks what people hear or see), **opt-in** recording, **ids and slugs only**, **YouTube API data never kept past 30 days**,
  the site **connects people, it never recommends tracks**, and no word "wall" in the interface.
- Your uncommitted `frontend/src/lib/moduleKit.js` ("heat vision" sweep) is yours: never commit or stash it. Never `git stash` here.

## 1. What you need to do (only you can)
0. **Left strip: pick this up later (gabriel, 23 Oct: "not quite").** LIVE at 3e45cdb: the wordmark is flush left at the pills' 5 px gap and sized to the room under the last tab (up to its old 72 px; hidden on a screen under about 640 px tall; 43 px at 768 tall); the round buttons are a second column on the right (play, bell, playlists, admin, new post, a ⋯ menu with search / choose a feed / how do you listen / theme, then your initial); pills a little shorter. What is not right is not yet said: ask gabriel what to change (wordmark size at his screen height? chip order? the ⋯ contents? pill lengths?). Mock-up to compare or adjust: frontend/mockup50.html; the real code is Strip.jsx (MoreMenu, the #lnv-chips column, the fit effect).
1. **Junk mail:** (a) Resend → Domains → chewingtheceiling.com → Configuration: turn OFF open tracking and click tracking; (b) mark the email Not junk, add `no-reply@chewingtheceiling.com` to safe senders, reply once; (c) send Claude the `Authentication-Results` and `X-Microsoft-Antispam` lines from the junk email (Outlook ⋯ → View → View message source). Then Claude adds a Reply-To, a root SPF record and, after about a week of clean mail, tightens DMARC from `p=none`.
2. **Set up the `hello@` mailbox** (Zoho free, webmail only; fallback names.co.uk forwarding): steps 4 in `claude/2026-10-23-domain-and-email.md`. It replaces the default `fwd0/1/2.hosts.co.uk` mail rows at names.co.uk. Needed for the contact page and the legal pages (`privacy@`, `support@` as aliases).
3. **Look at the live site signed in, in a real browser** (this tool's pane cannot show real layout or scrolling): the bell, Your data, Hide, For later, found-via and tag chips, compose's link check, Admin → "Playable coverage", the Admin drawer opening (was black the first time), the five card fixes (spotlight survives a new post, "my feed" keeps your place, playlist rows readable, obvious highlights, Spotify filling its box), the new sign-in window (tour, where you listen, Discogs), Sign out. Tell Claude what looks wrong. The tour wording is Claude's: please read it.
4. **Remove the stray test data you do not want** (the `turbopothead` account if it was only a test).
5. **Decide what to do with the waxopathy domains** (renewals are about £23 for the .com and £39 for the .co.uk): let them lapse, or keep the .com so nobody else gets it. Switching off auto-renew is at names.co.uk.

## 2. Decisions waiting on you
| Question | Why it matters |
|---|---|
| **Post numbers in your own feed**: numbers should count only your own posts (1, 2, 3 of yours). What does a friend's post show instead: **no number** (suggested) or its site-wide number? | Not built until you answer |
| **Group feeds**: a visibility on posts (public or group), or lighter shared items? | Biggest social feature still unbuilt (archive: Added 10 Oct) |
| **Discogs OAuth**: register the Discogs app, put `DISCOGS_CONSUMER_KEY` / `SECRET` in the server `.env` | Unlocks proper "Connect Discogs" instead of typing a username |
| **Theme palettes**: which times of day looked wrong? Measured: **Evening** is worst (text on its orange 1.7:1, showcase colour 1.7, accent 2.6); **Deep Night** and **Pre-dawn** showcase colour 1.5 and 1.3 on the background; Late Evening white on accent 4.0; Midday text on `dark3` 4.0; the others pass. The colours are your design choices | Evening is the obvious one |
| **"Protect passwords"**: did you mean the list below under Passwords and sign-in, or something else (protecting accounts from other people)? | Scope |
| **Canary records**: which fake posts to seed | Catches bulk copying of the data |
| **Page `/posts/browse`** | It returns 46 KB at 69 posts, about 100 times that at 7,000; changing it changes what the drawers receive |
| **Remove the rejected card variants** (about 1,200 to 1,500 lines, 25% of `Feed.jsx`) | Module is the default; blocks, notes, paired, shelf/old are flag-only. They stay in git history and the `pre-shelf-stack` tag |
| **Make the Module card the default?** | Waiting on your say-so (archive: Added 14 Oct) |
| **Research wording**: "the defining factor" or "a strong distinct signal"? Which acts count as labels? First opted-in group? | `claude/2026-10-22-research-programme.md` section 7 |
| **Which label header** did you mean by "not sure we need this larger track header"? (label drawer top?) | Then add label genre tags, website, profile |
| **Brand**: the wordmark box on the sign-in pages is blank until you give the wordmark; trademark search for Chewing the Ceiling is still undone | Do not invent the brand |
| **"View as feed" for a playlist** shows only tracks that came from posts: add a small card for tracks that did not, or leave it? | Small |
| **Hide**: just the post, or also mute the person? Should hiding a ♥'d entry leave your public feed? **Playlist "In playlists" chip**: should shared-by-link lists show, not only public ones? | Small |

## 3. Bugs and loose faults
1. **Emails land in junk** (section 1).
2. **Phone layout**: the spotlight fix, the feed paging load-ahead, the new sign-in window and everything else done in the last two days were desktop only and never tried on a phone. Real-phone testing is also a launch blocker.
3. **Hide button** is missing on the one card variant whose heart is a styled pill; **Hide on the older card variants** was added by script and only tried on the live card.
4. **Chips on cards**: found-via and tag chips on every card variant, and the **@-picker** in compose, were never exercised in a browser (the compose note box only appears after a link has been looked up).
5. **"Wrong link? change it"** row under the playing track was never exercised in a browser.
6. **The shelf shifts one card** when a post is added at the front (the same as before; not compensated).
7. **Server log:** confirm "[comber] Failed to fetch release … 404" has stopped (fixed 23 Oct); older YouTube matches saved before the stricter short-title rule are not re-checked.
8. Live admin account's display name in the database is still "Late Night Vibes"; `deploy/HOSTING.md` and the old notes still use the old names.

## 4. Build next
### Passwords and sign-in
- **Show / hide button on the password boxes** (sign in, create account, reset password): an eye or "show" toggle, off by default. Login page: `frontend/src/pages/Login.jsx`.
- **Protect passwords** (my reading, to confirm above). Already there: salted scrypt hashes, hashed session tokens, 20 tries per 15 minutes per address on the sign-in routes. To add: a minimum length (8+, 10 better) and a check against very common passwords (optionally the free Pwned Passwords range check); a slow-down or short lock after repeated failures on one account; reset links that expire (about an hour) and work once; a message that does not reveal whether an email has an account; a clear way to change the password when signed in; never log passwords or reset links in production; an alert email for a new device (optional); two-step sign-in later.
### Player and listening
- **One global player** that pops out and never stops; queue from anywhere ("add to queue / play next"); playlists open in it; play-through to the next record; jump back to the playing post; pocket mode (archive: NEXT WEEK item 1, and "Player" in Added 9 Oct).
- "Play all / shuffle" for Discogs lists (resolve each record only on its turn, free sources first).
- Starting a track anywhere closes every other open player (Spotify was fixed; re-check everything).
- **"Listening to now"** box on someone's profile, with a play-it-too button. Needs the opt-in rules first.
### Links and playback
- Nightly job seeded from crawled channels (step 4 of the 7 Oct link plan); "Tracks with nothing to play" are only counted, not chased; Tidal links in cards; Last.fm as a free match check (minor).
### Feed and cards
- **Highlights panel at the start of someone else's feed** (gabriel, 24 Oct): when you open another person's feed, the first card is a "Highlights" panel: a playlist of every track highlighted (the star) in that feed, in order, each row with a **jump to post** button that scrolls the feed to the post it came from. Play all / shuffle on the panel (reuse the queue player: lib/queue.js, and the playlist rows in CollectionDrawers.jsx). Needs: a backend endpoint that lists a feed's highlighted tracks (track_highlights joined to post_tracks and posts, for a wall/feed owner) and a front-end panel slotted in like the profile card (WallCard) at the head of a wall feed. Open questions: whose highlights count (the feed owner's only, or anyone's on those posts, which is what the cards show now); order (newest post first or feed order); show nothing when there are none; also offer it on your own feed?
- **Add to a playlist from the compose window**, applied only when the post succeeds (15 Oct).
- **A whole playlist as one card** in your feed (10 Oct).
- **Post format**: one-line (about 300 characters) by default is built; decide what is left (9 Oct).
- Card text tidy-ups: take the poster's name/date out of "The post" header etc. (10 Oct); post number as a solid circle (12 Oct).
### Catalogues and search
- "+N" genre pill opens the genres drawer. Label pages: genre tags, website, profile (after your answer above).
- Add-a-label leftovers: labels on their own domain (only `*.bandcamp.com` works), a year for Bandcamp releases, a missing cover.
### People and community
- **Send a track to a friend**, controlled by the receiver (10 Oct).
- **Group feeds** (after your decision); a **feedback / "bluepost" button** for testers (10 Oct).
- **Edit-profile review**: the profile screens grew piece by piece (10 Oct). Profile pictures later.
- More Community boards (DJs, labels, shops). More notification kinds as needed.
- Privacy check end to end with two accounts: visitors see only your posts, not your friends' (14 Oct). Now there are accounts to do it with.
### Accounts and imports ("Connect your accounts", 15 Oct)
- One connection framework (read-only, on request, disconnect deletes tokens), then one platform at a time: **Discogs first, then Spotify**, YouTube, SoundCloud, Apple, Last.fm, Bandcamp by pasted URL. Details: archive Added 15 Oct.
- Import a Spotify playlist (10 Oct); Discogs list loose ends (the playable check is slow, imports queue crawls).

## 5. Before anyone but you is switched on, and before launch
- **Words**: rewrite the About, the welcome and a privacy notice (they still say "Nothing learns from you"). Merge the `legal` branch (`01a7b3c`; you fill the [blanks], using `privacy@chewingtheceiling.com` once it exists).
- **Legal**: solicitor reads the notice; a DPIA (profiling); ICO fee; an age limit; register as a company (archive: Register as a company, 10 Oct).
- **Sign-in details at rest (23 Oct, gabriel asked "save the log in credentials in a db and encrypt it"):** they are already in the database (users table: email, password_hash; sessions hashed). Passwords are HASHED (salted scrypt, one-way), which is stronger than encrypting them, so they must stay that way. To add: (1) **tighten file permissions**: on the server the database files in /var/lib/lnv (vinyl_crate.db, activity.db and their -wal/-shm) are world-readable (rw-r--r--) and the folder is 755: make them 640 and the folder 750, owner lnv (needs a go-ahead; the backup runs as root so it still works); (2) **encrypt the backups** and keep a copy off the server; (3) **encryption at rest** for the database (full-disk encryption at UpCloud, or encrypt the email column with a key kept outside the database); (4) email addresses stay readable because the site must send mail to them: limit who can read them.
- **Data safety**: off-server backup (backups sit on the same server today), UpCloud panel firewall (22/80/443), SSH hardening, encryption at rest for `activity.db` and backups, an access log, a breach plan (72 hours).
- **IP**: the repo is public on GitHub: make it private with a deploy key; notices; trademark search for the name.
- **API applications** once the site is steady: **YouTube quota** (50,000 a day; needs legal pages, the 30-day refresh is done), Bandcamp (draft email ready; wait for a better working version), SoundCloud (Artist Pro), Apple. Re-read Spotify's developer policy (reported ban on ML training) and Discogs' stored-data terms.
- **Rotate the API keys** (9 Oct: `.env` was visible in a screenshot). Error monitoring and a rollback plan.
- Merge `dedupe` / PR #9 to `master` when you say so (nothing from 7 Oct on is on `master`). Open a PR only when asked.
- Server `.env`: `RATE_LIMIT_MAX=1000000` overrides the 6000 read limit (remove the line to use the default); a stray `.env.bak-ratelimit`, `.env.bak-before-domain` and `/etc/caddy/Caddyfile.bak-waxopathy` can go once you are happy.
- Before the launch purge, keep `youtube_cache`, `release_track_links`, `yt_channels`, `yt_channel_videos`, `yt_channel_urls`, `profile_links`, `profile_checked`, `release_spotify`, `track_link_submissions` (archive: 7 Oct).

## 6. Performance and memory (details: `2026-10-22-performance-audit.md`, `2026-10-22-memory-report.md`)
- All cards are mounted for about one on screen (about 14,700 elements): **window the feed** using remembered widths. Never `content-visibility` on whole slots. Check real scrolling in Chrome DevTools.
- Discogs covers are about 85 MB of the 88 MB decoded at start: a **server-side resize-and-cache proxy** (check Discogs image terms first).
- Sweep (`?sweep=1`, your `moduleKit.js`): only touch boxes near the viewport, skip for reduced motion, one custom property per box. Do not commit your edits for you.
- Batch per-post lookups (`getFullPost` is about 10 queries each); trim the 7 KB per-post payload.
- Comber: read in slices past about 1M rows. One shared MutationObserver instead of 77. 9 old lint problems (BrandScaleTool, Dialogs, `Feed.jsx` escapes). No tests for the scroll lock, progressive mount or indexes.
- Server unit edits (need a go-ahead): systemd `MemoryHigh` well above 1.5 GB; `--heapsnapshot-signal=SIGUSR2`.

## 7. Check back on
- **Memory in Admin → Status, about 26 Oct** (3 days after the 23 Oct restarts): at 13 h it was 189 MB program memory, heap 15.4 MB, +17 MB a day, too early to call (the first day always climbs while SQLite and the caches fill). A leak is program memory still climbing after day 3 with the heap climbing too, or passing about 300 MB.
- Admin Status, "YouTube 30 days": the first runs are a catch-up (up to 2,500 units a day). Admin, "How people move", after using the site as `lnv_admin`.
- The comber's duplicate folding (log "Duplicate comber: folded N") and whether any list still shows a pair of the same release.

## 8. Ideas, not started
- Spotlights as a crate of vinyl spines (11 Oct); the vertical-bands and cascading-drawers card ideas (12 Oct; bookmarked).
- Genre/style connection graph in the taste database (11 Oct); the research programme (`2026-10-22-research-programme.md`).
- **Record scanner for the phone app** (9 Oct): barcode first, then catalogue number, then our own cover fingerprints. First read Discogs' image terms; collect nothing until then.
- Player on the go, a phone app, "fewer ads" (several links per track). A label "not on Discogs/Spotify" signal; a Community board per record shop.

## 9. Loose ends (small)
- Placeholder introductions (`PLACEHOLDER_INTROS`, `Feed.jsx`) to delete when real ones exist. Channel ♥ thresholds (50 uploads, 1,000 subscribers, 1 year) to confirm.
- Spotify search in the composer's cross-platform search. Playlist privacy (all public for now). Unused `.lnv-compose-btn` rule and `mockup4.html` layouts.
- Mockup files and `claude/2026-10-11-card-round2.md` and `2026-10-12-notes-card.patch` are untracked on purpose.
- Working notes (hard-won): lint with `npx eslint` in `frontend/`; edit CRLF files with CRLF-aware tools; write edit scripts with the Write tool, not shell heredocs (and never `git add -A` over `frontend/src`: it sweeps up `moduleKit.js`); Vite can miss a quick double save on Windows; the hidden browser pane has no animation frames or `IntersectionObserver`.
