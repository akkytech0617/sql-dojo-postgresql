import { Hono } from 'hono'
import type { Client } from 'pg'
import { z } from 'zod'
import { withAdmin } from '../lessons.js'
import {
  TABLE_PRIVILEGES,
  type ColumnGrant,
  type DefaultPrivilegeInfo,
  type PrivilegeMode,
  type PrivilegesResponse,
  type PrivilegesRole,
  type RoutinePrivilegesInfo,
  type SchemaPrivileges,
  type TablePrivilege,
  type TablePrivilegesInfo,
} from '../../src/shared/privileges.js'

/** All non-system roles plus the pseudo role PUBLIC (grantee oid 0 in ACLs). */
const rolesUnion = "(SELECT rolname::text AS rolname FROM pg_roles WHERE NOT starts_with(rolname, 'pg_') UNION SELECT 'public')"

const rolesSql = `
  SELECT r.rolname::text AS name, r.rolcanlogin AS "canLogin", r.rolsuper AS superuser, r.rolinherit AS inherit,
    COALESCE((SELECT array_agg(g.rolname::text ORDER BY g.rolname) FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid WHERE m.member = r.oid), '{}'::text[]) AS "memberOf",
    COALESCE((SELECT array_agg(g.rolname::text ORDER BY g.rolname) FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.member WHERE m.roleid = r.oid), '{}'::text[]) AS members
  FROM pg_roles r WHERE NOT starts_with(r.rolname, 'pg_') ORDER BY r.rolname`

const databaseSql = `
  SELECT ro.rolname AS role,
    has_database_privilege(ro.rolname, $1, 'CONNECT') AS connect,
    has_database_privilege(ro.rolname, $1, 'CREATE') AS "create",
    has_database_privilege(ro.rolname, $1, 'TEMP') AS temp
  FROM ${rolesUnion} AS ro ORDER BY ro.rolname`

const schemasSql = `
  SELECT n.nspname AS schema, ro.rolname AS role,
    has_schema_privilege(ro.rolname, n.oid, 'USAGE') AS usage,
    has_schema_privilege(ro.rolname, n.oid, 'CREATE') AS "create"
  FROM pg_namespace n CROSS JOIN ${rolesUnion} AS ro
  WHERE n.nspname <> 'information_schema' AND NOT starts_with(n.nspname, 'pg_')
  ORDER BY n.nspname, ro.rolname`

/** Direct grants come from the stored ACL (with the owner's default when relacl IS NULL); effective comes from has_table_privilege (membership/PUBLIC/superuser included). */
const matrixSql = `
  WITH tables AS (
    SELECT c.oid, c.relname, c.relacl, c.relowner, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  ), roles AS ${rolesUnion}, direct AS (
    SELECT t.relname AS table_name, COALESCE(gr.rolname::text, 'public') AS role_name, x.privilege_type AS privilege
    FROM tables t
    CROSS JOIN LATERAL aclexplode(COALESCE(t.relacl, acldefault('r', t.relowner))) x
    LEFT JOIN pg_roles gr ON gr.oid = x.grantee
  )
  SELECT t.relname AS table_name, t.relrowsecurity AS rls_enabled, t.relforcerowsecurity AS rls_forced,
    ro.rolname AS role_name, p.privilege,
    (d.role_name IS NOT NULL) AS direct,
    has_table_privilege(ro.rolname, t.oid, p.privilege) AS effective
  FROM tables t
  CROSS JOIN roles ro
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
  LEFT JOIN direct d ON d.table_name = t.relname AND d.role_name = ro.rolname AND d.privilege = p.privilege
  ORDER BY t.relname, ro.rolname, p.privilege`

/** Column-level ACLs live in pg_attribute.attacl; aclexplode is STRICT so NULL attacl yields no rows. */
const columnsSql = `
  SELECT c.relname AS table_name, a.attname AS column_name, COALESCE(gr.rolname::text, 'public') AS role_name, x.privilege_type AS privilege
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  CROSS JOIN LATERAL aclexplode(a.attacl) x
  LEFT JOIN pg_roles gr ON gr.oid = x.grantee
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  ORDER BY c.relname, a.attnum, role_name, privilege`

const routinesSql = `
  WITH routines AS (
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments, p.prokind, p.proowner, p.proacl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
  ), roles AS ${rolesUnion}, direct AS (
    SELECT rt.oid, COALESCE(gr.rolname::text, 'public') AS role_name
    FROM routines rt
    CROSS JOIN LATERAL aclexplode(COALESCE(rt.proacl, acldefault('f', rt.proowner))) x
    LEFT JOIN pg_roles gr ON gr.oid = x.grantee
    WHERE x.privilege_type = 'EXECUTE'
  )
  SELECT rt.proname AS name, rt.arguments, rt.prokind AS kind, ro.rolname AS role_name,
    (d.role_name IS NOT NULL) AS direct,
    has_function_privilege(ro.rolname, rt.oid, 'EXECUTE') AS effective
  FROM routines rt
  CROSS JOIN roles ro
  LEFT JOIN direct d ON d.oid = rt.oid AND d.role_name = ro.rolname
  ORDER BY rt.proname, rt.arguments, ro.rolname`

const defaultsSql = `
  SELECT r.rolname::text AS owner_role, n.nspname AS schema_name, d.defaclobjtype::text AS object_type,
    COALESCE(gr.rolname::text, 'public') AS grantee, x.privilege_type AS privilege
  FROM pg_default_acl d
  JOIN pg_roles r ON r.oid = d.defaclrole
  LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) x
  LEFT JOIN pg_roles gr ON gr.oid = x.grantee
  ORDER BY r.rolname, n.nspname, d.defaclobjtype, grantee, x.privilege_type`

