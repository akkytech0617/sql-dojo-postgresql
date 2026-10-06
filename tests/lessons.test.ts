import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { config } from '../server/config.js'
import { withAdmin } from '../server/lessons.js'
import { splitStatements } from '../server/lesson-sql.js'
import { SessionManager } from '../server/sessions.js'
import { chapters } from '../lessons/index.js'
import demoChapter from './fixtures/demoChapter.js'
import type { Chapter, CheckRequest, CheckResponse, ResetResponse, Step } from '../src/shared/lessons.js'
import type { QueryResponse } from '../src/shared/types.js'
const managers: SessionManager[] = []
function harness(content: Chapter[]) {
  const manager = new SessionManager(); managers.push(manager)
  const app = createApp(manager, content)
  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await app.request(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const result: unknown = await response.json()
    expect(response.status, JSON.stringify(result)).toBe(200)
    return result as T
  }
  const query = (id: string, sql: string) => post<QueryResponse>(`/sessions/${id}/query`, { sql })
  const check = (input: CheckRequest) => post<CheckResponse>('/lessons/check', input)
  const reset = (toChapter: number) => post<ResetResponse>('/reset', { toChapter })
  async function execute(step: Step) {
    for (const id of ['A', 'B'] as const) if (step.connect?.[id]) {
      await post(`/sessions/${id}/connect`, step.connect[id])
    }
    if (step.check.type === 'manual') return
    if (step.check.type === 'script') {
      expect(step.script?.length).toBeGreaterThan(0)
      expect(step.replay, `${step.id}: AB/script requires replay`).toBeDefined()
      const pending: Promise<void>[] = []
      const pendingBySession = new Map<string, Promise<void>>()
      const done: boolean[] = []
      for (const action of step.script!) {
        await pendingBySession.get(action.session)
        pendingBySession.delete(action.session)
        let settled = false
        const running = query(action.session, action.sql).then(result => { settled = true; return result })
        if (action.expect === 'blocks') {
          await new Promise(resolve => setTimeout(resolve, 500))
          expect(settled, `${step.id}: expected blocked query`).toBe(false)
          const finished = running.then(result => {
            if (action.completionErrorCode) expect(result.error?.code).toBe(action.completionErrorCode)
            else expect(result.error, JSON.stringify(result)).toBeUndefined()
          })
          // Attach handlers immediately; Promise.all later also propagates failures.
          void finished.catch(() => undefined)
          pending.push(finished)
          pendingBySession.set(action.session, finished)
        } else {
          const result = await running
          if (action.expect === 'ok') expect(result.error, JSON.stringify(result)).toBeUndefined()
          else expect(result.error?.code).toBe(action.expect.errorCode)
        }
        done.push(true)
      }
      await Promise.all(pending)
      expect((await check({ stepId: step.id, scriptCompleted: done.map(() => false) })).passed).toBe(false)
      expect((await check({ stepId: step.id, scriptCompleted: done })).passed).toBe(true)
      return
    }
    const id = step.session === 'AB' ? 'A' : step.session
    // New independent steps use their declared DB unless connect intentionally sets a lesson role.
    if (!step.connect && manager.status(id).database !== (step.database ?? 'library')) {
      await post(`/sessions/${id}/connect`, { user: 'admin', password: '', database: step.database ?? 'library' })
    }
    if (step.check.type === 'sql' && !step.checkPassesBefore) {
      expect((await check({ stepId: step.id })).passed, `${step.id}: check must fail before solution`).toBe(false)
    }
    const result = await query(id, step.solution)
    if (step.check.type === 'error-code') {
      expect(step.replay, `${step.id}: error step requires replay`).toBeDefined()
      expect(result.error?.code, JSON.stringify(result)).toBe(step.check.code)
      expect((await check({ stepId: step.id, lastError: result.error })).passed).toBe(true)
      expect((await check({ stepId: step.id, lastError: { code: '00000' } })).passed).toBe(false)
    } else {
      expect(result.error, `${step.id}: ${JSON.stringify(result)}`).toBeUndefined()
      expect((await check({ stepId: step.id, lastResult: result.results.at(-1) })).passed).toBe(true)
      if (step.check.type === 'result-equals') {
        const actual = result.results.at(-1)!
        expect((await check({ stepId: step.id, lastResult: { ...actual, rows: [], rowCount: 0 } })).passed, `${step.id}: empty wrong result must fail`).toBe(false)
      }
    }
  }
  return { app, manager, post, query, check, reset, execute }
}
/** Stable catalog fingerprint: never compare OIDs, timestamps, sequence counters or encrypted passwords. */
async function fingerprint() {
  const cluster = await withAdmin('postgres', async client => ({
    databases: (await client.query("SELECT datname,pg_encoding_to_char(encoding) AS encoding,datcollate,datctype,datacl::text FROM pg_database WHERE datname='library'")).rows,
    roles: (await client.query("SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls FROM pg_roles WHERE starts_with(rolname,'lib_') ORDER BY rolname")).rows,
    memberships: (await client.query("SELECT r.rolname AS role,m.rolname AS member,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member WHERE starts_with(r.rolname,'lib_') ORDER BY 1,2")).rows,
  }))
  if (!cluster.databases.length) return { cluster }
  const schema = await withAdmin('library', async client => {
    const queries = {
      schemas: "SELECT nspname,nspacl::text FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' ORDER BY 1",
      tables: "SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,obj_description(c.oid,'pg_class') AS comment FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','staging') ORDER BY 1,2",
      columns: "SELECT table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default,is_identity,identity_generation,character_maximum_length,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema IN ('public','staging') ORDER BY 1,2,ordinal_position",
      constraints: "SELECT n.nspname,c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','staging') ORDER BY 1,2,3",
      indexes: "SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('public','staging') ORDER BY 1,2,3",
      views: "SELECT n.nspname,c.relname,pg_get_viewdef(c.oid) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m') ORDER BY 1,2",
      routines: "SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args,pg_get_functiondef(p.oid) AS definition,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY 1,2",
      triggers: "SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2",
      policies: "SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2,3",
      defaults: "SELECT r.rolname,n.nspname,d.defaclobjtype,d.defaclacl::text FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY 1,2,3",
      columnGrants: "SELECT grantee,table_name,column_name,privilege_type FROM information_schema.column_privileges WHERE starts_with(grantee,'lib_') ORDER BY 1,2,3,4",
    }
    const result: Record<string, unknown> = {}
    for (const [key, sql] of Object.entries(queries)) result[key] = (await client.query(sql)).rows
    return result
  })
  return { cluster, schema }
}
const range = /^(\d+)(?:-(\d+))?$/.exec(process.env.LESSON_CHAPTERS ?? '0-12')
if (!range) throw new Error('LESSON_CHAPTERS must be e.g. 3-6 or 7')
const first = Number(range[1]), last = Number(range[2] ?? range[1])
if (first < 0 || last > 12 || first > last) throw new Error('LESSON_CHAPTERS range must be within 0-12')
afterAll(async () => { await Promise.all(managers.map(manager => manager.close())) })
describe('canonical lessons (real PostgreSQL, ordered)', () => {
  const h = harness(chapters)
  it(`prepares chapter ${first}`, async () => { await h.reset(first) })
  for (const chapter of chapters.filter(chapter => chapter.id >= first && chapter.id <= last)) {
    it(`ch${String(chapter.id).padStart(2, '0')} ${chapter.title}: solutions/checks and replay fingerprint`, async () => {
      for (const step of chapter.steps) await h.execute(step)
      const actual = await fingerprint()
      await h.reset(chapter.id + 1)
      expect(await fingerprint(), `chapter ${chapter.id}: replay differs from solutions`).toEqual(actual)
    })
  }
})
describe('lesson engine fixture and regression checks', () => {
  const h = harness([demoChapter])
  it('runs a real three-step demo and verifies replay', async () => {
    await h.reset(0)
    for (const step of demoChapter.steps) await h.execute(step)
    const actual = await fingerprint()
    await h.reset(2)
    expect(await fingerprint()).toEqual(actual)
    expect((await h.app.request('/api/lessons')).status).toBe(200)
    expect((await h.app.request('/api/lessons')).headers.get('content-type')).toContain('application/json')
  })
  it('checks errors and ordered two-session lock scripts', async () => {
    const errorStep: Step = { id: 'ch02-01', title: 'error', session: 'A', explanation: '', task: '', hints: [], solution: "INSERT INTO public.demo VALUES(1,'duplicate')", replay: '', check: { type: 'error-code', code: '23505' } }
    const scriptStep: Step = { ...errorStep, id: 'ch02-02', session: 'AB', solution: '', replay: '', check: { type: 'script' },
      connect: { A: { user: 'admin', password: '', database: 'library' }, B: { user: 'admin', password: '', database: 'library' } },
      script: [
        { session: 'A', sql: 'BEGIN; SELECT * FROM public.demo FOR UPDATE', expect: 'ok' },
        { session: 'B', sql: "BEGIN; UPDATE public.demo SET title='pending' WHERE id=1", expect: 'blocks' },
        { session: 'A', sql: 'ROLLBACK', expect: 'ok' },
        { session: 'B', sql: 'ROLLBACK', expect: 'ok' },
      ] }
    const scripts = harness([demoChapter, { id: 2, title: 'scripts', summary: '', steps: [errorStep, scriptStep] }])
    await h.manager.close()
    await scripts.reset(2)
    await scripts.execute(errorStep)
    await scripts.execute(scriptStep)
    expect(scripts.manager.status('A').transactionStatus).toBe('idle')
    expect(scripts.manager.status('B').transactionStatus).toBe('idle')
    await scripts.manager.close()
  })
  it('loads canonical schema/seed/CSV and enforces password authentication and safe role cleanup', async () => {
    await h.reset(2)
    expect((await h.query('A', 'DROP TABLE public.demo; -- fixture cleanup\n-- @include schema.sql')).error).toBeUndefined()
    expect((await h.post<QueryResponse>('/lessons/csv', { file: 'authors.csv', session: 'A' })).error).toBeUndefined()
    expect((await h.query('A', '-- @include seed.sql')).error).toBeUndefined()
    const counts = await h.query('A', `SELECT (SELECT count(*) FROM categories)::int AS categories,
      (SELECT count(*) FROM authors)::int AS authors,(SELECT count(*) FROM books)::int AS books,
      (SELECT count(*) FROM book_authors)::int AS book_authors,(SELECT count(*) FROM copies)::int AS copies,
      (SELECT count(*) FROM members)::int AS members,(SELECT count(*) FROM loans)::int AS loans,
      (SELECT count(*) FROM loans WHERE returned_on IS NULL AND due_on<CURRENT_DATE)::int AS overdue`)
    expect(counts.results[0].rows[0]).toEqual({ categories: 10, authors: 30, books: 50, book_authors: 55, copies: 80, members: 20, loans: 100, overdue: 10 })
    const user = 'lib_engine_test'
    expect((await h.query('A', `CREATE ROLE ${user} LOGIN PASSWORD 'lib_engine_test_pw'; GRANT CONNECT ON DATABASE library TO ${user};`)).error).toBeUndefined()
    expect((await h.query('admin', `CREATE TABLE public.lib_engine_owned(value integer); ALTER TABLE public.lib_engine_owned OWNER TO ${user}`)).error).toBeUndefined()
    const bad = await h.app.request('/api/sessions/B/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password: 'wrong', database: 'library' }) })
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe('28P01')
    await h.post('/sessions/B/connect', { user, password: 'lib_engine_test_pw', database: 'library' })
    expect((await h.query('B', 'SELECT current_user')).results[0].rows[0]).toEqual({ current_user: user })
    await h.reset(0)
    expect(await withAdmin('postgres', async client => (await client.query("SELECT count(*)::int AS count FROM pg_roles WHERE starts_with(rolname,'lib_')")).rows[0].count)).toBe(0)
    // Ownership in postgres is preserved under admin, not destructively dropped.
    expect((await h.query('admin', 'SELECT * FROM public.lib_engine_owned')).error).toBeUndefined()
    await h.query('admin', 'DROP TABLE public.lib_engine_owned')
  })
  it('rejects malformed input and unsafe asset paths', async () => {
    const bad = (path: string, body: unknown) => h.app.request(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    expect((await bad('/lessons/check', { stepId: 'nope' })).status).toBe(400)
    expect((await bad('/lessons/check', { stepId: 'ch99-99' })).status).toBe(400)
    expect((await bad('/reset', { toChapter: 14 })).status).toBe(400)
    expect((await bad('/reset', { toChapter: '1' })).status).toBe(400)
    expect((await bad('/lessons/csv', { file: '../../.env', session: 'A' })).status).toBe(400)
    expect((await bad('/sessions/A/query', { sql: '-- @include unknown.sql' })).status).toBe(400)
  })
})
describe('SQL replay statement splitting', () => {
  it('preserves dollar quotes, escaped strings, comments and nested block comments', () => {
    const sql = `CREATE DATABASE library; DO $body$ BEGIN RAISE NOTICE 'semi;colon'; END $body$;
SELECT 'it''s;', E'escaped\\\\\\';still', "a;b"; /* outer; /* inner; */ done */ SELECT 1; -- ;
SELECT 2;`
    expect(splitStatements(sql)).toHaveLength(5)
    expect(splitStatements('SELECT $$a;b$$; SELECT 2')).toEqual(['SELECT $$a;b$$', 'SELECT 2'])
  })
  it('uses the environment-selected isolated Postgres port', () => { expect(config.port).toBe(Number(process.env.PGPORT ?? 5433)) })
})
