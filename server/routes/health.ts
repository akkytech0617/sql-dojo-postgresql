import { Hono } from 'hono'
import type { SessionManager } from '../sessions.js'
export function healthRoutes(manager: SessionManager) {
  return new Hono().get('/', async c => {
    const ok = await manager.health()
    return c.json({ ok, database: ok ? 'reachable' : 'unreachable' }, ok ? 200 : 503)
  })
}
