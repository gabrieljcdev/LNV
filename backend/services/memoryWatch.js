// Memory over time (2026-10-22). A single number ("1.2 GB peak") hides what it is made of, and on this server most of it is not the
// program: the music database is memory-mapped (db/database.js mmap_size 1 GB, so up to ~900 MB shows as resident file pages that the kernel
// can drop at any moment) and SQLite keeps a 128 MB page cache. What would be a leak is the part that grows and does not come back:
// anonymous memory (the V8 heap, SQLite's cache, buffers). So every SAMPLE_MS this records
//   rss          everything resident (includes the mapped database file)
//   anon         resident memory that is not a file: the real footprint          (Linux: /proc/self/status RssAnon)
//   file         resident file-backed pages: the mapped database, the node binary (RssFile)
//   heap_used / heap_total / external / array_buffers   from V8
//   malloced     native memory V8 knows about
//   caches       the size of each in-process cache that registers itself (watchCache)
// and keeps 14 days. memoryTrend() fits a line through the last day or more of `anon` and `heap_used` (the minimum per hour, which sees
// through garbage-collection swings) and reports megabytes per day: flat is fine, a steady positive slope over several days is a leak.
import fs from 'node:fs';
import v8 from 'node:v8';
import db from '../db/database.js';
import { logEvent } from './logService.js';

db.exec(`CREATE TABLE IF NOT EXISTS mem_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  rss INTEGER, anon INTEGER, file INTEGER,
  heap_used INTEGER, heap_total INTEGER, external INTEGER, array_buffers INTEGER, malloced INTEGER,
  caches TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_mem_samples_at ON mem_samples(at)');

const SAMPLE_MS = 10 * 60 * 1000, KEEP_DAYS = 14;
const caches = new Map();   // name -> () => size
// A service reports a cache's size here: watchCache('discogs-videos in flight', () => inFlight.size)
export const watchCache = (name, sizeFn) => { caches.set(name, sizeFn); };

function procStatus() {
  try {
    const t = fs.readFileSync('/proc/self/status', 'utf8');
    const kb = k => { const m = t.match(new RegExp(`^${k}:\\s+(\\d+) kB`, 'm')); return m ? Number(m[1]) * 1024 : null; };
    return { anon: kb('RssAnon'), file: kb('RssFile') };
  } catch { return { anon: null, file: null }; }   // not Linux
}

export function takeSample() {
  const m = process.memoryUsage(), p = procStatus(), h = v8.getHeapStatistics();
  const sizes = {};
  for (const [n, fn] of caches) { try { sizes[n] = Number(fn()) || 0; } catch { /* a cache that cannot report is skipped */ } }
  db.prepare(`INSERT INTO mem_samples (rss, anon, file, heap_used, heap_total, external, array_buffers, malloced, caches) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(m.rss, p.anon, p.file, m.heapUsed, m.heapTotal, m.external, m.arrayBuffers, h.malloced_memory, JSON.stringify(sizes));
  db.prepare("DELETE FROM mem_samples WHERE at < datetime('now', ?)").run(`-${KEEP_DAYS} days`);
  return { ...m, ...p, malloced: h.malloced_memory, caches: sizes };
}

const MB = b => (b == null ? null : Math.round(b / 1048576 * 10) / 10);

// Least-squares slope of y over time, in units per day.
function slopePerDay(points) {
  if (points.length < 6) return null;
  const t0 = points[0].t, xs = points.map(p => (p.t - t0) / 864e5), ys = points.map(p => p.y);
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0), den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return den ? num / den : null;
}

// The lowest reading in each hour: garbage collection makes the V8 heap saw-tooth, the floor of the saw-tooth is what is really retained.
function hourlyFloor(rows, col) {
  const by = new Map();
  for (const r of rows) {
    if (r[col] == null) continue;
    const k = r.at.slice(0, 13);
    const cur = by.get(k);
    if (!cur || r[col] < cur.y) by.set(k, { t: new Date(`${r.at.replace(' ', 'T')}Z`).getTime(), y: r[col] });
  }
  return [...by.values()].sort((a, b) => a.t - b.t);
}

export function memoryReport(hoursAsked = 48) {
  const hours = Math.min(Math.max(Math.round(Number(hoursAsked)) || 48, 1), KEEP_DAYS * 24);
  const rows = db.prepare("SELECT * FROM mem_samples WHERE at > datetime('now', ?) ORDER BY id").all(`-${hours} hours`);
  const last = rows.at(-1) || null;
  const trend = col => { const s = slopePerDay(hourlyFloor(rows, col)); return s == null ? null : MB(s * 1); };
  const span = rows.length > 1 ? (new Date(`${rows.at(-1).at.replace(' ', 'T')}Z`) - new Date(`${rows[0].at.replace(' ', 'T')}Z`)) / 36e5 : 0;
  const step = Math.max(1, Math.ceil(rows.length / 120));
  return {
    hours, samples: rows.length, spanHours: Math.round(span * 10) / 10, uptimeHours: Math.round(process.uptime() / 360) / 10,
    now: last && { at: last.at, rssMB: MB(last.rss), anonMB: MB(last.anon), fileMB: MB(last.file), heapUsedMB: MB(last.heap_used), heapTotalMB: MB(last.heap_total), externalMB: MB(last.external), arrayBuffersMB: MB(last.array_buffers), mallocedMB: MB(last.malloced), caches: JSON.parse(last.caches || '{}') },
    peak: { rssMB: MB(Math.max(0, ...rows.map(r => r.rss || 0))), anonMB: MB(Math.max(0, ...rows.map(r => r.anon || 0))), heapUsedMB: MB(Math.max(0, ...rows.map(r => r.heap_used || 0))) },
    // Megabytes per day over the window. Needs about a day of samples to mean anything; null until there are enough.
    trendMBPerDay: { anon: trend('anon'), heapUsed: trend('heap_used'), external: trend('external') },
    series: rows.filter((_, i) => i % step === 0).map(r => ({ at: r.at, anonMB: MB(r.anon), heapUsedMB: MB(r.heap_used), rssMB: MB(r.rss) })),
  };
}

export function startMemoryWatch() {
  if (process.env.MEMORY_WATCH === '0') return;
  const tick = () => { try { takeSample(); } catch (err) { logEvent('error', 'system', `Memory sample: ${err.message}`); } };
  setTimeout(tick, 30 * 1000);
  setInterval(tick, SAMPLE_MS);
}
