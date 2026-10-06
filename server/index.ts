import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { config } from './config.js'
import { SessionManager } from './sessions.js'
const manager = new SessionManager()
const server = serve({ fetch: createApp(manager).fetch, hostname: '127.0.0.1', port: config.apiPort }, () => {
  console.log(`SQL道場 API: http://127.0.0.1:${config.apiPort}`)
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close()
    void manager.close().finally(() => process.exit(0))
  })
}
