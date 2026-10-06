import { Hono } from 'hono'
import { z } from 'zod'
import type { Client } from 'pg'
import { withAdmin } from '../lessons.js'
import type { SchemaColumn, SchemaConstraint, SchemaInfo, SchemaRole, SchemaTable, TableKind } from '../../src/shared/schema.js'
const databaseSchema = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/)
const kindMap: Record<string, TableKind> = { r: 'table', p: 'partitioned', v: 'view', m: 'matview' }
const actionMap: Record<string, string> = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' }
const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`
const userNamespaces = (alias: string) => `${alias}.nspname NOT LIKE 'pg_%' AND ${alias}.nspname <> 'information_schema'`
const userSchemaIndexes = "schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema'"
const rows = async <T>(client: Client, sql: string): Promise<T[]> => (await client.query(sql)).rows as T[]
interface TableRow { table_schema: string; table_name: string; kind: string; comment: string | null }
interface ColumnRow extends SchemaColumn { table_schema: string; table_name: string }
interface PrimaryKeyRow { table_schema: string; table_name: string; column_name: string }
interface ConstraintRow extends SchemaConstraint { table_schema: string; table_name: string }
interface ForeignKeyRow {
  table_schema: string; table_name: string; name: string
  references_schema: string; references_table: string
  column_names: string; references_column_names: string
  on_delete: string; on_update: string
}
interface IndexRow { schemaname: string; tablename: string; indexname: string; indexdef: string }
/** Reads the catalog of one database over a short-lived admin client. */
export async function readSchema(database: string): Promise<SchemaInfo> {
  return withAdmin(database, async client => {
    // One client, so queries run sequentially (node-pg queues but deprecates concurrent use).
    const schemas = (await rows<{ name: string }>(client, 'SELECT nspname AS name FROM pg_namespace WHERE nspname NOT LIKE \'pg_%\' AND nspname <> \'information_schema\' ORDER BY nspname'))
    const databases = (await rows<{ name: string }>(client, 'SELECT datname AS name FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY datname'))
    const roles = (await rows<SchemaRole>(client, 'SELECT rolname AS name, rolsuper AS superuser, rolcanlogin AS "canLogin" FROM pg_roles WHERE rolname NOT LIKE \'pg_%\' ORDER BY rolname'))
    const tables = (await rows<TableRow>(client, `SELECT n.nspname AS table_schema, c.relname AS table_name, c.relkind AS kind, obj_description(c.oid, 'pg_class') AS comment FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p','v','m') AND ${userNamespaces('n')} ORDER BY n.nspname, c.relname`))
    const columns = (await rows<ColumnRow>(client, `SELECT n.nspname AS table_schema, c.relname AS table_name, a.attname AS name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS "dataType", NOT a.attnotnull AS nullable, pg_get_expr(ad.adbin, ad.adrelid) AS "default", CASE a.attidentity WHEN 'a' THEN 'ALWAYS' WHEN 'd' THEN 'BY DEFAULT' ELSE NULL END AS identity, col_description(a.attrelid, a.attnum) AS comment FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m') AND ${userNamespaces('n')} ORDER BY n.nspname, c.relname, a.attnum`))
    const primaryKeys = (await rows<PrimaryKeyRow>(client, `SELECT n.nspname AS table_schema, c.relname AS table_name, a.attname AS column_name FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey) WHERE i.indisprimary AND ${userNamespaces('n')} ORDER BY n.nspname, c.relname, a.attnum`))
    const constraints = (await rows<ConstraintRow>(client, `SELECT n.nspname AS table_schema, c.relname AS table_name, con.conname AS name, con.contype AS type, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE ${userNamespaces('n')} ORDER BY n.nspname, c.relname, con.conname`))
    const foreignKeys = (await rows<ForeignKeyRow>(client, `SELECT n.nspname AS table_schema, c.relname AS table_name, con.conname AS name, fn.nspname AS references_schema, fc.relname AS references_table, (SELECT string_agg(a.attname, ', ' ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS column_names, (SELECT string_agg(a.attname, ', ' ORDER BY k.ord) FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord) JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum) AS references_column_names, con.confdeltype AS on_delete, con.confupdtype AS on_update FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_class fc ON fc.oid = con.confrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace WHERE con.contype = 'f' AND ${userNamespaces('n')} AND ${userNamespaces('fn')} ORDER BY n.nspname, c.relname, con.conname`))
    const indexes = (await rows<IndexRow>(client, `SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE ${userSchemaIndexes} ORDER BY schemaname, tablename, indexname`))
    const byKey = new Map<string, SchemaTable>()
    for (const row of tables) byKey.set(`${row.table_schema}.${row.table_name}`, {
      schema: row.table_schema, name: row.table_name, kind: kindMap[row.kind] ?? 'table', comment: row.comment, rowCount: null,
      primaryKey: [], columns: [], foreignKeys: [], constraints: [], indexes: [],
    })
    for (const row of columns) byKey.get(`${row.table_schema}.${row.table_name}`)?.columns.push({
      name: row.name, dataType: row.dataType, nullable: row.nullable, default: row.default, identity: row.identity, comment: row.comment,
    })
    for (const row of primaryKeys) byKey.get(`${row.table_schema}.${row.table_name}`)?.primaryKey.push(row.column_name)
    for (const row of constraints) byKey.get(`${row.table_schema}.${row.table_name}`)?.constraints.push({
      name: row.name, type: row.type, definition: row.definition,
    })
    for (const row of foreignKeys) byKey.get(`${row.table_schema}.${row.table_name}`)?.foreignKeys.push({
      name: row.name, columnNames: row.column_names.split(', '), referencesSchema: row.references_schema,
      referencesTable: row.references_table, referencesColumnNames: row.references_column_names.split(', '),
      onDelete: actionMap[row.on_delete] ?? row.on_delete, onUpdate: actionMap[row.on_update] ?? row.on_update,
    })
    for (const row of indexes) byKey.get(`${row.schemaname}.${row.tablename}`)?.indexes.push({
      name: row.indexname, definition: row.indexdef, unique: row.indexdef.startsWith('CREATE UNIQUE'),
    })
    const result: SchemaInfo = {
      database, databases: databases.map(row => row.name), schemas: schemas.map(row => row.name), roles,
      tables: [...byKey.values()].sort((a, b) => a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name)),
    }
    for (const table of result.tables) table.rowCount = await count(client, table.schema, table.name)
    return result
  })
}
async function count(client: Client, schema: string, table: string): Promise<number> {
  const result = await client.query(`SELECT count(*)::int AS count FROM ${identifier(schema)}.${identifier(table)}`)
  return result.rows[0].count
}
export function schemaRoutes() {
  const routes = new Hono()
  routes.get('/', async c => {
    const parsed = databaseSchema.safeParse(c.req.query('database') ?? 'library')
    if (!parsed.success) return c.json({ message: 'データベース名が不正です（小文字の英数字と _ だけが使えます）。' }, 400)
    const database = parsed.data
    try { return c.json(await readSchema(database)) }
    catch (error) {
      if ((error as { code?: string }).code === '3D000') {
        const databases = await withAdmin('postgres', async client => (await client.query('SELECT datname AS name FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY datname')).rows.map(row => row.name))
        return c.json({ message: `データベース ${database} は存在しません。`, databases }, 404)
      }
      throw error
    }
  })
  return routes
}
