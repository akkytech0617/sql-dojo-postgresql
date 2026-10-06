import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { config } from './config.js'
import { serializeSqlError } from './errors-ja.js'
import { healthRoutes } from './routes/health.js'
import { sessionRoutes } from './routes/sessions.js'
import type { SessionManager } from './sessions.js'
export function createApp(manager: SessionManager) {
  const app = new Hono()
  app.use('/api/*', bodyLimit({ maxSize: 1_100_000, onError: c => c.json({ message: 'リクエストが大きすぎます。' }, 413) }))
  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('Origin')
    const allowed = [5173, config.apiPort].flatMap(port => [`http://127.0.0.1:${port}`, `http://localhost:${port}`])
    if (origin && !allowed.includes(origin)) return c.json({ message: 'このオリジンからの操作は許可されていません。' }, 403)
    if (c.req.method === 'POST' && !c.req.header('Content-Type')?.startsWith('application/json')) {
      return c.json({ message: 'JSON 形式で送信してください。' }, 415)
    }
    await next()
  })
  app.route('/api/health', healthRoutes(manager))
  app.route('/api/sessions', sessionRoutes(manager))
  app.onError((error, c) => c.json({ error: serializeSqlError(error) }, 400))
  app.notFound(c => c.json({ message: 'ページが見つかりません。' }, 404))
  return app
}
