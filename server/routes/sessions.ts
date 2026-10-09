import { Hono } from 'hono'
import { z } from 'zod'
import type { SessionManager } from '../sessions.js'
import { config } from '../config.js'
import { expandLessonSql } from '../lesson-sql.js'
const connectionSchema = z.object({ user: z.string().min(1).max(128), password: z.string().max(1024), database: z.string().min(1).max(128) })
const querySchema = z.object({ sql: z.string().trim().min(1).max(1_000_000) })
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)
/** The API only ever serves the fixed lesson sessions; anything else is unknown, not new. */
const sessionIds = new Set(['admin', 'A', 'B'])
export function sessionRoutes(manager: SessionManager) {
  const routes = new Hono()
  routes.use('/:id/*', async (c, next) => {
    const id = c.req.param('id')
    if (!idSchema.safeParse(id).success) return c.json({ message: 'セッション ID が不正です。' }, 400)
    if (!sessionIds.has(id)) return c.json({ message: 'セッションが見つかりません。admin / A / B のいずれかを指定してください。' }, 404)
    await next()
  })
  routes.get('/', c => c.json(manager.list()))
  routes.post('/:id/connect', async c => {
    const parsed = connectionSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ message: 'ユーザー名・パスワード・データベース名を確認してください。' }, 400)
    // The 'admin' shortcut names the learner's working account; it is not the dojo_admin superuser.
    const info = parsed.data.user === 'admin' ? { ...config.learner, database: parsed.data.database } : parsed.data
    return c.json(await manager.connect(c.req.param('id'), info))
  })
  routes.post('/:id/disconnect', async c => c.json(await manager.disconnect(c.req.param('id'))))
  routes.post('/:id/query', async c => {
    const parsed = querySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ message: '空でない SQL を入力してください（最大 100 万文字）。' }, 400)
    return c.json(await manager.query(c.req.param('id'), await expandLessonSql(parsed.data.sql)))
  })
  routes.post('/:id/cancel', async c => c.json({ cancelled: await manager.cancel(c.req.param('id')) }))
  return routes
}
