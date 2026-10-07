import type { PrivilegesRole } from '../../shared/privileges'
import { Badge } from './bits'

export function RoleList({ roles }: { roles: PrivilegesRole[] }) {
  return <div className="flex flex-wrap gap-2">
    {roles.map(role => <div key={role.name} className="min-w-[210px] flex-1 rounded-md border border-slate-700 bg-slate-900/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="font-mono text-[13px] text-emerald-200">{role.name}</span>
        <span className="flex items-center">
          {role.superuser && <Badge tone="warn">SUPERUSER</Badge>}
          <Badge tone={role.canLogin ? 'ok' : 'muted'}>{role.canLogin ? 'LOGIN' : 'NOLOGIN'}</Badge>
        </span>
      </div>
      <p className="m-0 mt-1.5 text-[11px] text-slate-400">所属（継承元）: <span className="font-mono text-slate-300">{role.memberOf.length ? role.memberOf.join(', ') : '—'}</span></p>
      <p className="m-0 text-[11px] text-slate-400">メンバー: <span className="font-mono text-slate-300">{role.members.length ? role.members.join(', ') : '—'}</span></p>
    </div>)}
    <p className="m-0 w-full text-[11px] text-slate-500">PUBLIC（すべてのロールに継承される特殊ロール）は、下のマトリクスに列として表示します。</p>
  </div>
}
