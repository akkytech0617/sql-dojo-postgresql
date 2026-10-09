import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
const webPort = Number(process.env.WEB_PORT ?? 5173)
const apiPort = Number(process.env.API_PORT ?? 3001)
// The API keeps a PostgreSQL superuser session for maintenance (reset/grading), so no other site may frame it (clickjacking).
const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: webPort, strictPort: true, headers: securityHeaders,
    // changeOrigin: false keeps the browser's Host so the API's DNS-rebinding check sees it.
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
  preview: { headers: securityHeaders },
})
