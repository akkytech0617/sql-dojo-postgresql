import { useCallback, useEffect, useState } from 'react'
import type { PanelDefinition } from '../app/panelRegistry'
import type { Step } from '../shared/lessons'
import type { PrivilegesResponse } from '../shared/privileges'
import { ColumnGrants } from '../components/privileges/ColumnGrants'
import { DefaultPrivileges } from '../components/privileges/DefaultPrivileges'
import { RoleList } from '../components/privileges/RoleList'
import { RoutineMatrix } from '../components/privileges/RoutineMatrix'
import { ScopePrivileges } from '../components/privileges/ScopePrivileges'
import { SectionTitle } from '../components/privileges/bits'
import { TableMatrix } from '../components/privileges/TableMatrix'

async function fetchPrivileges(): Promise<PrivilegesResponse> {
  const response = await fetch('/api/privileges?database=library')
  const data: unknown = await response.json()
  if (!response.ok) {
    const message = (data as { message?: string }).message
    throw new Error(message ?? '権限情報を取得できませんでした。')
  }
  return data as PrivilegesResponse
}

function PrivilegesPanel({ step }: { step?: Step }) {
  const [data, setData] = useState<PrivilegesResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setData(await fetchPrivileges()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load, step?.id])
  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="m-0 text-[12px] text-slate-400">「誰が・何をできるか」をカタログ（pg_roles / ACL / pg_policies）から一覧表示します。10章の GRANT と並行して確認できます。</p>
      <button onClick={() => { void load() }} disabled={loading}>{loading ? '更新中…' : '更新'}</button>
    </div>
    {error && <p className="m-0 rounded-md border border-red-800 bg-red-950/60 px-3 py-2 text-[12px] text-red-200">{error}</p>}
    {data && <>
      <section aria-label="ロール一覧">
        <SectionTitle title="ロールとメンバーシップ" note="LOGIN 属性で人とグループを使い分けます" />
        <RoleList roles={data.roles} />
      </section>
      <section aria-label="データベースとスキーマの権限">
        <SectionTitle title="入口の権限" />
        <ScopePrivileges database={data.database} databasePrivileges={data.databasePrivileges} schemaPrivileges={data.schemaPrivileges} />
      </section>
      <section aria-label="表権限マトリクス">
        <SectionTitle title="表権限マトリクス" note="行 = 権限、列 = ロール（クリックで展開）" />
        <TableMatrix tables={data.tables} />
      </section>
      <section aria-label="列権限">
        <SectionTitle title="列単位の権限" note="表権限より細かい GRANT SELECT (列)" />
        <ColumnGrants columns={data.columns} />
      </section>
      <section aria-label="関数の実行権限">
        <SectionTitle title="関数・プロシージャの EXECUTE" />
        <RoutineMatrix routines={data.routines} />
      </section>
      <section aria-label="既定権限">
        <SectionTitle title="既定権限（DEFAULT PRIVILEGES）" note="これから作るオブジェクトへの自動付与" />
        <DefaultPrivileges defaults={data.defaultPrivileges} />
      </section>
    </>}
  </div>
}

export const panel: PanelDefinition = { id: 'privileges', label: '権限', component: PrivilegesPanel, order: 40 }
