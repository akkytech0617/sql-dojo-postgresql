import { describe, expect, it } from 'vitest'
import { buildErDiagram, mermaidIdentifier } from '../src/components/schema/erBuilder.js'
import type { SchemaColumn, SchemaTable } from '../src/shared/schema.js'
function column(name: string): SchemaColumn {
  return { name, dataType: 'integer', nullable: true, default: null, identity: null, comment: null }
}
function table(name: string, columns: string[], foreignKeys: SchemaTable['foreignKeys'] = []): SchemaTable {
  return { schema: 'public', name, kind: 'table', comment: null, rowCount: 0, primaryKey: [], columns: columns.map(column),
    foreignKeys, constraints: [], indexes: [] }
}
describe('ER diagram identifiers', () => {
  it('keeps word characters, including Japanese, and replaces the rest', () => {
    expect(mermaidIdentifier('books')).toBe('books')
    expect(mermaidIdentifier('会員')).toBe('会員')
    expect(mermaidIdentifier('comma, space')).toBe('comma__space')
    expect(mermaidIdentifier('1st')).toBe('_1st')
  })
  it('cannot inject mermaid syntax through quoted identifiers', () => {
    const evil = table('x {\n}\n%%{init: {"securityLevel": "loose"}}%%\nclick', ['a" }\nb'], [{
      name: 'fk"\n%%x', columnNames: ['a" }\nb'], referencesSchema: 'public', referencesTable: 'x_ {\n}', referencesColumnNames: ['id'],
      onDelete: 'CASCADE', onUpdate: 'NO ACTION',
    }])
    const parent = table('x_ {\n}', ['id'])
    const diagram = buildErDiagram('public', [evil, parent])
    const lines = diagram.split('\n')
    // erDiagram + (open, 1 column, close) + (open, 1 column, close) + 1 edge: no extra lines injected.
    expect(lines).toHaveLength(8)
    expect(diagram).not.toContain('%%')
    expect(lines[7]).toMatch(/^ {2}\S+ \}o--\|\| \S+ : "[^"]+ ON DELETE CASCADE"$/)
  })
  it('keeps tables that sanitize to the same name as separate entities', () => {
    const diagram = buildErDiagram('public', [table('a b', ['id']), table('a_b', ['id'])])
    expect(diagram).toContain('  a_b {')
    expect(diagram).toContain('  a_b_2 {')
  })
})
