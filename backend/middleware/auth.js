import { userForToken, isAdminUser } from '../services/authService.js';

// Reads `Authorization: Bearer <token>` and sets req.user (or null). Runs on
// every /api request; routes that need a signed-in user add requireAuth.
export function attachUser(req, res, next) {
  const m = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  req.token = m ? m[1].trim() : null;
  req.user = userForToken(req.token);
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to do that.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Admins only.' });
  next();
}

// The post's author, or lnv_admin.
export const canModify = (post, user) => !!user && (user.id === post.user_id || isAdminUser(user));
