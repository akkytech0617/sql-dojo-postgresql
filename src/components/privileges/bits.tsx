import type { ReactNode } from 'react'
import type { PrivilegeMode } from '../../shared/privileges'

const modeSymbols: Record<PrivilegeMode, string> = { direct: '✓', inherited: '◐', none: '—' }
const modeTitles: Record<PrivilegeMode, string> = {
  direct: 'このロールへの直接の GRANT',
  inherited: '継承（メンバーシップ・PUBLIC・スーパーユーザー）による有効な権限',
  none: '権限なし',
}

export function ModeCell({ mode }: { mode: PrivilegeMode }) {
  return <td className={mode === 'direct' ? 'text-emerald-300' : mode === 'inherited' ? 'text-amber-300' : 'text-slate-500'} title={modeTitles[mode]}>{modeSymbols[mode]}</td>
}

export function BoolCell({ value }: { value: boolean }) {
  return <td className={value ? 'text-emerald-300' : 'text-slate-500'}>{value ? '✓' : '—'}</td>
}

export function ModeLegend() {
  return <p className="m-0 mb-2 text-[11px] text-slate-400">
    <span className="text-emerald-300">✓ 直接付与</span>（そのロールへの GRANT） ・ <span className="text-amber-300">◐ 継承</span>（メンバーシップ・PUBLIC・スーパーユーザー経由） ・ <span className="text-slate-500">— なし</span>
  </p>
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'muted'; children: ReactNode }) {
  const classes = {
    ok: 'border-emerald-700 bg-emerald-950/60 text-emerald-200',
    warn: 'border-amber-700 bg-amber-950/60 text-amber-200',
    muted: 'border-slate-600 bg-slate-800 text-slate-300',
  }[tone]
  return <span className={`ml-1.5 rounded border px-1.5 py-0.5 text-[10px] leading-4 ${classes}`}>{children}</span>
}

export function SectionTitle({ title, note }: { title: string; note?: string }) {
  return <h3 className="m-0 mb-2 text-[13px] font-semibold text-slate-200">
    {title}
    {note && <span className="ml-2 text-[11px] font-normal text-slate-400">{note}</span>}
  </h3>
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-md border border-dashed border-slate-700 px-3 py-2 text-[12px] text-slate-400">{children}</p>
}
