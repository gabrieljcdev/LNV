import express from 'express'
import db from '../db/database.js'

const router = express.Router()

// GET /api/tracks/random
// Returns a random track from the last 50 posts that has a stream_url
router.get('/random', (req, res) => {
  try {
    const track = db.prepare(`
      SELECT
        t.id,
        t.title,
        t.stream_url,
        t.youtube_url,
        t.duration,
        t.position,
        pa.artist_name AS artist,
        p.id           AS post_id,
        p.title        AS album,
        p.thumb_image,
        p.cover_image,
        p.post_type
      FROM post_tracks t
      JOIN posts p ON t.post_id = p.id
      JOIN post_artists pa ON pa.post_id = p.id
      WHERE (t.stream_url IS NOT NULL AND t.stream_url != '')
        AND p.id IN (
          SELECT id FROM posts
          ORDER BY created_at DESC
          LIMIT 50
        )
      ORDER BY RANDOM()
      LIMIT 1
    `).get()

    if (!track) return res.status(404).json({ error: 'No tracks with stream URLs found' })
    res.json(track)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/tracks?post_id=123
router.get('/', (req, res) => {
  try {
    const { post_id } = req.query
    if (!post_id) return res.status(400).json({ error: 'post_id required' })
    const tracks = db.prepare('SELECT * FROM post_tracks WHERE post_id = ? ORDER BY id ASC').all(Number(post_id))
    res.json(tracks)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
