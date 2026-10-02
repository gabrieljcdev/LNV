import db from '../db/database.js';

// ── App log (2026-10-02) ──────────────────────────────────────────────────────
// What the admin "Logs" tab reads: sign-ins and sign-ups, password resets,
// post changes, email sends, crawler problems, server errors, and any API
// request that failed or was slow. Successful reads aren't logged — the feed
// polls several endpoints every few seconds and would drown everything else.
// Kept for LOG_DAYS days, pruned hourly.

const LOG_DAYS = 30;

db.exec(`CREATE TABLE IF NOT EXISTS app_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  level TEXT NOT NULL,          -- info | warn | error
  kind TEXT NOT NULL,           -- auth | post | mail | crawl | request | system | admin
  message TEXT NOT NULL,
  user_id INTEGER,
  username TEXT,
  method TEXT,
  path TEXT,
  status INTEGER,
  ms INTEGER,
  ip TEXT,
  detail TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_app_log_ts ON app_log(ts)');

const insert = db.prepare(`INSERT INTO app_log (level, kind, message, user_id, username, method, path, status, ms, ip, detail)
  VALUES (@level, @kind, @message, @user_id, @username, @method, @path, @status, @ms, @ip, @detail)`);

// IPs are kept only as a coarse marker (last part dropped) — enough to tell
// "same place" from "somewhere else", not to identify anyone.
const coarseIp = ip => {
  const v = String(ip || '').replace(/^::ffff:/, '');
  if (!v) return null;
  if (v.includes('.')) return v.split('.').slice(0, 3).join('.') + '.x';
  return v.split(':').slice(0, 3).join(':') + ':…';
};

/**
 * logEvent('info', 'auth', 'Signed in', { req, user, detail })
 * Never throws: logging must not break the thing being logged.
 */
export function logEvent(level, kind, message, { req, user, detail, status, ms } = {}) {
  try {
    const u = user || req?.user || null;
    insert.run({
      level, kind, message: String(message).slice(0, 500),
      user_id: u?.id ?? null, username: u?.username ?? null,
      method: req?.method ?? null, path: req ? (req.originalUrl || req.url || '').split('?')[0].slice(0, 300) : null,
      status: status ?? null, ms: ms ?? null,
      ip: req ? coarseIp(req.ip || req.socket?.remoteAddress) : null,
      detail: detail == null ? null : (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 4000),
    });
  } catch { /* logging is best-effort */ }
}

// Request log: anything that wrote, failed, or took over a second.
export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const wrote = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    if (!wrote && res.statusCode < 400 && ms < 1000) return;
    // Auth routes log their own, clearer lines.
    if ((req.originalUrl || '').startsWith('/api/auth/') && res.statusCode < 500) return;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logEvent(level, 'request', `${req.method} ${(req.originalUrl || '').split('?')[0]} → ${res.statusCode}${ms >= 1000 ? ` (slow: ${ms} ms)` : ''}`, { req, status: res.statusCode, ms });
  });
  next();
}

export function pruneLog() {
  try { db.prepare(`DELETE FROM app_log WHERE ts < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`).run(`-${LOG_DAYS} days`); } catch { /* ignore */ }
}
export function startLogPruning() {
  pruneLog();
  setInterval(pruneLog, 60 * 60 * 1000);
}

/** Newest first, filtered; `before` = id cursor for paging. */
export function readLog({ level, kind, q, before, limit = 100 } = {}) {
  const where = [], args = [];
  if (level) { where.push('level = ?'); args.push(level); }
  if (kind) { where.push('kind = ?'); args.push(kind); }
  if (q) { where.push("instr(lower(message || ' ' || ifnull(username, '') || ' ' || ifnull(path, '') || ' ' || ifnull(detail, '')), ?) > 0"); args.push(String(q).toLowerCase()); }
  if (before) { where.push('id < ?'); args.push(Number(before)); }
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const rows = db.prepare(`SELECT * FROM app_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`).all(...args, lim);
  return { rows, next: rows.length === lim ? rows[rows.length - 1].id : null };
}

/** Counts for the status tab: last 24h by level, and per kind. */
export function logSummary() {
  const since = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')";
  return {
    last24h: Object.fromEntries(db.prepare(`SELECT level, COUNT(*) c FROM app_log WHERE ts >= ${since} GROUP BY level`).all().map(r => [r.level, r.c])),
    total: db.prepare('SELECT COUNT(*) c FROM app_log').get().c,
  };
}