const policiesSql = `
  SELECT tablename AS table_name, policyname AS name, cmd AS command, roles::text[] AS roles,
    permissive, qual AS using_expr, with_check
  FROM pg_policies WHERE schemaname = 'public'
  ORDER BY tablename, policyname`

interface RoleRow { name: string; canLogin: boolean; superuser: boolean; inherit: boolean; memberOf: string[]; members: string[] }
interface DatabaseRow { role: string; connect: boolean; create: boolean; temp: boolean }
interface SchemaRow { schema: string; role: string; usage: boolean; create: boolean }
interface MatrixRow { table_name: string; rls_enabled: boolean; rls_forced: boolean; role_name: string; privilege: TablePrivilege; direct: boolean; effective: boolean }
interface ColumnRow { table_name: string; column_name: string; role_name: string; privilege: string }
interface RoutineRow { name: string; arguments: string; kind: string; role_name: string; direct: boolean; effective: boolean }
interface DefaultRow { owner_role: string; schema_name: string | null; object_type: string; grantee: string; privilege: string }
interface PolicyRow { table_name: string; name: string; command: string; roles: string[]; permissive: string; using_expr: string | null; with_check: string | null }

const defaultAclTypes: Record<string, string> = { r: 'TABLES', S: 'SEQUENCES', f: 'FUNCTIONS', T: 'TYPES', n: 'SCHEMAS' }
const toMode = (direct: boolean, effective: boolean): PrivilegeMode => direct ? 'direct' : effective ? 'inherited' : 'none'
const noPrivileges = (): Record<TablePrivilege, PrivilegeMode> =>
  Object.fromEntries(TABLE_PRIVILEGES.map(privilege => [privilege, 'none' as const])) as Record<TablePrivilege, PrivilegeMode>

async function collect(client: Client, database: string): Promise<PrivilegesResponse> {
  const roles: PrivilegesRole[] = (await client.query<RoleRow>(rolesSql)).rows
  const databasePrivileges = (await client.query<DatabaseRow>(databaseSql, [database])).rows
  const schemaPrivileges: SchemaPrivileges[] = (await client.query<SchemaRow>(schemasSql)).rows
  const tables = new Map<string, TablePrivilegesInfo>()
  for (const row of (await client.query<MatrixRow>(matrixSql)).rows) {
    let table = tables.get(row.table_name)
    if (!table) {
      table = { table: row.table_name, rlsEnabled: row.rls_enabled, rlsForced: row.rls_forced, policies: [], entries: [] }
      tables.set(row.table_name, table)
    }
    let entry = table.entries.find(item => item.role === row.role_name)
    if (!entry) {
      entry = { role: row.role_name, privileges: noPrivileges() }
      table.entries.push(entry)
    }
    entry.privileges[row.privilege] = toMode(row.direct, row.effective)
  }
  const columns: ColumnGrant[] = []
  for (const row of (await client.query<ColumnRow>(columnsSql)).rows) {
    let grant = columns.find(item => item.table === row.table_name && item.column === row.column_name && item.role === row.role_name)
    if (!grant) {
      grant = { table: row.table_name, column: row.column_name, role: row.role_name, privileges: [] }
      columns.push(grant)
    }
    if (!grant.privileges.includes(row.privilege)) grant.privileges.push(row.privilege)
  }
  const routines: RoutinePrivilegesInfo[] = []
  for (const row of (await client.query<RoutineRow>(routinesSql)).rows) {
    let routine = routines.find(item => item.name === row.name && item.arguments === row.arguments)
    if (!routine) {
      routine = { name: row.name, arguments: row.arguments, kind: row.kind === 'p' ? 'procedure' : 'function', entries: [] }
      routines.push(routine)
    }
    routine.entries.push({ role: row.role_name, execute: toMode(row.direct, row.effective) })
  }
  const defaultPrivileges: DefaultPrivilegeInfo[] = []
  for (const row of (await client.query<DefaultRow>(defaultsSql)).rows) {
    const objectType = defaultAclTypes[row.object_type] ?? row.object_type
    let entry = defaultPrivileges.find(item => item.ownerRole === row.owner_role && item.schema === row.schema_name && item.objectType === objectType)
    if (!entry) {
      entry = { ownerRole: row.owner_role, schema: row.schema_name, objectType, grants: [] }
      defaultPrivileges.push(entry)
    }
    let grant = entry.grants.find(item => item.grantee === row.grantee)
    if (!grant) {
      grant = { grantee: row.grantee, privileges: [] }
      entry.grants.push(grant)
    }
    if (!grant.privileges.includes(row.privilege)) grant.privileges.push(row.privilege)
  }
  for (const row of (await client.query<PolicyRow>(policiesSql)).rows) {
    tables.get(row.table_name)?.policies.push({
      name: row.name, command: row.command, roles: row.roles, permissive: row.permissive, using: row.using_expr, withCheck: row.with_check,
    })
  }
  return { database, roles, databasePrivileges, schemaPrivileges, tables: [...tables.values()], columns, routines, defaultPrivileges }
}

export function privilegesRoutes() {
  const routes = new Hono()
  routes.get('/', async c => {
    const parsed = z.string().min(1).max(64).safeParse(c.req.query('database') ?? 'library')
    if (!parsed.success) return c.json({ message: 'データベース名が不正です。' }, 400)
    const database = parsed.data
    const exists = await withAdmin('postgres', async client =>
      (await client.query<{ datname: string }>('SELECT datname FROM pg_database WHERE datname = $1 AND datallowconn', [database])).rows[0]?.datname)
    if (!exists) return c.json({ message: `データベース ${database} は存在しないか、接続できません。` }, 400)
    return c.json(await withAdmin(database, client => collect(client, database)))
  })
  return routes
}
