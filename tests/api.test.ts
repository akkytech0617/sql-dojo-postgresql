import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { config } from '../server/config.js'
import { SessionManager } from '../server/sessions.js'
import type { QueryResponse, SessionStatus } from '../src/shared/types.js'
const manager = new SessionManager()
const app = createApp(manager)
// Hono's app.request() sends no Host header, but the API requires an allowlisted one.
const host = `127.0.0.1:${config.apiPort}`
function post(path: string, body: unknown = {}) {
  return app.request(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Host: host }, body: JSON.stringify(body) })
}
async function query(sql: string, id = 'A'): Promise<QueryResponse> {
  const response = await post(`/sessions/${id}/query`, { sql })
  expect(response.status).toBe(200)
  return await response.json() as QueryResponse
}
afterAll(() => manager.close())
describe('PostgreSQL API (real database)', () => {
  it('reports health and default session names', async () => {
    expect(await (await app.request('/api/health', { headers: { Host: host } })).json()).toEqual({ ok: true, database: 'reachable' })
    const sessions = await (await app.request('/api/sessions', { headers: { Host: host } })).json() as SessionStatus[]
    expect(sessions.map(session => session.id)).toEqual(['admin', 'A', 'B'])
  })
  it('allowlists Host headers to block DNS rebinding reads', async () => {
    const allowed = [`localhost:${config.apiPort}`, `127.0.0.1:5173`, 'localhost:5173']
    for (const value of allowed) expect((await app.request('/api/health', { headers: { Host: value } })).status).toBe(200)
    for (const evil of ['evil.example.com', 'localhost:8080', '127.0.0.1:1', 'sub.localhost:3001']) {
      expect((await app.request('/api/health', { headers: { Host: evil } })).status).toBe(403)
    }
    // A browser always sends Host; a request without one is not a browser and is rejected too.
    expect((await app.request('/api/health')).status).toBe(403)
  })
  it('lazily connects and returns one SELECT with fields and duration', async () => {
    const result = await query('SELECT 42::integer AS answer, NULL::text AS empty')
    expect(result.error).toBeUndefined()
    expect(result.results[0].rows).toEqual([{ answer: 42, empty: null }])
    expect(result.results[0].fields[0]).toEqual({ name: 'answer', dataTypeID: 23 })
    expect(result.results[0].durationMs).toBeGreaterThanOrEqual(0)
    expect(manager.status('A').backendPid).toBeTypeOf('number')
  })
  it('supports multi-statement batches', async () => {
    const result = await query('SELECT 1 AS first; SELECT 2 AS second;')
    expect(result.results).toHaveLength(2)
    expect(result.results[1].rows).toEqual([{ second: 2 }])
  })
  it('maps a missing table to a Japanese error', async () => {
    const result = await query('SELECT * FROM nope')
    expect(result.error?.code).toBe('42P01')
    expect(result.error?.ja.title).toBe('テーブルが見つかりません')
  })
  it('collects notices without leaking listeners into later requests', async () => {
    expect((await query("DO $$ BEGIN RAISE NOTICE 'x'; END $$")).notices).toEqual([{ severity: 'NOTICE', message: 'x' }])
    expect((await query('SELECT 1')).notices).toEqual([])
  })
  it('persists transaction and temporary tables across requests', async () => {
    await query('CREATE TEMP TABLE tx_test (value integer)')
    await query('BEGIN')
    expect(manager.status('A').transactionStatus).toBe('transaction')
    await query('INSERT INTO tx_test VALUES (7)')
    expect((await query('SELECT * FROM tx_test')).results[0].rows).toEqual([{ value: 7 }])
    await query('ROLLBACK')
    expect(manager.status('A').transactionStatus).toBe('idle')
    expect((await query('SELECT * FROM tx_test')).results[0].rows).toEqual([])
  })
  it('reports failed transaction state and recovers after rollback', async () => {
    await query('BEGIN; SELECT * FROM nope')
    expect(manager.status('A').transactionStatus).toBe('failed')
    expect((await query('SELECT 1')).error?.code).toBe('25P02')
    await query('ROLLBACK')
  })
  it('caps response rows at 1000', async () => {
    const result = (await query('SELECT generate_series(1, 1005) AS n')).results[0]
    expect(result.rows).toHaveLength(1000)
    expect(result.rowCount).toBe(1005)
    expect(result.truncated).toBe(true)
  })
  it('cancels a busy query through a separate admin connection', async () => {
    const running = query('SELECT pg_sleep(10)')
    for (let i = 0; i < 100 && !manager.status('A').busy; i++) await new Promise(resolve => setTimeout(resolve, 10))
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(manager.status('A').busy).toBe(true)
    expect((await post('/sessions/A/connect', config.admin)).status).toBe(400)
    const response = await post('/sessions/A/cancel')
    expect(await response.json()).toEqual({ cancelled: true })
    expect((await running).error?.code).toBe('57014')
    expect(manager.status('A').busy).toBe(false)
  })
  it('serves only the fixed lesson sessions and rejects unknown ids with 404', async () => {
    expect((await post('/sessions/custom/connect', config.admin)).status).toBe(404)
    expect((await post('/sessions/E/query', { sql: 'SELECT 1' })).status).toBe(404)
    expect((await app.request('/api/sessions/zzz/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json', Host: host }, body: '{}' })).status).toBe(404)
    expect(manager.list().map(session => session.id)).toEqual(['admin', 'A', 'B'])
    // A/B/admin keep working after the rejected calls.
    expect((await query('SELECT current_database() AS db', 'B')).results[0].rows).toEqual([{ db: 'postgres' }])
    expect((await post('/sessions/B/disconnect')).status).toBe(200)
  })
  it('does not crash when another session terminates a backend', async () => {
    await query('SELECT 1', 'B')
    const pid = manager.status('B').backendPid
    await query(`SELECT pg_terminate_backend(${pid})`)
    for (let i = 0; i < 100 && manager.status('B').connected; i++) await new Promise(resolve => setTimeout(resolve, 10))
    expect(manager.status('B').connected).toBe(false)
    expect((await query('SELECT 1', 'B')).error?.code).toBe('08003')
    expect((await post('/sessions/B/connect', config.admin)).status).toBe(200)
  })
  it('validates SQL, session IDs, JSON and browser origins', async () => {
    expect((await post('/sessions/A/query', { sql: ' ' })).status).toBe(400)
    expect((await post('/sessions/A/query', { sql: 123 })).status).toBe(400)
    expect((await post('/sessions/bad!/query', { sql: 'SELECT 1' })).status).toBe(400)
    expect((await app.request('/api/sessions/A/cancel', { method: 'POST', headers: { Host: host } })).status).toBe(415)
    expect((await app.request('/api/sessions/A/cancel', { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json', Host: host }, body: '{}' })).status).toBe(403)
  })
})
