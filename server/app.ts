import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { config } from './config.js'
import { serializeSqlError } from './errors-ja.js'
import { healthRoutes } from './routes/health.js'
import { sessionRoutes } from './routes/sessions.js'
import type { SessionManager } from './sessions.js'
import { LessonEngine } from './lessons.js'
import { lessonRoutes } from './routes/lessons.js'
import { schemaRoutes } from './routes/schema.js'
import { monitorRoutes } from './routes/monitor.js'
import { privilegesRoutes } from './routes/privileges.js'
import type { Chapter } from '../src/shared/lessons.js'
export function createApp(manager: SessionManager, chapters?: Chapter[]) {
  const engine = new LessonEngine(manager, chapters)
  const app = new Hono()
  app.use('/api/*', bodyLimit({ maxSize: 1_100_000, onError: c => c.json({ message: 'リクエストが大きすぎます。' }, 413) }))
  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('Origin')
    const ports = [5173, config.apiPort]
    const allowed = ports.flatMap(port => [`http://127.0.0.1:${port}`, `http://localhost:${port}`])
    if (origin && !allowed.includes(origin)) return c.json({ message: 'このオリジンからの操作は許可されていません。' }, 403)
    // DNS rebinding guard: a rebound hostname resolves here with the attacker's Host header.
    // Browsers always send Host, and the Vite dev proxy keeps the browser's Host (changeOrigin is
    // off), so exactly these local hosts are allowed and anything else is rejected.
    const host = c.req.header('Host')
    const allowedHosts = ports.flatMap(port => [`127.0.0.1:${port}`, `localhost:${port}`])
    if (!host || !allowedHosts.includes(host.toLowerCase())) return c.json({ message: 'このホストからのリクエストは許可されていません。' }, 403)
    if (c.req.method === 'POST' && !c.req.header('Content-Type')?.startsWith('application/json')) {
      return c.json({ message: 'JSON 形式で送信してください。' }, 415)
    }
    await next()
  })
  app.use('/api/*', async (c, next) => {
    if (engine.resetting) return c.json({ message: 'リセット中です。少し待ってください。' }, 409)
    await next()
  })
  app.route('/api/health', healthRoutes(manager))
  app.route('/api/sessions', sessionRoutes(manager))
  app.route('/api/lessons', lessonRoutes(engine, manager))
  app.route('/api/schema', schemaRoutes())
  app.route('/api/monitor', monitorRoutes(manager))
  app.route('/api/privileges', privilegesRoutes())
  app.post('/api/reset', async c => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ message: 'リセット指定が不正です。' }, 400)
    const toChapter = (body as { toChapter?: unknown }).toChapter
    if (toChapter !== undefined && typeof toChapter !== 'number') return c.json({ message: '章番号が不正です。' }, 400)
    return c.json(await engine.reset(toChapter))
  })
  app.onError((error, c) => c.json({ error: serializeSqlError(error) }, 400))
  app.notFound(c => c.json({ message: 'ページが見つかりません。' }, 404))
  return app
}
