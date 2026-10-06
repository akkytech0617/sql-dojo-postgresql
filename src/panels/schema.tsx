import { useCallback, useEffect, useState } from 'react'
import type { PanelDefinition, PanelProps } from '../app/panelRegistry'
import type { SchemaInfo, SchemaMissingResponse } from '../shared/schema'
import { ErDiagram } from '../components/schema/ErDiagram'
import { SchemaTree } from '../components/schema/SchemaTree'
import '../components/schema/schema.css'
async function fetchSchema(database: string): Promise<SchemaInfo | SchemaMissingResponse> {
  const response = await fetch(`/api/schema?database=${encodeURIComponent(database)}`)
  const data = (await response.json()) as SchemaInfo | SchemaMissingResponse
  if (!response.ok) return data
  if (!('tables' in data)) return { message: 'スキーマ情報の形式が不正です。', databases: [] }
  return data
}
export function SchemaPanel({ step }: PanelProps) {
  const [database, setDatabase] = useState(step?.database ?? 'library')
  const [info, setInfo] = useState<SchemaInfo | null>(null)
  const [missingDatabases, setMissingDatabases] = useState<string[]>([])
  const [schema, setSchema] = useState('public')
  const [view, setView] = useState<'tree' | 'er'>('tree')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const load = useCallback(async (target: string) => {
    setLoading(true)
    try {
      const result = await fetchSchema(target)
      if ('tables' in result) { setInfo(result); setMissingDatabases([]); setError('') }
      else {
        setInfo(null); setMissingDatabases(result.databases)
        setError(result.message)
      }
    } catch (requestError) { setError(String(requestError instanceof Error ? requestError.message : requestError)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(database) }, [database, load])
  const databases = info?.databases ?? missingDatabases
  const schemas = info?.schemas ?? []
  const activeSchema = schemas.includes(schema) ? schema : schemas[0] ?? 'public'
  const tables = (info?.tables ?? []).filter(table => table.schema === activeSchema)
  return <div className="schema-panel">
    <div className="schema-toolbar">
      <label>データベース
        <select value={database} onChange={event => setDatabase(event.target.value)} disabled={loading}>
          {(databases.length ? databases : [database]).map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      {schemas.length > 0 && <span className="schema-tabs" role="group" aria-label="スキーマ選択">
        {schemas.map(name => <button key={name} aria-pressed={name === activeSchema} onClick={() => setSchema(name)}>{name}</button>)}
      </span>}
      <span className="schema-view" role="group" aria-label="表示切替">
        <button aria-pressed={view === 'tree'} onClick={() => setView('tree')}>表一覧</button>
        <button aria-pressed={view === 'er'} onClick={() => setView('er')}>ER図</button>
      </span>
      <button disabled={loading} onClick={() => { void load(database) }}>{loading ? '読み込み中…' : '更新'}</button>
    </div>
    {error && <p className="schema-error" role="alert">{error}</p>}
    {info && <>
      {info.roles.length > 0 && <div className="schema-roles" aria-label="ロール">
        {info.roles.map(role => <span key={role.name} className="role-chip">{role.name}
          <span className="role-attr">{[role.superuser ? 'SUPERUSER' : '', role.canLogin ? 'LOGIN' : 'NOLOGIN'].filter(Boolean).join('・')}</span>
        </span>)}
      </div>}
      {view === 'tree' ? <SchemaTree tables={tables} /> : <ErDiagram schema={activeSchema} tables={tables} />}
    </>}
    {!info && !error && <p className="schema-status">スキーマ情報を読み込んでいます…</p>}
  </div>
}
export const panel: PanelDefinition = { id: 'schema', label: 'スキーマ', order: 10, component: SchemaPanel }
