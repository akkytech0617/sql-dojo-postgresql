import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { config } from '../server/config.js'
import { withAdmin } from '../server/lessons.js'
import { chapters } from '../lessons/index.js'
import { SessionManager } from '../server/sessions.js'
import { buildErDiagram, mermaidType } from '../src/components/schema/erBuilder.js'
import type { ResetResponse } from '../src/shared/lessons.js'
import type { SchemaInfo, SchemaTable } from '../src/shared/schema.js'
import type { QueryResponse } from '../src/shared/types.js'
const manager = new SessionManager()
const app = createApp(manager, chapters)
const host = `127.0.0.1:${config.apiPort}`
afterAll(() => manager.close())
/** reset(4) replays ch0..3: the end-of-chapter-3 state (canonical seed, aligned sequences). */
async function reset(toChapter = 4): Promise<ResetResponse> {
  const response = await app.request('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json', Host: host }, body: JSON.stringify({ toChapter }) })
  expect(response.status).toBe(200)
  return await response.json() as ResetResponse
}
async function getSchema(database?: string): Promise<Response> {
  return app.request(`/api/schema${database === undefined ? '' : `?database=${encodeURIComponent(database)}`}`, { headers: { Host: host } })
}
async function connectA(database = 'library') {
  const response = await app.request('/api/sessions/A/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', Host: host }, body: JSON.stringify({ ...config.admin, database }) })
  expect(response.status).toBe(200)
}
async function query(sql: string): Promise<QueryResponse> {
  const response = await app.request('/api/sessions/A/query', { method: 'POST', headers: { 'Content-Type': 'application/json', Host: host }, body: JSON.stringify({ sql }) })
  expect(response.status).toBe(200)
  return await response.json() as QueryResponse
}
describe('schema browser API (real PostgreSQL)', () => {
  it('validates the database name', async () => {
    expect((await getSchema('Bad-Name')).status).toBe(400)
    expect((await getSchema('x; DROP TABLE t')).status).toBe(400)
    expect((await getSchema('postgres')).status).toBe(200)
  })
  it('reports missing databases with the remaining choices', async () => {
    const response = await getSchema('library_scratch')
    expect(response.status).toBe(404)
    const body = await response.json() as { message: string; databases: string[] }
    expect(body.message).toContain('library_scratch')
    expect(body.databases).toContain('postgres')
    expect(body.databases).not.toContain('library_scratch')
    expect(body.databases).not.toContain('template0')
  })
  it('describes the canonical chapter-3 library', async () => {
    await reset()
    const response = await getSchema('library')
    expect(response.status).toBe(200)
    const info = await response.json() as SchemaInfo
    expect(info.database).toBe('library')
    expect(info.databases).toContain('library')
    expect(info.databases).toContain('postgres')
    expect(info.databases).not.toContain('template0')
    expect(info.schemas).toEqual(['public', 'staging'])
    expect(info.tables.filter(table => table.schema === 'staging')).toEqual([])
    const publicTables = info.tables.filter(table => table.schema === 'public')
    expect(publicTables.map(table => table.name).sort()).toEqual(['authors', 'book_authors', 'books', 'categories', 'copies', 'loans', 'members'])
    expect(new Set(publicTables.map(table => table.kind))).toEqual(new Set(['table']))
    const byName = new Map(publicTables.map(table => [table.name, table]))
    expect(Object.fromEntries([...byName.get('books')!.columns.map(column => [column.name, column.dataType])])).toEqual({
      book_id: 'integer', isbn: 'character varying(13)', title: 'text', category_id: 'integer', published_year: 'integer', price: 'numeric(10,2)',
    })
    const books = byName.get('books')!
    expect(books.primaryKey).toEqual(['book_id'])
    expect(books.columns.find(column => column.name === 'book_id')!.identity).toBe('BY DEFAULT')
    expect(books.columns.find(column => column.name === 'price')!.default).toBe('0')
    expect(books.columns.find(column => column.name === 'published_year')!.nullable).toBe(true)
    expect(books.comment).toBe('書誌情報。物理的な一冊は copies で管理する')
    const members = byName.get('members')!
    expect(members.columns.find(column => column.name === 'deleted_at')!.dataType).toBe('timestamp with time zone')
    expect(members.columns.find(column => column.name === 'deleted_at')!.nullable).toBe(true)
    expect(members.columns.find(column => column.name === 'email')!.nullable).toBe(true)
    expect(byName.get('book_authors')!.primaryKey).toEqual(['book_id', 'author_id'])
    const loans = byName.get('loans')!
    expect(loans.columns.find(column => column.name === 'returned_on')!.nullable).toBe(true)
    const foreignKeys = Object.fromEntries(loans.foreignKeys.map(foreignKey => [foreignKey.name, foreignKey]))
    expect(foreignKeys.loans_copy_id_fkey).toMatchObject({ columnNames: ['copy_id'], referencesSchema: 'public', referencesTable: 'copies', onDelete: 'RESTRICT', onUpdate: 'NO ACTION' })
    expect(foreignKeys.loans_member_id_fkey).toMatchObject({ columnNames: ['member_id'], referencesTable: 'members', onDelete: 'RESTRICT' })
    const allForeignKeys = publicTables.flatMap(table => table.foreignKeys)
    expect(allForeignKeys).toHaveLength(6)
    expect(allForeignKeys.find(foreignKey => foreignKey.name === 'book_authors_book_id_fkey')!.onDelete).toBe('CASCADE')
    expect(allForeignKeys.find(foreignKey => foreignKey.name === 'books_category_id_fkey')!.referencesColumnNames).toEqual(['category_id'])
    const categories = byName.get('categories')!
    expect(categories.constraints.find(constraint => constraint.name === 'categories_name_nn')!.type).toBe('n')
    expect(categories.constraints.find(constraint => constraint.name === 'categories_pkey')!.definition).toBe('PRIMARY KEY (category_id)')
    expect(byName.get('loans')!.constraints.find(constraint => constraint.name === 'loans_due_on_check')!.type).toBe('c')
    const openCopy = loans.indexes.find(index => index.name === 'loans_one_open_copy_idx')
    expect(openCopy?.unique).toBe(true)
    expect(openCopy?.definition).toContain('WHERE')
    expect(loans.indexes.find(index => index.name === 'loans_pkey')!.unique).toBe(true)
    expect(Object.fromEntries(publicTables.map(table => [table.name, table.rowCount]))).toEqual({
      categories: 10, authors: 30, books: 50, book_authors: 55, copies: 80, members: 20, loans: 100,
    })
    const admin = info.roles.find(role => role.name === 'dojo_admin')
    expect(admin).toMatchObject({ superuser: true, canLogin: true })
    expect(info.roles.some(role => role.name.startsWith('pg_'))).toBe(false)
  })
  it('builds a mermaid ER diagram from the catalog', async () => {
    const response = await getSchema('library')
    const info = await response.json() as SchemaInfo
    const tables = info.tables.filter((table: SchemaTable) => table.schema === 'public')
    const diagram = buildErDiagram('public', tables)
    expect(diagram).toMatch(/^erDiagram\n/)
    expect(diagram).toContain('  books {')
    expect(diagram).toContain('    integer book_id PK')
    expect(diagram).toContain('    integer category_id FK')
    expect(diagram).toContain('    integer book_id PK, FK')
    expect(diagram).not.toContain(' PK FK')
    expect(diagram).toContain('  books }o--|| categories : "books_category_id_fkey ON DELETE RESTRICT"')
    expect(diagram).toContain('  book_authors }o--|| authors : "book_authors_author_id_fkey ON DELETE RESTRICT"')
    expect(diagram).toContain('  loans }o--|| copies : "loans_copy_id_fkey ON DELETE RESTRICT"')
    expect(diagram).toContain('    numeric price')
    expect(diagram).toContain('    varchar isbn')
    expect(diagram).toContain('    timestamptz deleted_at')
    expect(mermaidType('character varying(13)')).toBe('varchar')
    expect(mermaidType('timestamp with time zone')).toBe('timestamptz')
    expect(mermaidType('numeric(10,2)')).toBe('numeric')
  })
  it('orders composite keys by key position and keeps quoted identifiers whole', async () => {
    await connectA()
    const created = await query(`CREATE TABLE public.schema_probe ("comma, space" integer, z integer, a integer, CONSTRAINT schema_probe_pkey PRIMARY KEY (z, "comma, space"));
CREATE TABLE public.schema_probe_child (id integer CONSTRAINT schema_probe_child_pkey PRIMARY KEY, ref1 integer, ref2 integer, CONSTRAINT schema_probe_child_fkey FOREIGN KEY (ref2, ref1) REFERENCES public.schema_probe (z, "comma, space") ON DELETE CASCADE);`)
    expect(created.error, JSON.stringify(created.error)).toBeUndefined()
    try {
      const info = await (await getSchema('library')).json() as SchemaInfo
      const probe = info.tables.find(table => table.schema === 'public' && table.name === 'schema_probe')!
      const child = info.tables.find(table => table.schema === 'public' && table.name === 'schema_probe_child')!
      // Key order (indkey), not column definition order ("comma, space" comes first).
      expect(probe.primaryKey).toEqual(['z', 'comma, space'])
      // Column lists are arrays, so an identifier containing ", " stays one element.
      expect(child.foreignKeys.find(foreignKey => foreignKey.name === 'schema_probe_child_fkey')).toMatchObject({
        columnNames: ['ref2', 'ref1'], referencesSchema: 'public', referencesTable: 'schema_probe',
        referencesColumnNames: ['z', 'comma, space'], onDelete: 'CASCADE',
      })
    } finally {
      await query('DROP TABLE public.schema_probe_child; DROP TABLE public.schema_probe;')
    }
  })
  it('still answers quickly while another session holds an ACCESS EXCLUSIVE lock', async () => {
    await reset()
    await connectA()
    // ch02-09's experiment shape: DDL inside an open transaction keeps the lock until ROLLBACK.
    expect((await query('BEGIN; ALTER TABLE public.categories ADD COLUMN lock_probe integer;')).error).toBeUndefined()
    const expectedFallback = await withAdmin('library', async client => {
      const result = await client.query<{ reltuples: number }>("SELECT c.reltuples::bigint AS reltuples FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'categories'")
      return result.rows[0].reltuples < 0 ? null : Number(result.rows[0].reltuples)
    })
    const startedAt = Date.now()
    const response = await getSchema('library')
    const seconds = (Date.now() - startedAt) / 1000
    expect(response.status).toBe(200)
    // lock_timeout (500ms) bounds the blocked count instead of waiting for the ALTER to finish.
    expect(seconds).toBeLessThan(10)
    const info = await response.json() as SchemaInfo
    const categories = info.tables.find(table => table.schema === 'public' && table.name === 'categories')!
    expect(categories.rowCount).toBe(expectedFallback)
    expect(categories.rowCountEstimated).toBe(expectedFallback !== null)
    // The other relations are unaffected: exact counts, no estimate flag.
    const books = info.tables.find(table => table.schema === 'public' && table.name === 'books')!
    expect(books.rowCount).toBe(50)
    expect(books.rowCountEstimated ?? false).toBe(false)
    expect((await query('ROLLBACK')).error).toBeUndefined()
    expect(manager.status('A').transactionStatus).toBe('idle')
  })
})
