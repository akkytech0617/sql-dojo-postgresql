import type { SchemaColumn, SchemaTable } from '../../shared/schema'
const kindLabel: Record<SchemaTable['kind'], string> = { table: '表', partitioned: '親表', view: 'ビュー', matview: '実体化ビュー' }
const constraintLabel: Record<string, string> = { p: 'PK', u: 'UNIQUE', f: 'FK', c: 'CHECK', n: 'NOT NULL' }
function ColumnBadges({ column, table }: { column: SchemaColumn; table: SchemaTable }) {
  const isPrimary = table.primaryKey.includes(column.name)
  const isForeign = table.foreignKeys.some(foreignKey => foreignKey.columnNames.includes(column.name))
  return <span className="schema-badges">
    {isPrimary && <span className="schema-badge pk">PK</span>}
    {isForeign && <span className="schema-badge fk">FK</span>}
    {!column.nullable && <span className="schema-badge nn">NN</span>}
  </span>
}
function TableDetails({ table }: { table: SchemaTable }) {
  return <div className="schema-table-body">
    {table.comment && <p className="schema-status">{table.comment}</p>}
    <div className="schema-columns"><table>
      <thead><tr><th>列</th><th>型</th><th>NULL</th><th>既定値</th><th>採番</th><th>コメント</th></tr></thead>
      <tbody>{table.columns.map(column => <tr key={column.name}>
        <td className="col-name"><ColumnBadges column={column} table={table} />{column.name}</td>
        <td className="col-type">{column.dataType}</td>
        <td>{column.nullable ? '' : '不可'}</td>
        <td className="col-default">{column.default ?? '—'}</td>
        <td>{column.identity ?? '—'}</td>
        <td className="col-comment">{column.comment ?? '—'}</td>
      </tr>)}</tbody>
    </table></div>
    {table.foreignKeys.length > 0 && <section className="schema-section"><h3>外部キー</h3><ul>
      {table.foreignKeys.map(foreignKey => <li key={foreignKey.name}>
        <span className="schema-badge fk">FK</span>{foreignKey.columnNames.join(', ')} → {foreignKey.referencesSchema}.{foreignKey.referencesTable} ({foreignKey.referencesColumnNames.join(', ')})
        <span className="schema-badge action">ON DELETE {foreignKey.onDelete}</span>
      </li>)}
    </ul></section>}
    {table.constraints.length > 0 && <section className="schema-section"><h3>制約</h3><ul>
      {table.constraints.map(constraint => <li key={constraint.name}>
        <span className="schema-badge kind">{constraintLabel[constraint.type] ?? constraint.type}</span>{constraint.name}: {constraint.definition}
      </li>)}
    </ul></section>}
    {table.indexes.length > 0 && <section className="schema-section"><h3>索引</h3><ul>
      {table.indexes.map(index => <li key={index.name}>
        <span className="schema-badge kind">{index.unique ? 'UNIQUE' : 'INDEX'}</span>{index.definition}
      </li>)}
    </ul></section>}
  </div>
}
export function SchemaTree({ tables }: { tables: SchemaTable[] }) {
  if (!tables.length) return <p className="schema-status">このスキーマには表やビューがありません。</p>
  return <div className="schema-tree">{tables.map(table => <details key={`${table.schema}.${table.name}`} className="schema-table" open={tables.length <= 3}>
    <summary><span className="schema-badge kind">{kindLabel[table.kind]}</span><span className="table-name">{table.name}</span>
      <span className="schema-meta">{table.rowCount === null ? '' : `${table.rowCount} 行`}</span></summary>
    <TableDetails table={table} />
  </details>)}</div>
}
