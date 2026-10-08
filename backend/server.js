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
import adminRoutes from './routes/admin.js';
import feedRoutes from './routes/feeds.js';
import wallRoutes from './routes/walls.js';
import playlistRoutes from './routes/playlists.js';
import discogsAccountRoutes from './routes/discogsAccount.js';
import { startDiscogsAccountKeeper } from './services/discogsAccount.js';
import communityRoutes from './routes/community.js';
import { requestLogger, startLogPruning, logEvent } from './services/logService.js';
import { attachUser } from './middleware/auth.js';
import { startDiscogsMatcher } from './services/discogsMatcher.js';
import { startCatalogueKeeper } from './services/discogsService.js';
import { startCatalogueComber } from './services/catalogueComber.js';
import { startChannelKeeper } from './services/youtubeService.js';
import { startGapSweeper } from './services/gapSweeper.js';
import { startProfileKeeper } from './services/profileLinks.js';
import trackLinkRoutes from './routes/trackLinks.js';
import { startLinkHealth } from './services/linkHealth.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));
app.use('/api', limiter);
app.use('/api', attachUser); // req.user from the Bearer token (or null)
app.use('/api', requestLogger); // writes, failures and slow requests -> admin log
app.use('/api/auth',    authRoutes);
app.use('/api/discogs', discogsRoutes);
app.use('/api/track-links', trackLinkRoutes);
app.use('/api/media',   mediaRoutes);
app.use('/api/posts',   postsRoutes);
app.use('/api/users',   usersRoutes);
app.use('/api/tracks',  trackRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/genres',  genreRoutes);
app.use('/api/labels',  labelRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/feeds',   feedRoutes);
app.use('/api/walls',   wallRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/discogs-account', discogsAccountRoutes);
app.use('/api/community', communityRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Late Night Vibes API is running 🌙' });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🌙 Late Night Vibes backend running at http://localhost:${PORT}`);
  logEvent('info', 'system', 'Backend started');
  startLogPruning();
  startDiscogsMatcher();
  // Fill the Discogs catalogues and YouTube channels in quiet moments.
  startCatalogueKeeper();
  startDiscogsAccountKeeper();
  // Fold duplicate pressings in the catalogues, checked against Discogs.
  startCatalogueComber();
  startChannelKeeper();
  // Read artists' and labels' Discogs profiles for their YouTube channels
  // (crawled for free lookups), Bandcamp and SoundCloud links.
  startProfileKeeper();
  // Re-check saved YouTube links that stopped playing (free).
  startLinkHealth();
  // Fill what those leave: missing ids, genres, years, tracklists, links.
  startGapSweeper();
});