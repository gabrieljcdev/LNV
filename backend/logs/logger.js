import { appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = join(__dirname, 'app.log');

export function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] INFO: ${message}\n`;
  console.log(line.trim());
  appendFileSync(LOG_PATH, line);
}

export function logError(message, err) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ERROR: ${message} — ${err?.message || err}\n`;
  console.error(line.trim());
  appendFileSync(LOG_PATH, line);
}