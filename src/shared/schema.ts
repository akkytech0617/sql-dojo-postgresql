/** Shared types for the schema browser API (GET /api/schema) and its panel. */
export type TableKind = 'table' | 'view' | 'matview' | 'partitioned'
export interface SchemaColumn {
  name: string
  dataType: string
  nullable: boolean
  default: string | null
  identity: 'BY DEFAULT' | 'ALWAYS' | null
  comment: string | null
}
export interface SchemaForeignKey {
  name: string
  columnNames: string[]
  referencesSchema: string
  referencesTable: string
  referencesColumnNames: string[]
  onDelete: string
  onUpdate: string
}
export interface SchemaConstraint {
  name: string
  type: 'p' | 'u' | 'f' | 'c' | 'n'
  definition: string
}
export interface SchemaIndex {
  name: string
  definition: string
  unique: boolean
}
export interface SchemaTable {
  schema: string
  name: string
  kind: TableKind
  comment: string | null
  rowCount: number | null
  primaryKey: string[]
  columns: SchemaColumn[]
  foreignKeys: SchemaForeignKey[]
  constraints: SchemaConstraint[]
  indexes: SchemaIndex[]
}
export interface SchemaRole {
  name: string
  superuser: boolean
  canLogin: boolean
}
export interface SchemaInfo {
  database: string
  databases: string[]
  schemas: string[]
  roles: SchemaRole[]
  tables: SchemaTable[]
}
export interface SchemaMissingResponse {
  message: string
  databases: string[]
}
