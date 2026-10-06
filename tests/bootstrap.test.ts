import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { withAdmin } from '../server/lessons.js'
import { SessionManager } from '../server/sessions.js'
import type { Chapter, ResetResponse } from '../src/shared/lessons.js'
import type { QueryResponse } from '../src/shared/types.js'
import { readBootstrap, withBootstrap } from './helpers/bootstrap.js'
// Heavy (1M rows) and destructive; opt-in only: BOOTSTRAP_SELFTEST=1 PGPORT=... pnpm vitest run tests/bootstrap.test.ts
const enabled = process.env.BOOTSTRAP_SELFTEST === '1'
const step = (id: string, database: string, replay: string) => ({ id, title: id, explanation: '', task: '', hints: [], session: 'A' as const, database, solution: '', replay, check: { type: 'manual' as const } })
// Stand-in for the contract end-of-ch3 state, independent of the real ch1-3 files.
const base: Chapter[] = [
  { id: 0, title: '0', summary: '', steps: [] },
  { id: 1, title: '1', summary: '', steps: [step('ch01-01', 'postgres', "CREATE DATABASE library WITH ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0")] },
  { id: 2, title: '2', summary: '', steps: [step('ch02-01', 'library', '-- @include schema.sql')] },
  { id: 3, title: '3', summary: '', steps: [step('ch03-01', 'library', '-- @include seed.sql')] },
  { id: 4, title: '4', summary: '', steps: [] },
]
describe.skipIf(!enabled)('bootstrap-ch07-09.sql self-test', () => {
  const manager = new SessionManager()
  const sql = readBootstrap('tests/fixtures/bootstrap-ch07-09.sql')!
  const app = createApp(manager, withBootstrap(base, 4, sql))
  afterAll(() => manager.close())
  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await app.request(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data: unknown = await response.json()
    expect(response.status, JSON.stringify(data)).toBe(200)
    return data as T
  }
  async function one(text: string) {
    const result = await post<QueryResponse>('/sessions/A/query', { sql: text })
    expect(result.error, JSON.stringify(result.error)).toBeUndefined()
    return result.results.at(-1)!.rows[0]
  }
  it('replays end-of-ch3 + bootstrap and matches the contract', async () => {
    const reset = await post<ResetResponse>('/reset', { toChapter: 4 })
    expect(reset.replayedSteps).toEqual(['ch01-01', 'ch02-01', 'ch03-01', 'ch03-99'])
    expect(await one(`SELECT
      (SELECT count(*) FROM v_book_catalog)::int AS catalog,
      (SELECT count(*) FROM v_overdue_loans)::int AS overdue,
      (SELECT count(*) FROM mv_category_stats WHERE book_count = 5)::int AS stats,
      calc_late_fee(81) > 0 AS fee_overdue, calc_late_fee(95) AS fee_not_due, calc_late_fee(1) AS fee_returned,
      calc_late_fee(99999) IS NULL AS fee_missing,
      (SELECT count(*) FROM loan_history)::int AS history,
      (SELECT count(*) FROM loan_history WHERE returned_on IS NULL)::int AS open_history,
      (SELECT count(*) FROM pg_indexes WHERE indexname IN ('loan_history_member_idx','loan_history_member_date_idx','loan_history_open_idx','books_title_lower_idx'))::int AS indexes,
      (SELECT reltuples FROM pg_class WHERE relname = 'loan_history') > 0 AS analyzed,
      (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_loans_check_available')::int AS triggers`)).toEqual({
      catalog: 50, overdue: 10, stats: 10, fee_overdue: true, fee_not_due: 0, fee_returned: 0, fee_missing: true,
      history: 1_000_000, open_history: 100_000, indexes: 4, analyzed: true, triggers: 1,
    })
  })
  it('enforces the loan trigger and return procedure without changing the seed', async () => {
    const failed = await post<QueryResponse>('/sessions/A/query', { sql: 'INSERT INTO loans(copy_id,member_id,due_on) VALUES (61,1,CURRENT_DATE+14)' })
    expect(failed.error?.code).toBe('23514')
    await one('BEGIN')
    await one('INSERT INTO loans(copy_id,member_id,due_on) VALUES (1,1,CURRENT_DATE+14)')
    expect(await one('SELECT status FROM copies WHERE copy_id = 1')).toEqual({ status: 'loaned' })
    await one('CALL return_loan(81)')
    expect(await one('SELECT l.returned_on = CURRENT_DATE AS returned, c.status FROM loans l JOIN copies c USING (copy_id) WHERE loan_id = 81')).toEqual({ returned: true, status: 'available' })
    await one('ROLLBACK')
    expect(await one("SELECT count(*)::int AS loans, (SELECT count(*) FROM copies WHERE status='loaned')::int AS loaned FROM loans")).toEqual({ loans: 100, loaned: 20 })
  })
  it('can be re-applied idempotently', async () => {
    await withAdmin('library', async client => { await client.query(sql) })
    expect(await one('SELECT count(*)::int AS history FROM loan_history')).toEqual({ history: 1_000_000 })
  })
})
