import { TABLE_PRIVILEGES, type TablePrivilegesInfo } from '../../shared/privileges'
import { Badge, ModeCell, ModeLegend } from './bits'

export function TableMatrix({ tables }: { tables: TablePrivilegesInfo[] }) {
  const roleNames = [...new Set(tables.flatMap(table => table.entries.map(entry => entry.role)))]
  return <div>
    <ModeLegend />
    <div className="flex flex-col gap-2">
      {tables.map((table, index) => <details key={table.table} open={index === 0} className="rounded-md border border-slate-700 bg-slate-900/40">
        <summary className="cursor-pointer select-none px-3 py-2">
          <span className="font-mono text-[13px] text-slate-200">{table.table}</span>
          {table.rlsEnabled && <Badge tone="ok">RLS 有効</Badge>}
          {table.rlsForced && <Badge tone="warn">FORCE RLS</Badge>}
          {table.policies.length > 0 && <Badge tone="muted">ポリシー {table.policies.length}件</Badge>}
        </summary>
        <div className="px-3 pb-3">
          <div className="table-scroll"><table>
            <thead><tr><th>権限</th>{roleNames.map(role => <th key={role}>{role}</th>)}</tr></thead>
            <tbody>{TABLE_PRIVILEGES.map(privilege => <tr key={privilege}>
              <td className="font-mono text-slate-400">{privilege}</td>
              {roleNames.map(role => <ModeCell key={role} mode={table.entries.find(entry => entry.role === role)?.privileges[privilege] ?? 'none'} />)}
            </tr>)}</tbody>
          </table></div>
          {table.policies.map(policy => <div key={policy.name} className="mt-2 rounded-md border border-emerald-800/70 bg-emerald-950/40 p-2 text-[11px] leading-5">
            <span className="font-semibold text-emerald-200">{policy.name}</span>
            <span className="text-slate-400"> — {policy.command} を許可（{policy.permissive === 'PERMISSIVE' ? '許可' : '制限'}・対象 {policy.roles.join(', ')}）</span>
            {policy.using && <p className="m-0 mt-1">USING: <code className="text-slate-300">{policy.using}</code></p>}
            {policy.withCheck && <p className="m-0">WITH CHECK: <code className="text-slate-300">{policy.withCheck}</code></p>}
          </div>)}
        </div>
      </details>)}
    </div>
  </div>
}
