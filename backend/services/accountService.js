// Your data (2026-10-06, the legal pass): download everything LNV holds
// about you, or delete your account and all of it. UK GDPR: the right of
// access and portability (export) and the right to erasure (delete).
// The privacy page (frontend pages/Legal.jsx) describes exactly this.

import db from '../db/database.js';

const all = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);

// Everything about one account, as plain JSON. Other people's personal data
// isn't included — follows and replies name them by username only.
export function exportAccount(userId) {
  const u = one('SELECT id, username, email, bio, created_at, email_verified_at, last_login_at, intros_off, boards_off FROM users WHERE id = ?', userId);
  if (!u) return null;
  const postRow = p => ({
    id: p.id, title: p.title, post_title: p.post_title, notes: p.notes, year: p.year, platform: p.platform,
    link: p.stream_url || p.discogs_url || null, discogs_id: p.discogs_id, created_at: p.created_at,
    artists: all('SELECT artist_name AS name FROM post_artists WHERE post_id = ?', p.id).map(r => r.name),
    labels: all('SELECT label_name AS name FROM post_labels WHERE post_id = ?', p.id).map(r => r.name),
  });
  return {
    exported_at: new Date().toISOString(),
    about: 'Everything Late Night Vibes holds about your account. Passwords are stored scrambled and are never included.',
    account: {
      username: u.username, email: u.email, bio: u.bio || '', joined: u.created_at,
      email_confirmed: u.email_verified_at, last_sign_in: u.last_login_at,
      settings: { introductions: u.intros_off ? 'off' : 'on', community_boards: u.boards_off ? 'off' : 'on' },
    },
    posts: all('SELECT * FROM posts WHERE wall_user_id = ? AND is_spotlight = 0 ORDER BY id', userId).map(postRow),
    records_kept: all(`SELECT p.id, p.title, j.created_at AS kept_at FROM post_joins j JOIN posts p ON p.id = j.post_id WHERE j.user_id = ? ORDER BY j.created_at`, userId),
    replies: all('SELECT c.post_id, c.content, c.created_at FROM comments c WHERE c.user_id = ? ORDER BY c.id', userId),
    following: all('SELECT u.username, f.created_at AS since FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ?', userId),
    followers: all('SELECT u.username, f.created_at AS since FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ?', userId),
    favourites: all('SELECT kind, name, created_at FROM favourite_names WHERE user_id = ? ORDER BY created_at', userId),
    playlists: all('SELECT * FROM playlists WHERE owner_id = ? ORDER BY id', userId).map(p => ({
      name: p.name, created_at: p.created_at, default: !!p.is_default,
      tracks: all('SELECT title, artist, url, added_at FROM playlist_tracks WHERE playlist_id = ? ORDER BY sort', p.id),
    })),
    playlists_joined: all('SELECT p.name, u.username AS owner FROM playlist_members m JOIN playlists p ON p.id = m.playlist_id JOIN users u ON u.id = p.owner_id WHERE m.user_id = ?', userId),
    introductions_said_no_to: all('SELECT u.username FROM intro_dismissals d JOIN users u ON u.id = d.target_id WHERE d.user_id = ?', userId).map(r => r.username),
  };
}

// Deletes the account and everything it made: posts (with their tracks,
// credits and the replies under them), ♥s, replies, follows both ways,
// favourites, playlists, introduction records, sessions and email links.
// Tracks other people saved into their own playlists stay there (they're
// links to the music, not to you), just no longer tied to the post.
export function deleteAccount(userId) {
  const posts = all('SELECT id FROM posts WHERE wall_user_id = ? OR user_id = ?', userId, userId).map(r => r.id);
  const lists = all('SELECT id FROM playlists WHERE owner_id = ?', userId).map(r => r.id);
  db.transaction(() => {
    for (const id of posts) {
      for (const t of ['post_artists', 'post_labels', 'post_genres', 'post_tracks', 'comments', 'spotlights', 'shared_feed_items', 'post_joins']) {
        db.prepare(`DELETE FROM ${t} WHERE post_id = ?`).run(id);
      }
      db.prepare('UPDATE playlist_tracks SET post_id = NULL WHERE post_id = ?').run(id);
      db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    }
    for (const id of lists) {
      db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(id);
      db.prepare('DELETE FROM playlist_members WHERE playlist_id = ?').run(id);
      db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
    }
    const byUser = [
      ['post_joins', 'user_id'], ['comments', 'user_id'], ['follows', 'follower_id'], ['follows', 'followee_id'],
      ['favourite_names', 'user_id'], ['profile_pins', 'user_id'], ['playlist_members', 'user_id'],
      ['intro_dismissals', 'user_id'], ['intro_dismissals', 'target_id'], ['intro_shown', 'viewer_id'], ['intro_shown', 'target_id'],
      ['sessions', 'user_id'], ['email_tokens', 'user_id'], ['wall_writers', 'user_id'], ['wall_writers', 'wall_user_id'], ['walls', 'user_id'],
    ];
    for (const [t, col] of byUser) { try { db.prepare(`DELETE FROM ${t} WHERE ${col} = ?`).run(userId); } catch { /* table not in this database */ } }
    // The admin log keeps what happened, not who: their name comes off it.
    db.prepare("UPDATE app_log SET user_id = NULL, username = '[deleted]' WHERE user_id = ?").run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
  return { posts: posts.length, playlists: lists.length };
}
