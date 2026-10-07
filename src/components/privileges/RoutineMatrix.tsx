import type { RoutinePrivilegesInfo } from '../../shared/privileges'
import { Badge, EmptyNote, ModeCell, ModeLegend } from './bits'

export function RoutineMatrix({ routines }: { routines: RoutinePrivilegesInfo[] }) {
  if (!routines.length) return <EmptyNote>関数・プロシージャはまだありません（7章で作成すると表示されます）。</EmptyNote>
  const roleNames = [...new Set(routines.flatMap(routine => routine.entries.map(entry => entry.role)))]
  return <div>
    <ModeLegend />
    <div className="table-scroll"><table>
      <thead><tr><th>ルーチン</th>{roleNames.map(role => <th key={role}>{role}</th>)}</tr></thead>
      <tbody>{routines.map(routine => <tr key={`${routine.name}(${routine.arguments})`}>
        <td className="font-mono">{routine.name}({routine.arguments}){routine.kind === 'procedure' && <Badge tone="muted">PROC</Badge>}</td>
        {roleNames.map(role => <ModeCell key={role} mode={routine.entries.find(entry => entry.role === role)?.execute ?? 'none'} />)}
      </tr>)}</tbody>
    </table></div>
    <p className="m-0 mt-2 text-[11px] text-slate-500">EXECUTE 権限のみ表示します。10章で PUBLIC からの REVOKE を行うと、PUBLIC 列が — に変わります。</p>
  </div>
}
