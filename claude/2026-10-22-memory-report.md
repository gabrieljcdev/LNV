# Memory report, 22 Oct 2026

A deeper look at memory on the server and in the browser. The headline: **the server's "1.2 GB" is mostly not the program, I found no leak in
the request paths, and the biggest real memory cost is the browser decoding oversized images.** One thing I said earlier needs correcting (section 1).

## A correction first

In the performance audit I said the 1.2 GB peak seen in the server log had "one concrete cause" in a cache that never emptied
(`spareQuota.js` `relCache`). That overstated it. The cache was unbounded and is now capped, which is right, but it is **not** what made the number
large. The number is mostly the memory-mapped database file, which is configured on purpose.

## 1. The server

Read from the live process (`/proc`, 58 minutes after a restart; read-only):

| | Size | What it is |
|---|---|---|
| Resident memory (RSS) | 1,150 MB | everything the process has in RAM, **including mapped files** |
| of which file-backed | 974 MB | **900 MB is `vinyl_crate.db` mapped into memory**, 46 MB the node binary |
| of which anonymous | 176 MB | the actual program: ~143 MB malloc heap (includes SQLite's 128 MB page cache) plus the V8 heap |
| The service's own cgroup | 219 MB (peak 222 MB) | what systemd charges to the service |
| Host | 3.9 GB total, ~3.1 GB available | no memory pressure |

**Why the database is mapped:** `db/database.js` sets `mmap_size = 1 GB` ("read up to 1 GB through the OS page cache") and
`cache_size = -131072` (128 MB). Mapped pages are reclaimable: the kernel can drop them at any moment, so they are not a leak and not "used" in the
sense that matters. They do make RSS look alarming, and any monitor that alerts on RSS would be wrong here. **Watch anonymous memory instead.**
The previous process's "1.2G memory peak" matches this arithmetic: ~900 MB mapped DB + ~128 MB SQLite cache + node.

### What I tested for leaks
- **Request paths: no leak.** 8,000 mixed requests (feed, 60-post home feed, browse, search, walls, playlists) against a copy of the dev data:
  heap +0.6 MB and RSS unchanged over the last 7,000, at about 7 ms per request.
- **Inline `db.prepare()` on every call (568 places): no leak,** but slow. After 1.5 million prepares, heap and native memory were flat. It was
  **5.5x slower** than preparing once, so I fixed it as a CPU matter (section 4).
- **In-process caches:** eight module-level Maps/Sets. One was unbounded (`spareQuota` `relCache`, now capped at 200 and cleared each run); the
  link-lookup memo is capped at 500; the rest are small bookkeeping sets.
- **Background jobs:** cannot be run offline (they call Discogs and YouTube), so reviewed instead. The one pattern that matters: the duplicate comber
  loads **every unkeyed row of an entire catalogue into one array**. Measured on the biggest catalogue in the dev copy (245,015 rows): +54 MB of heap
  while held and +184 MB resident, about 0.8 s. That is a transient spike, not a leak, and acceptable at this size. It becomes a real cost if one
  catalogue reaches millions of rows; at that point read it in slices.

### What I added so a leak cannot hide
`services/memoryWatch.js` samples every 10 minutes: resident, **anonymous vs file-backed**, V8 heap, external, native, and the size of each registered
cache, and keeps 14 days. `/api/admin/memory` and **Admin → Status → Memory** show program memory, its peak, a sparkline, and a **trend in MB per
day** (a line fitted through the hourly floor, so garbage-collection saw-teeth neither hide nor fake a slope). Tested on synthetic histories: a flat
history reads 0.3 MB/day, a 15 MB/day leak reads 15.3 MB/day through a 27 MB saw-tooth, and it says "not enough data" until it has about a day.
**Once deployed, check it after 2 to 3 days.** Flat means there is no leak; a steady positive slope means there is one, and the cache sizes beside it
say whether it is one of ours.

## 2. The browser

- **JS heap is small:** about 40 MB at idle in dev (20 MB on the live production build). At idle it does not allocate: flat at 39.6 MB, only the
  clock changes the page.
- **No leak from using the site.** 50 drawer opens, then forcing garbage collection: the floor went 123 MB → 100 MB. DOM size did not grow
  (15,389 → 15,390 elements across 80 opens).
- **The real cost is decoded images.** A picture is decoded at the size it is *downloaded*, not the size it is shown. Forcing the first 80 feed
  images to load: **110 MB decoded at natural size, against 19 MB at the displayed size (5.8x).** Worst case: Bandcamp covers stored as 1200 x 1200
  originals (5.5 MB each) in a 330 px slot. Discogs covers are 600 x 600 (1.4 MB each) in a 240 px strip.
- This is an upper bound: browsers discard decoded bitmaps for images that are far off screen, and an image used twice shares one decode. But the
  waste factor is real and is the largest memory item the browser carries.

## 3. Fixed, with measurements

| Change | Result |
|---|---|
| Bandcamp covers load at the size shown (`lib/covers.js`: the smallest of 100/150/210/300/350/700 px that covers the slot on this screen; renditions checked against a real cover) | Bandcamp decode for those images **16.5 MB → 1.4 MB (−91%)**; total 110 → 88 MB |
| Cap on the spare-quota release cache | bounded at 200 entries, cleared each run |
| Memory sampler + Admin panel | visibility, no behaviour change |
| Prepared-statement cache (`db/database.js`) | mean request **8.9 → 5.0 ms (−44%)**; feed page 11.7 → 6.2, home feed (60 posts) 22.4 → 11.5, search 11.1 → 5.5; memory unchanged |

**Why the statement cache is safe to take on trust:** nothing in the code uses the methods that change a statement's state (`pluck`, `raw`,
`iterate`, `expand`, `safeIntegers`; searched all 568 call sites), calls are synchronous, and SQLite re-prepares on a schema change. Checked directly:
with the cache on and off, **45 read endpoints returned byte-identical responses**, and a **34-request write sequence left 14 tables identical**.
`LNV_STMT_CACHE=0` switches it off if it ever misbehaves.

## 4. Still open, by size of the prize

1. **Discogs covers (about 85 MB of the remaining 88 MB in that sample).** They are signed URLs with one 600 px size; nothing smaller to ask for
   except a 150 px thumbnail that is too soft for a 240 px strip. Option: a small cover proxy on the server that fetches once, resizes to ~300 px and
   caches on disk. That is a real feature (storage, a Discogs-terms check on caching images) and I have not started it.
2. **Fewer images mounted at once.** The strip still holds 24 sleeves twice per spotlight, all the way down the feed. Windowing the feed (audit item 1)
   would cut both DOM and decoded memory.
3. **Comber on very large catalogues:** read in slices if any catalogue grows past about a million rows.
4. **Server limits worth considering, not done:** a systemd `MemoryHigh` so a runaway is throttled before the box swaps (mapped DB pages count toward
   it, so set it well above 1.5 GB), and `--heapsnapshot-signal=SIGUSR2` on the node command so a heap snapshot can be taken from a running server if the
   new trend ever shows growth. Both are production-unit edits, so they need your go-ahead.
5. **`mmap_size`:** keep. It speeds reads and costs nothing real on a 4 GB box. If the server is ever shrunk below about 2 GB, lower it (and `cache_size`).

## What I could not measure
The built-in browser pane here is hidden, so it renders no frames and does not load lazy images unprompted. I forced a sample of images to load to
measure them, and used a controlled drawer-cycling test, but I could not watch memory under real scrolling. Take a Chrome DevTools Memory snapshot
(or the Performance monitor's "JS heap" and "DOM nodes" lines) while scrolling the live site to confirm the browser side.
