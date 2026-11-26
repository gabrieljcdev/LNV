import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

// Dev only (2026-10-12): the wordmark sizing tool (BrandScaleTool.jsx) POSTs its values here so they land in
// frontend/brand-scale.json, where Claude can read them. Delete with the tool.
const brandScaleSave = {
  name: 'brand-scale-save',
  configureServer(server) {
    server.middlewares.use('/__brand-scale', (req, res) => {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', () => {
        try { fs.writeFileSync('brand-scale.json', JSON.stringify(JSON.parse(body), null, 2)); res.end('saved') } catch { res.statusCode = 400; res.end('bad') }
      })
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), brandScaleSave],
  server: {
    // /api goes on to the backend (2026-10-05), so a phone on the same wifi
    // only needs this one address: run `npm run dev -- --host` and open the
    // "Network" URL it prints. Used when VITE_API_URL is /api (.env.local).
    // API_PROXY=https://waxopathy.com tests this frontend against the live data without running a local backend.
    proxy: { '/api': { target: process.env.API_PROXY || 'http://localhost:3001', changeOrigin: true } },
  },
})
