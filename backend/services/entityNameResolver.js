import db from '../db/database.js';
import { getArtist, getLabel } from './discogsService.js';
import { setName, syncNamesFromPosts } from './entityNames.js';
import { logEvent } from './logService.js';
import { seedNamesFromImports } from './discogsAccount.js';

// Fills in the names of crawled artists and labels that nothing else has named (2026-10-09): one Discogs
// profile lookup at a time, every few seconds, cached by the profile cache so the spotlights get them free.
const GAP_MS = 3500;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gaveUp = new Set(); // this run only: ids Discogs would not give us

let running = false;
async function drain() {
  if (running) return;
  running = true;
  try {
    syncNamesFromPosts();
    seedNamesFromImports();
    for (;;) {
      const row = db.prepare(`SELECT c.kind, c.entity_id FROM discogs_catalogue_crawl c
        WHERE NOT EXISTS (SELECT 1 FROM discogs_names n WHERE n.kind = c.kind AND n.entity_id = c.entity_id)
        ORDER BY c.done, c.entity_id`).all().find(r => !gaveUp.has(`${r.kind}:${r.entity_id}`));
      if (!row) break;
      try {
        const p = await (row.kind === 'artist' ? getArtist : getLabel)(row.entity_id, { background: true });
        if (p?.name) setName(row.kind, row.entity_id, p.name); else gaveUp.add(`${row.kind}:${row.entity_id}`);
      } catch (err) {
        if (/ 429/.test(err.message)) { await sleep(60000); continue; }
        gaveUp.add(`${row.kind}:${row.entity_id}`);   // gone from Discogs, or a hiccup: not tried again until restart
      }
      await sleep(GAP_MS);
    }
  } finally { running = false; }
}

export function startNameResolver() {
  const go = () => drain().catch(err => logEvent('error', 'crawl', `Name resolver: ${err.message}`));
  setTimeout(go, 30000);
  setInterval(go, 10 * 60 * 1000);
}
