import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { config } from '../server/config.js'
import { chapters } from '../lessons/index.js'
import { SessionManager } from '../server/sessions.js'
import type { PrivilegesResponse, TablePrivilege } from '../src/shared/privileges.js'

/** The viewer reads the real ch10 end state, so replay the real ch0-10 lessons first. */
const manager = new SessionManager()
const app = createApp(manager, chapters)
// Hono's app.request() sends no Host header, but the API requires an allowlisted one.
const host = `127.0.0.1:${config.apiPort}`

async function fetchPrivileges(query = '?database=library'): Promise<PrivilegesResponse> {
  const response = await app.request(`/api/privileges${query}`, { headers: { Host: host } })
  const data: unknown = await response.json()
  expect(response.status, JSON.stringify(data)).toBe(200)
  return data as PrivilegesResponse
}

describe('privileges viewer API (ch10 end state)', () => {
  it('prepares chapter 11 by replaying the real ch0-10 lessons', async () => {
    const response = await app.request('/api/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Host: host }, body: JSON.stringify({ toChapter: 11 }),
    })
    expect(response.status).toBe(200)
    const result = await response.json() as { replayedSteps: string[] }
    expect(result.replayedSteps).toContain('ch08-11')   // ch8 ends with the index/plan steps
    expect(result.replayedSteps).toContain('ch10-05')   // column-level grants
    expect(result.replayedSteps).toContain('ch10-17')   // chapter end: back to the admin account
  })

  it('reports roles, login attributes and memberships', async () => {
    const data = await fetchPrivileges()
    const names = data.roles.map(role => role.name)
    expect(names).toEqual(['dojo_admin', 'lib_app', 'lib_director', 'lib_librarian', 'lib_reader', 'lib_sato', 'lib_tanaka', 'lib_yamada'])
    const byName = Object.fromEntries(data.roles.map(role => [role.name, role]))
    expect(data.roles.filter(role => role.name.startsWith('lib_')).every(role => !role.superuser)).toBe(true)
    expect(byName.dojo_admin.superuser).toBe(true)
    expect(byName.lib_director).toMatchObject({ canLogin: false, memberOf: [], members: ['lib_yamada'] })
    expect(byName.lib_librarian).toMatchObject({ canLogin: false, memberOf: [], members: ['lib_tanaka'] })
    expect(byName.lib_reader).toMatchObject({ canLogin: false, memberOf: [], members: ['lib_sato'] })
    expect(byName.lib_tanaka).toMatchObject({ canLogin: true, memberOf: ['lib_librarian'], members: [] })
    expect(byName.lib_sato).toMatchObject({ canLogin: true, memberOf: ['lib_reader'], members: [] })
    expect(byName.lib_yamada).toMatchObject({ canLogin: true, memberOf: ['lib_director'], members: [] })
    expect(byName.lib_app).toMatchObject({ canLogin: true, memberOf: [] })
    expect(byName.dojo_admin.canLogin).toBe(true)
  })

  it('reports database and schema privileges including PUBLIC', async () => {
    const data = await fetchPrivileges()
    const db = Object.fromEntries(data.databasePrivileges.map(row => [row.role, row]))
    expect(db.public).toMatchObject({ connect: false, create: false })  // REVOKE ... FROM PUBLIC (ch10-02)
    expect(db.lib_reader).toMatchObject({ connect: true, create: false })
    expect(db.lib_sato).toMatchObject({ connect: true, temp: true })   // inherited via membership
    expect(db.lib_app).toMatchObject({ connect: true })
    const schemas = [...new Set(data.schemaPrivileges.map(row => row.schema))]
    expect(schemas).toEqual(['public', 'staging'])
    const schema = Object.fromEntries(data.schemaPrivileges.filter(row => row.schema === 'public').map(row => [row.role, row]))
    expect(schema.public).toMatchObject({ usage: true, create: false })
    expect(schema.lib_app).toMatchObject({ usage: true, create: false })
    expect(schema.lib_tanaka).toMatchObject({ usage: true, create: false })
    const stagingPublic = data.schemaPrivileges.find(row => row.schema === 'staging' && row.role === 'public')
    expect(stagingPublic).toMatchObject({ usage: false, create: false })  // PG15+: new schemas do not open USAGE to PUBLIC
  })

  it('distinguishes direct, inherited and missing table privileges in the matrix', async () => {
    const data = await fetchPrivileges()
    const mode = (table: string, role: string, privilege: TablePrivilege) => {
      const entry = data.tables.find(item => item.table === table)?.entries.find(item => item.role === role)
      return entry?.privileges[privilege]
    }
    // Grantees of ch10-04: direct grants to the group roles.
    expect(mode('loans', 'lib_librarian', 'INSERT')).toBe('direct')
    expect(mode('loans', 'lib_librarian', 'UPDATE')).toBe('direct')
    expect(mode('loans', 'lib_librarian', 'DELETE')).toBe('none')
    expect(mode('members', 'lib_director', 'DELETE')).toBe('direct')
    expect(mode('books', 'lib_reader', 'SELECT')).toBe('direct')
    expect(mode('books', 'lib_reader', 'INSERT')).toBe('none')
    // Members exercise the privileges through membership: inherited, not direct.
    expect(mode('loans', 'lib_tanaka', 'INSERT')).toBe('inherited')
    expect(mode('loans', 'lib_tanaka', 'DELETE')).toBe('none')
    expect(mode('books', 'lib_sato', 'SELECT')).toBe('inherited')
    expect(mode('members', 'lib_yamada', 'DELETE')).toBe('inherited')
    // PUBLIC lost library access; readers never see loans or members.
    expect(mode('books', 'public', 'SELECT')).toBe('none')
    expect(mode('loans', 'lib_sato', 'SELECT')).toBe('none')
    expect(mode('members', 'lib_reader', 'SELECT')).toBe('none')
    // lib_app gets table-level loans and catalog tables, but only column-level members (ch10-05).
    expect(mode('loans', 'lib_app', 'INSERT')).toBe('direct')
    expect(mode('loans', 'lib_app', 'DELETE')).toBe('none')
    expect(mode('copies', 'lib_app', 'SELECT')).toBe('direct')
    expect(mode('members', 'lib_app', 'SELECT')).toBe('none')
    // The owner holds everything directly; views and sequences are out of the table matrix.
    expect(mode('members', 'dojo_admin', 'SELECT')).toBe('direct')
    expect(mode('members', 'dojo_admin', 'TRIGGER')).toBe('direct')
    expect(data.tables.map(table => table.table)).not.toContain('v_book_catalog')
    expect(data.tables.map(table => table.table)).toContain('loan_history')
  })

  it('reports column-level grants only for the granted columns', async () => {
    const data = await fetchPrivileges()
    expect(data.columns).toEqual([
      { table: 'members', column: 'member_id', role: 'lib_app', privileges: ['SELECT'] },
      { table: 'members', column: 'name', role: 'lib_app', privileges: ['SELECT'] },
    ])
    expect(data.columns.some(grant => grant.column === 'email')).toBe(false)
  })

  it('reports routine EXECUTE with PUBLIC revoked and return_loan granted to lib_app', async () => {
    const data = await fetchPrivileges()
    const execute = (name: string, role: string) => {
      const routine = data.routines.find(item => item.name === name)
      return routine?.entries.find(entry => entry.role === role)?.execute
    }
    expect(data.routines.map(routine => `${routine.kind}:${routine.name}(${routine.arguments})`).sort()).toEqual([
      'function:calc_late_fee(p_loan_id integer)',
      'function:check_loan_available()',
      'procedure:return_loan(IN p_loan_id integer, IN p_returned_on date)',
    ])
    expect(execute('return_loan', 'lib_app')).toBe('direct')
    expect(execute('return_loan', 'public')).toBe('none')
    expect(execute('return_loan', 'lib_tanaka')).toBe('none')
    expect(execute('calc_late_fee', 'public')).toBe('none')
    expect(execute('check_loan_available', 'public')).toBe('none')
    expect(execute('calc_late_fee', 'dojo_admin')).toBe('direct')
  })

  it('reports default privileges for dojo_admin in schema public', async () => {
    const data = await fetchPrivileges()
    const tables = data.defaultPrivileges.find(item => item.ownerRole === 'dojo_admin' && item.schema === 'public' && item.objectType === 'TABLES')
    expect(tables?.grants).toEqual([
      { grantee: 'lib_librarian', privileges: ['INSERT', 'SELECT', 'UPDATE'] },
      { grantee: 'lib_reader', privileges: ['SELECT'] },
    ])
    const sequences = data.defaultPrivileges.find(item => item.ownerRole === 'dojo_admin' && item.schema === 'public' && item.objectType === 'SEQUENCES')
    expect(sequences?.grants).toEqual([{ grantee: 'lib_librarian', privileges: ['SELECT', 'USAGE'] }])
  })

  it('reports RLS status and the members_self_policy definition', async () => {
    const data = await fetchPrivileges()
    const members = data.tables.find(table => table.table === 'members')
    expect(members?.rlsEnabled).toBe(true)
    expect(members?.rlsForced).toBe(false)
    expect(members?.policies).toHaveLength(1)
    expect(members?.policies[0]).toMatchObject({
      name: 'members_self_policy', command: 'SELECT', roles: ['lib_app'], permissive: 'PERMISSIVE',
    })
    expect(members?.policies[0].using).toContain("current_setting('app.member_id'")
    expect(data.tables.every(table => table.table === 'members' || !table.rlsEnabled)).toBe(true)
  })

  it('validates the database name and serves other databases', async () => {
    expect((await app.request('/api/privileges?database=no_such_db', { headers: { Host: host } })).status).toBe(400)
    expect((await app.request('/api/privileges?database=template0', { headers: { Host: host } })).status).toBe(400)   // exists but datallowconn = false
    expect((await app.request('/api/privileges?database=' + 'x'.repeat(65), { headers: { Host: host } })).status).toBe(400)
    const defaultParam = await fetchPrivileges()                                        // defaults to library
    expect(defaultParam.database).toBe('library')
    const postgres = await fetchPrivileges('?database=postgres')
    expect(postgres.database).toBe('postgres')
    expect(postgres.tables).toEqual([])
    expect(postgres.roles.map(role => role.name)).toContain('dojo_admin')
  })
})

afterAll(async () => { await manager.close() })
