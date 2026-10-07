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
/**
 * Quoted PostgreSQL identifiers may contain anything ("a {b", newlines, %%{init}%%). Inside the
 * mermaid source they would break the diagram or inject directives, so only word characters
 * (including non-ASCII letters, which mermaid accepts) survive and the rest become "_".
 */
export function mermaidIdentifier(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N}_]/gu, '_')
  return /^[\p{L}_]/u.test(safe) ? safe : `_${safe}`
}
function mermaidLabel(text: string): string {
  return text.replace(/["%\\\p{Cc}]/gu, '_')
}
/** Builds an erDiagram definition for one schema: PK/FK marked columns plus }o--|| FK edges. */
export function buildErDiagram(schema: string, tables: SchemaTable[]): string {
  const entities = tables.filter(table => table.kind === 'table' || table.kind === 'partitioned')
  // Sanitizing can map two tables ("a b", a_b) to one name; a suffix keeps them separate entities.
  const names = new Map<SchemaTable, string>()
  const used = new Set<string>()
  for (const table of entities) {
    const base = mermaidIdentifier(schema === 'public' ? table.name : `${schema}_${table.name}`)
    let name = base
    for (let n = 2; used.has(name); n++) name = `${base}_${n}`
    used.add(name)
    names.set(table, name)
  }
  const nameOf = (table: SchemaTable) => names.get(table)!
  const lines = ['erDiagram']
  for (const table of entities) {
    lines.push(`  ${nameOf(table)} {`)
    for (const column of table.columns) {
      const flags = [
        table.primaryKey.includes(column.name) ? 'PK' : '',
        table.foreignKeys.some(foreignKey => foreignKey.columnNames.includes(column.name)) ? 'FK' : '',
      ].filter(Boolean).join(', ')
      lines.push(`    ${mermaidType(column.dataType)} ${mermaidIdentifier(column.name)}${flags ? ` ${flags}` : ''}`)
    }
    lines.push('  }')
  }
  for (const table of entities) for (const foreignKey of table.foreignKeys) {
    const parent = entities.find(entity => entity.schema === foreignKey.referencesSchema && entity.name === foreignKey.referencesTable)
    if (parent) lines.push(`  ${nameOf(table)} }o--|| ${nameOf(parent)} : "${mermaidLabel(foreignKey.name)} ON DELETE ${foreignKey.onDelete}"`)
  }
  return lines.join('\n')
}
