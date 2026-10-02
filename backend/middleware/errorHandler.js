import { logError } from '../logs/logger.js';
import { logEvent } from '../services/logService.js';

export function errorHandler(err, req, res, next) {
  logError(`${req.method} ${req.url}`, err);
  // Server errors (not 4xx answers) go to the admin log with their stack.
  if (!err.status || err.status >= 500) logEvent('error', 'system', `${req.method} ${req.originalUrl?.split('?')[0]} — ${err.message}`, { req, status: err.status || 500, detail: String(err.stack || '').split('\n').slice(0, 8).join('\n') });
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
}