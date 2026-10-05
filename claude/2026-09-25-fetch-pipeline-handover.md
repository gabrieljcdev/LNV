# LNV — Fetch pipeline + local catalogue: handover (2026-09-25)

Written in claude.ai (no repo access) and pasted into the Claude Code session
that picked it up; saved here so it exists in the repo. It referenced
`claude/2026-08-26-*.md` docs that were not on disk. What was actually done
that day: `claude/2026-09-25-fetch-pipeline-session.md`.

## Goal (gabriel, condensed)
Paste almost any track link from any plausible platform and compose fills
itself: artist, title, release, label + catno, year, genres/styles, album art,
cross-platform links (YouTube, Discogs, Bandcamp, Spotify…), and the right post
type. Use the DB to cut API calls: when an artist/label unseen by the DB is
posted, crawl its data in the background, rate-limited. Later posts resolve
instantly from local data and spotlights fill out as a side effect.

"Search" in this context means FETCH (the paste-a-link resolver), not the feed
search bar.

## External constraints
- Songlink/Odesli API is dead (v1-alpha.1 retired 2026-07-31, returns 410).
- Discogs: 60 req/min authenticated; budget ~45/min for background work.
- MusicBrainz: 1 req/s, descriptive User-Agent with contact required. URL
  relationships are the cross-link source (Discogs, Bandcamp, YouTube, Spotify,
  Apple).
- YouTube Data API: 10k units/day. Avoid search.list (100 units); videos.list /
  channels.list cost 1. Daily cap in config.
- Deezer / iTunes Search: keyless fallbacks for art, ISRC, duration. Throttle.

## Plan
1. **Local catalogue** (migrations in db/database.js): artists, labels, releases,
   tracks, release_artists / release_labels (with role), entity_links,
   url_index (normalised URL or platform:id → release/track), aliases,
   discography (subject → release ids, cursor, complete flag), enrich_jobs
   (kind, target, priority, status, attempts, next_run_at, last_error; unique on
   kind+target). Seed from discogs_cache + posts (zero API calls). Posts should
   eventually reference release_id/track_id — a deliberate migration.
2. **Local-first /resolve**: url_index hit → DB only; else platform adapter for
   cheap metadata; local match on normalised artist|title + aliases; on miss,
   one Discogs search + top release only (alternates lazily when the picker
   opens) ≈ 2 calls per cold paste instead of ~6; detect type; return draft and
   enqueue enrichment. Targets: <1 s local hit, <2.5 s cold miss (else two-phase
   response). Response: type+confidence, artists[{name,id}], title, release,
   track, label{name,id,catno}, year, genres, styles, cover,
   links{youtube,discogs,bandcamp,spotify,apple,soundcloud,…},
   embed{platform,url,w,h}, source_trail[] (per-field provenance).
3. **Enrichment worker** (in-process): one token bucket per provider; a 429
   pauses only that provider with exponential backoff. P0 paste (inline) · P1
   post saved (full release, artist + label profile, MusicBrainz links) · P2
   artist/label first seen (discography list pages) · P3 spotlight nearing
   (full detail) · P4 idle refresh. Depth cap 1 hop; large labels capped ~300
   releases. TTLs: releases never; profiles 90 d; discography lists 30 d;
   channels 24 h. Jobs deduped by unique key, persisted in the DB.
4. **Type detection** (out of Feed.jsx detectType; stored on the post with a
   confidence; overridable in compose): livemix = Mixcloud/Boiler Room/RA, or
   >25 min with no Discogs match, or set-style titles (live at, dj set, b2b,
   session, mix, podcast, `| Channel - Date`). Discogs format: LP/Album → lp,
   EP → ep, Single or 7"/12" with 1–2 tracks → single; only without format
   descriptions fall back to track count/duration (EP = 3–6 tracks or <30 min).
   track = single-track URL (attach parent release). unmatched = no Discogs hit
   (platform data; queue MusicBrainz retry). Fixes the LP/EP TODO, unblocks the
   album spotlight.
5. **Compose rework**: paste → draft; overridable type chip; lazy release
   picker; link-chip row; keep "◈ N DISCOGS IDS LINKED"; fix identity/admin
   fallback issues.
6. **Spotlights** read catalogues from the discography table; on-site vs
   not-yet becomes a join.

Build order: catalogue tables + seed → url_index + local-first /resolve → lazy
alternates → queue worker, buckets, P1/P2 jobs → MusicBrainz adapter → type
detection, then compose rework → spotlights from the catalogue. Check in with
gabriel after each step; he tests live.

## Standing rules
- Commit only when gabriel asks; don't push unless asked.
- Don't reformat CRLF line endings.
- better-sqlite3 is a Windows-native binary: run backend checks on his machine.
- Verify frontend changes with `npm run build` + eslint, then live
  (localhost:5173, backend :3001).
- Write a session doc to `claude/` at the end.

## Open list as of 2026-09-25 (before this session)
Blocking/unclear: feed scroll feel (after 3c260f7, 701534f); Discogs id chain
backfill. Feed.jsx: card uniformity across types; detectType LP vs EP (plan §4);
album/LP spotlight; genre spotlight (no design); variable spacing / grouping /
article card; composition improvements (first slice: gaps + tracklist; VT323
retirement undecided); commentsY overlap on top-plate variants; YouTube embed in
the art frame (fill vs 16:9). Features: edit-post flow; move search bar + post
button (rail placement proposed); fetch pipeline (this doc); mobile layout.
Live verification: Discogs discography flow; browse drawers across palettes;
touch/tablet/phone scroll; 08-26 punchlist. Housekeeping: delete
SecondaryStrip.jsx and .git/*.lock.stale; remove PLACEHOLDER_CHANNEL_POSTS once
real live-set posts exist; commit/push 08-26 work.
