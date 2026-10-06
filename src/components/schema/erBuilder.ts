import type { SchemaTable } from '../../shared/schema.js'
const typeAliases: Record<string, string> = {
  'character varying': 'varchar', 'timestamp with time zone': 'timestamptz', 'timestamp without time zone': 'timestamp',
  'double precision': 'float8', 'time with time zone': 'timetz', 'time without time zone': 'time', 'bit varying': 'varbit',
}
/** Mermaid erDiagram attribute types must be single tokens: drop length/precision and map spaced names. */
export function mermaidType(dataType: string): string {
  const base = dataType.replace(/\(.*\)/, '').trim()
  return (typeAliases[base] ?? base).replace(/[^a-zA-Z0-9_]/g, '_') || 'text'
}
/** Builds an erDiagram definition for one schema: PK/FK marked columns plus }o--|| FK edges. */
export function buildErDiagram(schema: string, tables: SchemaTable[]): string {
  const entities = tables.filter(table => table.kind === 'table' || table.kind === 'partitioned')
  const nameOf = (table: SchemaTable) => (schema === 'public' ? table.name : `${schema}_${table.name}`)
  const lines = ['erDiagram']
  for (const table of entities) {
    lines.push(`  ${nameOf(table)} {`)
    for (const column of table.columns) {
      const flags = [
        table.primaryKey.includes(column.name) ? 'PK' : '',
        table.foreignKeys.some(foreignKey => foreignKey.columnNames.includes(column.name)) ? 'FK' : '',
      ].filter(Boolean).join(' ')
      lines.push(`    ${mermaidType(column.dataType)} ${column.name}${flags ? ` ${flags}` : ''}`)
    }
    lines.push('  }')
  }
  for (const table of entities) for (const foreignKey of table.foreignKeys) {
    const parent = entities.find(entity => entity.schema === foreignKey.referencesSchema && entity.name === foreignKey.referencesTable)
    if (parent) lines.push(`  ${nameOf(table)} }o--|| ${nameOf(parent)} : "${foreignKey.name} ON DELETE ${foreignKey.onDelete}"`)
  }
  return lines.join('\n')
}
