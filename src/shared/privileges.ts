/** Shared contract between GET /api/privileges and the 権限 panel. */
export const TABLE_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] as const
export type TablePrivilege = (typeof TABLE_PRIVILEGES)[number]
/** direct = granted to this role in the object ACL; inherited = effective via membership/PUBLIC/superuser; none = no access. */
export type PrivilegeMode = 'direct' | 'inherited' | 'none'
export interface PrivilegesRole {
  name: string
  canLogin: boolean
  superuser: boolean
  inherit: boolean
  memberOf: string[]
  members: string[]
}
export interface DatabasePrivileges { role: string; connect: boolean; create: boolean; temp: boolean }
export interface SchemaPrivileges { schema: string; role: string; usage: boolean; create: boolean }
export interface RolePrivileges { role: string; privileges: Record<TablePrivilege, PrivilegeMode> }
export interface PolicyInfo {
  name: string
  command: string
  roles: string[]
  permissive: string
  using: string | null
  withCheck: string | null
}
export interface TablePrivilegesInfo {
  table: string
  rlsEnabled: boolean
  rlsForced: boolean
  policies: PolicyInfo[]
  entries: RolePrivileges[]
}
export interface ColumnGrant { table: string; column: string; role: string; privileges: string[] }
export interface RoutinePrivilegesInfo {
  name: string
  arguments: string
  kind: 'function' | 'procedure'
  entries: { role: string; execute: PrivilegeMode }[]
}
export interface DefaultPrivilegeGrants { grantee: string; privileges: string[] }
export interface DefaultPrivilegeInfo {
  ownerRole: string
  schema: string | null
  objectType: string
  grants: DefaultPrivilegeGrants[]
}
export interface PrivilegesResponse {
  database: string
  roles: PrivilegesRole[]
  databasePrivileges: DatabasePrivileges[]
  schemaPrivileges: SchemaPrivileges[]
  tables: TablePrivilegesInfo[]
  columns: ColumnGrant[]
  routines: RoutinePrivilegesInfo[]
  defaultPrivileges: DefaultPrivilegeInfo[]
}
