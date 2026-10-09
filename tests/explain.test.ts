import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { config } from '../server/config.js'
import { SessionManager } from '../server/sessions.js'
import { explainRequest, needsCleanupRollback } from '../src/components/explain/ExplainPlan.js'
import type { QueryResponse } from '../src/shared/types.js'

const manager = new SessionManager()
const app = createApp(manager)
const host = `127.0.0.1:${config.apiPort}`

async function query(sql: string, id = 'A'): Promise<QueryResponse> {
  const response = await app.request(`/api/sessions/${id}/query`, { method: 'POST', headers: { 'Content-Type': 'application/json', Host: host }, body: JSON.stringify({ sql }) })
  expect(response.status).toBe(200)
  return await response.json() as QueryResponse
}
afterAll(() => manager.close())

describe('explain panel request building', () => {
  it('wraps only ANALYZE of modifying statements', () => {
    expect(explainRequest('SELECT 1', 'FORMAT JSON', false)).toBe('EXPLAIN (FORMAT JSON) SELECT 1')
    expect(explainRequest('UPDATE t SET x = 1', 'FORMAT JSON, ANALYZE', true))
      .toBe('BEGIN; EXPLAIN (FORMAT JSON, ANALYZE) UPDATE t SET x = 1; ROLLBACK;')
  })
  it('requires a cleanup ROLLBACK only when a wrapped batch failed', () => {
    const failed: QueryResponse = { results: [], notices: [], error: { code: '42P01', message: 'm', ja: { title: 't', explanation: 'e', tip: 'x' } } }
    const ok: QueryResponse = { results: [], notices: [] }
    expect(needsCleanupRollback(true, failed)).toBe(true)
    expect(needsCleanupRollback(false, failed)).toBe(false)
    expect(needsCleanupRollback(true, ok)).toBe(false)
  })
})

describe('explain-wrap rollback against the real API', () => {
  it('a failed wrapped batch aborts the transaction and the cleanup ROLLBACK restores idle', async () => {
    expect((await app.request('/api/sessions/A/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', Host: host }, body: JSON.stringify(config.learner) })).status).toBe(200)
    // Exactly what the explain panel sends for a modifying statement under ANALYZE.
    const wrapped = explainRequest('UPDATE public.no_such_explain_table SET x = 1', 'FORMAT JSON, ANALYZE', true)
    const result = await query(wrapped)
    expect(result.error?.code).toBe('42P01')
    expect(needsCleanupRollback(true, result)).toBe(true)
    // The batch's trailing ROLLBACK never ran: the session is now inside an aborted transaction.
    expect(manager.status('A').transactionStatus).toBe('failed')
    // ... and without the cleanup, every further statement fails with 25P02.
    expect((await query('SELECT 1')).error?.code).toBe('25P02')
    // The cleanup the panel performs after the error:
    const cleanup = await query('ROLLBACK')
    expect(cleanup.error).toBeUndefined()
    expect(manager.status('A').transactionStatus).toBe('idle')
    expect((await query('SELECT 1')).error).toBeUndefined()
  })
  it('a successful wrapped batch runs, rolls back its changes and needs no cleanup', async () => {
    await query('DROP TABLE IF EXISTS public.explain_wrap_demo')
    expect((await query('CREATE TABLE public.explain_wrap_demo (id integer)')).error).toBeUndefined()
    const wrapped = explainRequest('UPDATE public.explain_wrap_demo SET id = 1', 'FORMAT JSON, ANALYZE', true)
    const result = await query(wrapped)
    expect(result.error).toBeUndefined()
    expect(needsCleanupRollback(true, result)).toBe(false)
    expect(manager.status('A').transactionStatus).toBe('idle')
    const explained = result.results.find(item => item.fields.some(field => field.name === 'QUERY PLAN'))
    expect(explained?.command).toBe('EXPLAIN')
    expect((await query('DROP TABLE public.explain_wrap_demo')).error).toBeUndefined()
  })
})
