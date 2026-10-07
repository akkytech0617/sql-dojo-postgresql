import type { ColumnGrant } from '../../shared/privileges'
import { EmptyNote } from './bits'

export function ColumnGrants({ columns }: { columns: ColumnGrant[] }) {
  if (!columns.length) return <EmptyNote>列単位の GRANT はまだありません。GRANT SELECT (列) ON 表 ... を実行すると、ここに表示されます。</EmptyNote>
  return <div className="table-scroll"><table>
    <thead><tr><th>表</th><th>列</th><th>ロール</th><th>権限</th></tr></thead>
    <tbody>{columns.map(grant => <tr key={`${grant.table}:${grant.column}:${grant.role}`}>
      <td className="font-mono">{grant.table}</td>
      <td className="font-mono">{grant.column}</td>
      <td className="font-mono">{grant.role}</td>
      <td>{grant.privileges.join(', ')}</td>
    </tr>)}</tbody>
  </table></div>
}
