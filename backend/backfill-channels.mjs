// One-off: backfill `channel` on existing live-set posts that predate the
// channel-storage fix (2026-08-24). For each livemix post with no channel
// and a stream_url, re-resolves the URL through the backend's own
// /api/media/resolve (same YouTube-oEmbed + title-parsing path ComposeModal
// already uses) and PATCHes the result back in. Run with the backend
// already up (`node server.js` in another terminal), from backend/:
//
//   node backfill-channels.mjs
//
// Safe to re-run — only touches posts where channel is still null.

import db from './db/database.js';

const API = 'http://localhost:3001/api';

const posts = db.prepare(
  "SELECT id, title, stream_url FROM posts WHERE post_type = 'livemix' AND channel IS NULL AND stream_url IS NOT NULL"
).all();

console.log(`${posts.length} livemix post(s) missing a channel.\n`);

for (const p of posts) {
  try {
    const res = await fetch(`${API}/media/resolve?url=${encodeURIComponent(p.stream_url)}`);
    const data = await res.json();
    if (!res.ok || !data.channel) {
      console.log(`#${p.id}  "${p.title}"  -> no channel found (${data.error || data.warning || 'none returned'})`);
      continue;
    }
    const patch = await fetch(`${API}/posts/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: data.channel }),
    });
    if (!patch.ok) {
      console.log(`#${p.id}  "${p.title}"  -> resolved "${data.channel}" but PATCH failed (${patch.status})`);
      continue;
    }
    console.log(`#${p.id}  "${p.title}"  -> channel set to "${data.channel}"`);
  } catch (err) {
    console.log(`#${p.id}  "${p.title}"  -> error: ${err.message}`);
  }
}
