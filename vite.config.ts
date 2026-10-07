import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
const webPort = Number(process.env.WEB_PORT ?? 5173)
const apiPort = Number(process.env.API_PORT ?? 3001)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: webPort, strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
})
