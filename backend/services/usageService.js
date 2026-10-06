// How hard each outside service is being asked, per day (2026-10-06) —
// Admin → Status shows it. Counts real network requests only (cache hits
// don't count). YouTube keeps its own units count (youtubeService
// quotaUsed); this adds request counts for the others in the same table.
import db from '../db/database.js';

const today = () => new Date().toISOString().slice(0, 10);

export function countCall(service) {
  try {
    db.prepare(`INSERT INTO api_quota (provider, day, units) VALUES (?, ?, 1)
      ON CONFLICT(provider, day) DO UPDATE SET units = units + 1`).run(`${service}-calls`, today());
  } catch { /* counting must never break a request */ }
}

export function callsToday(service) {
  return db.prepare('SELECT units FROM api_quota WHERE provider = ? AND day = ?').get(`${service}-calls`, today())?.units || 0;
}
