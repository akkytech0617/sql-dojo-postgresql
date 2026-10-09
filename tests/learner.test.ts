import { afterAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { config } from '../server/config.js'
import { provisionLearnerRole } from '../server/learner.js'
import { withAdmin } from '../server/lessons.js'
import { SessionManager } from '../server/sessions.js'
import type { QueryResponse } from '../src/shared/types.js'

const manager = new SessionManager()
const app = createApp(manager)
const host = `127.0.0.1:${config.apiPort}`
afterAll(() => manager.close())

async function query(sql: string): Promise<QueryResponse> {
  const response = await app.request('/api/sessions/A/query', { method: 'POST', headers: { 'Content-Type': 'application/json', Host: host }, body: JSON.stringify({ sql }) })
  expect(response.status).toBe(200)
  return await response.json() as QueryResponse
}
async function reset(toChapter: number): Promise<void> {
  const response = await app.request('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json', Host: host }, body: JSON.stringify({ toChapter }) })
  expect(response.status, await response.text()).toBe(200)
}

describe('non-superuser learner role', () => {
  it('provisions the learner role idempotently with exactly the lesson attributes', async () => {
    await provisionLearnerRole()
    await provisionLearnerRole()
    const role = await withAdmin('postgres', async client => (await client.query<{
      rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolbypassrls: boolean; rolcanlogin: boolean; monitor: boolean
    }>(`SELECT r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls, r.rolcanlogin,
        EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
          WHERE m.member = r.oid AND g.rolname = 'pg_monitor') AS monitor
      FROM pg_roles r WHERE r.rolname = $1`, [config.learner.user])).rows[0])
    expect(role).toEqual({ rolsuper: false, rolcreatedb: true, rolcreaterole: true, rolbypassrls: false, rolcanlogin: true, monitor: true })
  })
  it('runs learner sessions as dojo_learner with rolsuper false', async () => {
    const result = await query('SELECT current_user AS account, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS rolsuper')
    expect(result.error).toBeUndefined()
    expect(result.results[0].rows).toEqual([{ account: config.learner.user, rolsuper: false }])
  })
  it('rejects shell, server-file and privilege-escalation SQL from learner sessions', async () => {
    for (const sql of [
      "COPY (SELECT 1) TO PROGRAM 'id'",
      "COPY (SELECT 1) TO '/tmp/sql-dojo-probe'",
      "SELECT pg_read_file('/etc/passwd')",
      `ALTER ROLE ${config.learner.user} SUPERUSER`,
      `GRANT pg_execute_server_program TO ${config.learner.user}`,
      `ALTER ROLE ${config.admin.user} PASSWORD 'x'`,
      'SET SESSION AUTHORIZATION ' + config.admin.user,
    ]) expect((await query(sql)).error?.code, sql).toBe('42501')
  })
  it('refuses to open a session as a superuser, even with valid credentials', async () => {
    const response = await app.request('/api/sessions/B/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', Host: host }, body: JSON.stringify(config.admin) })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('42501')
    expect(manager.status('B').connected).toBe(false)
  })
  it('owns the replayed library database and its tables', async () => {
    await reset(3)
    const database = await withAdmin('postgres', async client =>
      (await client.query<{ owner: string }>('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1', ['library'])).rows[0].owner)
    const tables = await withAdmin('library', async client =>
      (await client.query<{ owner: string }>(
        "SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'")).rows.map(row => row.owner))
    expect(database).toBe(config.learner.user)
    expect(tables).toEqual([config.learner.user])
  })
  it('warns when library is still owned by the old admin account', async () => {
    await reset(3)
    await withAdmin('postgres', client => client.query(`ALTER DATABASE library OWNER TO ${config.admin.user}`))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      await provisionLearnerRole()
      expect(warn.mock.calls.flat().join('\n')).toContain('library')
    } finally {
      warn.mockRestore()
      await withAdmin('postgres', client => client.query(`ALTER DATABASE library OWNER TO ${config.learner.user}`))
    }
  })
})
