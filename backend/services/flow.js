// Flow: how people move through the site and how long they listen (2026-10-22). Recorded in the activity database
// (db/activityDb.js flow_events) for accounts that switched activity recording on, and nobody else. What is stored and what is not:
//   stored    the order of steps in a session, which view or drawer they were in and for how long, which control they clicked (its
//             label), which platform and video / post / track id they listened to and for how many milliseconds, session length
//   never     anything typed, the words on the page, an IP address, a position on the screen, search terms (only that a search happened)
// The reading side answers four questions: how long do sessions last, where does the time go, what do people do with it
// (clicks, listens), and what leads where (view to view, and which click led into each view).
import activity from '../db/activityDb.js';
import { keepsListening } from './listeningHistory.js';

const KINDS = new Set(['session_start', 'session_end', 'view', 'click', 'listen', 'compose_open', 'search', 'scroll']);
const MAX_BATCH = 50, MAX_PER_DAY = 20000, MAX_MS = 6 * 60 * 60 * 1000;
const LEAD_WINDOW_MS = 1500;   // a click this soon before a view change is what led into it

// Labels are slugs: lowercase letters, digits and a few marks (: / . _ - #), no spaces. Anything else is not a label (it may be text from
// the page), so it is dropped rather than tidied: the front end names things with slugs and never sends the words it sees.
const SLUG = /^[a-z0-9][a-z0-9:_./#-]*$/;
const label = (v, n = 80) => { const s = String(v ?? '').trim().toLowerCase(); return s && s.length <= n && SLUG.test(s) ? s : null; };
const msOf = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), MAX_MS) : null; };
// meta: a fixed set of keys only. Numbers and booleans freely; the few string keys take a short slug. Nothing else survives.
const META_FLAGS = new Set(['finished', 'approx', 'phone', 'standalone']);
const META_NUMBERS = new Set(['results', 'n', 'width', 'count']);
const META_WORDS = new Set(['device', 'mode', 'platform', 'reason', 'theme']);
const metaOf = m => {
  if (!m || typeof m !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(m).slice(0, 8)) {
    if (META_FLAGS.has(k) && typeof v === 'boolean') out[k] = v;
    else if (META_NUMBERS.has(k) && typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v);
    else if (META_WORDS.has(k) && typeof v === 'string') { const w = label(v, 20); if (w) out[k] = w; }
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
};

// A post / track number or a video id: letters, digits, - and _ only, case kept.
const plainId = v => { const s = String(v ?? '').trim(); return s && s.length <= 40 && /^[A-Za-z0-9_-]+$/.test(s) ? s : null; };

const ins = activity.prepare('INSERT INTO flow_events (t, user_id, session_id, seq, kind, view, target, ref, ms, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const today = activity.prepare("SELECT COUNT(*) c FROM flow_events WHERE user_id = ? AND at > datetime('now', '-1 day')");

// -> { recorded, off? } for a batch of up to MAX_BATCH steps from one session.
export function recordFlow(userId, sessionId, events) {
  if (!keepsListening(userId)) return { recorded: 0, off: true };
  const sid = plainId(sessionId);
  if (!sid) return { recorded: 0, error: 'session' };
  if (today.get(userId).c >= MAX_PER_DAY) return { recorded: 0, full: true };
  let n = 0;
  activity.transaction(() => {
    for (const e of (Array.isArray(events) ? events : []).slice(0, MAX_BATCH)) {
      if (!e || !KINDS.has(e.kind)) continue;
      const t = Number(e.t);
      ins.run(Number.isFinite(t) ? Math.round(t) : null, userId, sid, Math.max(0, Math.round(Number(e.seq)) || 0), e.kind, label(e.view), label(e.target), plainId(e.ref), msOf(e.ms), metaOf(e.meta));
      n++;
    }
  })();
  return { recorded: n };
}

const sinceOf = days => `-${Math.min(Math.max(Math.round(Number(days)) || 30, 1), 180)} days`;
const rowsFor = (userId, since) => (userId == null
  ? activity.prepare("SELECT * FROM flow_events WHERE at > datetime('now', ?) ORDER BY user_id, session_id, seq, id").all(since)
  : activity.prepare("SELECT * FROM flow_events WHERE user_id = ? AND at > datetime('now', ?) ORDER BY session_id, seq, id").all(userId, since));
const top = (map, n = 12) => [...map].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

// The numbers. userId null = everyone who has recording on (for the admin); otherwise one person's own.
export function flowSummary(userId, daysAsked = 30) {
  const since = sinceOf(daysAsked);
  const rows = rowsFor(userId, since);
  const sessions = new Map();   // user|session -> its rows
  for (const r of rows) { const k = `${r.user_id}|${r.session_id}`; if (!sessions.has(k)) sessions.set(k, []); sessions.get(k).push(r); }

  const lengths = [], viewTime = new Map(), clicks = new Map(), transitions = new Map(), leads = new Map(), entries = new Map(), exits = new Map(), listenBy = new Map();
  let listens = 0, finished = 0, listenMs = 0, searches = 0, composes = 0, perDay = new Map();
  for (const list of sessions.values()) {
    const end = list.find(r => r.kind === 'session_end');
    const first = list.find(r => r.t != null), last = [...list].reverse().find(r => r.t != null);
    const len = end?.ms ?? (first && last ? last.t - first.t : 0);
    if (len > 0) lengths.push(len);
    const day = (list[0].at || '').slice(0, 10); if (day) perDay.set(day, (perDay.get(day) || 0) + 1);
    let prevView = null, lastClick = null, entered = false;
    for (const r of list) {
      if (r.kind === 'click') { clicks.set(r.target || '?', (clicks.get(r.target || '?') || 0) + 1); lastClick = r; }
      else if (r.kind === 'view') {
        // `target` = the view entered, `view` = the one left, `ms` = time spent in the one left (written when leaving).
        if (r.view && r.ms != null) viewTime.set(r.view, (viewTime.get(r.view) || 0) + r.ms);
        if (r.target) {
          if (!entered) { entries.set(r.target, (entries.get(r.target) || 0) + 1); entered = true; }
          if (prevView) { const k = `${prevView} → ${r.target}`; transitions.set(k, (transitions.get(k) || 0) + 1); }
          if (lastClick && r.t != null && lastClick.t != null && r.t - lastClick.t >= 0 && r.t - lastClick.t <= LEAD_WINDOW_MS) {
            const k = `${lastClick.target || '?'} → ${r.target}`; leads.set(k, (leads.get(k) || 0) + 1);
          }
          prevView = r.target;
        }
      } else if (r.kind === 'listen') {
        listens++; listenMs += r.ms || 0;
        let m = {}; try { m = r.meta ? JSON.parse(r.meta) : {}; } catch { /* none */ }
        if (m.finished) finished++;
        const src = r.target || '?'; const o = listenBy.get(src) || { listens: 0, ms: 0 }; o.listens++; o.ms += r.ms || 0; listenBy.set(src, o);
      } else if (r.kind === 'search') searches++;
      else if (r.kind === 'compose_open') composes++;
    }
    if (prevView) exits.set(prevView, (exits.get(prevView) || 0) + 1);
  }
  const avg = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0;
  return {
    days: Number(since.slice(1, -5)), sessions: sessions.size, people: new Set(rows.map(r => r.user_id)).size,
    session_ms: { average: avg, median: median(lengths), longest: lengths.length ? Math.max(...lengths) : 0 },
    sessions_per_day: [...perDay].sort().map(([day, sessions]) => ({ day, sessions })),
    listening: { listens, finished, finish_rate: listens ? Math.round(finished / listens * 100) / 100 : 0, total_ms: listenMs, average_ms: listens ? Math.round(listenMs / listens) : 0,
      by_platform: [...listenBy].map(([platform, v]) => ({ platform, ...v })).sort((a, b) => b.ms - a.ms) },
    time_in_views: top(viewTime).map(([view, ms]) => ({ view, ms })),
    top_clicks: top(clicks).map(([target, n]) => ({ target, n })),
    paths: top(transitions).map(([path, n]) => ({ path, n })),
    what_led_where: top(leads).map(([lead, n]) => ({ lead, n })),
    first_view: top(entries).map(([view, n]) => ({ view, n })),
    last_view: top(exits).map(([view, n]) => ({ view, n })),
    searches, compose_opens: composes,
  };
}

// One session step by step, for looking at a single visit (yours only, or any for the admin).
export function sessionTrail(userId, sessionId) {
  return activity.prepare('SELECT seq, t, kind, view, target, ref, ms, meta FROM flow_events WHERE user_id = ? AND session_id = ? ORDER BY seq, id').all(userId, String(sessionId).slice(0, 40));
}
export function recentSessions(userId, limit = 20) {
  return activity.prepare(`SELECT session_id, MIN(at) AS started, COUNT(*) AS steps, MAX(CASE WHEN kind = 'session_end' THEN ms END) AS ms,
      SUM(CASE WHEN kind = 'listen' THEN COALESCE(ms, 0) ELSE 0 END) AS listened_ms
    FROM flow_events WHERE user_id = ? GROUP BY session_id ORDER BY MIN(id) DESC LIMIT ?`).all(userId, Math.min(Math.max(Number(limit) || 20, 1), 100));
}
export const clearFlow = userId => activity.prepare('DELETE FROM flow_events WHERE user_id = ?').run(userId).changes;
