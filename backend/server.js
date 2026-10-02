import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler.js';
import trackRoutes from './routes/tracks.js';
import discogsRoutes from './routes/discogs.js';
import postsRoutes from './routes/posts.js';
import usersRoutes from './routes/users.js';
import artistRoutes from './routes/artists.js';
import genreRoutes from './routes/genres.js';
import labelRoutes from './routes/labels.js';
import mediaRoutes from './routes/media.js';
import authRoutes from './routes/auth.js';
import { attachUser } from './middleware/auth.js';
import { startDiscogsMatcher } from './services/discogsMatcher.js';
import { startCatalogueKeeper } from './services/discogsService.js';
import { startChannelKeeper } from './services/youtubeService.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));
app.use('/api', limiter);
app.use('/api', attachUser); // req.user from the Bearer token (or null)
app.use('/api/auth',    authRoutes);
app.use('/api/discogs', discogsRoutes);
app.use('/api/media',   mediaRoutes);
app.use('/api/posts',   postsRoutes);
app.use('/api/users',   usersRoutes);
app.use('/api/tracks',  trackRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/genres',  genreRoutes);
app.use('/api/labels',  labelRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Late Night Vibes API is running 🌙' });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🌙 Late Night Vibes backend running at http://localhost:${PORT}`);
  startDiscogsMatcher();
  // Fill the Discogs catalogues and YouTube channels in quiet moments.
  startCatalogueKeeper();
  startChannelKeeper();
});