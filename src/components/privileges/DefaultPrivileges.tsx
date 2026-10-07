import type { DefaultPrivilegeInfo } from '../../shared/privileges'
import { EmptyNote } from './bits'

const objectLabels: Record<string, string> = {
  TABLES: '表', SEQUENCES: 'シーケンス', FUNCTIONS: '関数', TYPES: '型', SCHEMAS: 'スキーマ',
}

export function DefaultPrivileges({ defaults }: { defaults: DefaultPrivilegeInfo[] }) {
  if (!defaults.length) return <EmptyNote>既定権限（ALTER DEFAULT PRIVILEGES）はまだありません。10章で設定すると、これから作る表への自動付与が表示されます。</EmptyNote>
  return <ul className="m-0 flex list-none flex-col gap-2 p-0">
    {defaults.map(item => <li key={`${item.ownerRole}:${item.schema ?? ''}:${item.objectType}`} className="rounded-md border border-slate-700 bg-slate-900/60 p-2.5 text-[12px] leading-5">
      <span className="font-mono text-emerald-200">{item.ownerRole}</span>
      <span className="text-slate-400"> が </span>
      <span className="font-mono text-slate-300">{item.schema ?? '（全スキーマ）'}</span>
      <span className="text-slate-400"> に作る{objectLabels[item.objectType] ?? item.objectType}（{item.objectType}）への自動付与:</span>
      <ul className="m-0 mt-1 list-none p-0">
        {item.grants.map(grant => <li key={grant.grantee}>
          <span className="font-mono text-slate-300">{grant.grantee}</span> ← {grant.privileges.join(', ')}
        </li>)}
      </ul>
    </li>)}
  </ul>
}
