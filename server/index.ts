import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { config } from './config.js'
import { ensureLearnerRole } from './learner.js'
import { SessionManager } from './sessions.js'
// Prepare the non-superuser learner role before serving; a failure is retried lazily per connection.
await ensureLearnerRole().catch(error => console.error('学習用ロールの準備に失敗しました。Docker のデータベースが起動しているか確認してください。', error))
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
