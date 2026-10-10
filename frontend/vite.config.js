import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // /api goes on to the backend (2026-10-05), so a phone on the same wifi
    // only needs this one address: run `npm run dev -- --host` and open the
    // "Network" URL it prints. Used when VITE_API_URL is /api (.env.local).
    // API_PROXY=https://waxopathy.com tests this frontend against the live data without running a local backend.
    proxy: { '/api': { target: process.env.API_PROXY || 'http://localhost:3001', changeOrigin: true } },
  },
})
