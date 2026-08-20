import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler.js';
import trackRoutes from './routes/tracks.js';
import discogsRoutes from './routes/discogs.js';
import postsRoutes from './routes/posts.js';
import wallsRoutes from './routes/walls.js';
import usersRoutes from './routes/users.js';
import netlinkRoutes from './routes/netlink.js';
import cratesRoutes from './routes/crates.js';
import artistRoutes from './routes/artists.js';
import genreRoutes from './routes/genres.js';
import labelRoutes from './routes/labels.js';
import mediaRoutes from './routes/media.js';
import fs from 'fs';
import path from 'path';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));
app.use('/api', limiter);
app.use('/api/discogs', discogsRoutes);
app.use('/api/media',   mediaRoutes);
app.use('/api/posts',   postsRoutes);
app.use('/api/walls',   wallsRoutes);
app.use('/api/users',   usersRoutes);
app.use('/api',         netlinkRoutes);
app.use('/api/crates',  cratesRoutes);
app.use('/api/tracks',  trackRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/genres',  genreRoutes);
app.use('/api/labels',  labelRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Late Night Vibes API is running 🌙' });
});

// Dev: read file (POST body)
app.post('/api/dev/file', (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'No path' });
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Dev: read file (GET query)
app.get('/api/dev/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'No path' });
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Dev: write file
app.post('/api/dev/write', (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) return res.status(400).json({ error: 'No path or content' });
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ ok: true, path: filePath });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// Dev: write file via text/plain — path in query, content as raw body
// Used by Claude in Chrome to avoid extension JSON+filepath blocking
app.put('/api/dev/write', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'No path' });
  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, body, 'utf8');
      res.json({ ok: true, path: filePath });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🌙 Late Night Vibes backend running at http://localhost:${PORT}`);
});