import { Hono } from 'hono'
import { z } from 'zod'
import type { LessonEngine } from '../lessons.js'
import type { SessionManager } from '../sessions.js'
import { csvSql } from '../lesson-sql.js'
const checkSchema = z.object({
  stepId: z.string().regex(/^ch\d{2}-\d{2}$/),
  lastResult: z.object({ command: z.string(), rowCount: z.number().nullable(), fields: z.array(z.object({ name: z.string(), dataTypeID: z.number() })), rows: z.array(z.record(z.string(), z.unknown())).max(1000), truncated: z.boolean(), durationMs: z.number() }).optional(),
  lastError: z.object({ code: z.string() }).optional(),
  scriptCompleted: z.array(z.boolean()).max(100).optional(),
})
export function lessonRoutes(engine: LessonEngine, manager: SessionManager) {
  const routes = new Hono()
  routes.get('/', c => c.json(engine.chapters))
  routes.post('/check', async c => {
    const parsed = checkSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ message: '採点データが不正です。' }, 400)
    return c.json(await engine.check(parsed.data))
  })
  routes.post('/csv', async c => {
    const parsed = z.object({ file: z.literal('authors.csv'), session: z.enum(['A', 'B']) }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ message: 'CSV の指定が不正です。' }, 400)
    return c.json(await manager.query(parsed.data.session, await csvSql(parsed.data.file)))
  })
  return routes
}
