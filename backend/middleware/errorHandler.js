import { logError } from '../logs/logger.js';

export function errorHandler(err, req, res, next) {
  logError(`${req.method} ${req.url}`, err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
}