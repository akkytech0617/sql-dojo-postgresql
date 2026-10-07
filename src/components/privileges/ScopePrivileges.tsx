import type { DatabasePrivileges, SchemaPrivileges } from '../../shared/privileges'
import { BoolCell, SectionTitle } from './bits'

export function ScopePrivileges({ database, databasePrivileges, schemaPrivileges }: {
  database: string
  databasePrivileges: DatabasePrivileges[]
  schemaPrivileges: SchemaPrivileges[]
}) {
  const schemas = [...new Set(schemaPrivileges.map(item => item.schema))]
  return <div className="grid gap-4 lg:grid-cols-2">
    <section>
      <SectionTitle title={`データベース ${database}`} note="有効な権限（継承込み）" />
      <div className="table-scroll"><table>
        <thead><tr><th>ロール</th><th>CONNECT</th><th>CREATE</th><th>TEMP</th></tr></thead>
        <tbody>{databasePrivileges.map(row => <tr key={row.role}>
          <td className="font-mono">{row.role}</td>
          <BoolCell value={row.connect} />
          <BoolCell value={row.create} />
          <BoolCell value={row.temp} />
        </tr>)}</tbody>
      </table></div>
    </section>
    <section>
      <SectionTitle title="スキーマ" note="USAGE は中のオブジェクトを名前で引く権限" />
      <div className="table-scroll"><table>
        <thead><tr><th>スキーマ</th><th>ロール</th><th>USAGE</th><th>CREATE</th></tr></thead>
        <tbody>{schemas.flatMap(schema => schemaPrivileges.filter(item => item.schema === schema).map(row => <tr key={`${row.schema}:${row.role}`}>
          <td className="font-mono">{row.schema}</td>
          <td className="font-mono">{row.role}</td>
          <BoolCell value={row.usage} />
          <BoolCell value={row.create} />
        </tr>))}</tbody>
      </table></div>
    </section>
  </div>
}
