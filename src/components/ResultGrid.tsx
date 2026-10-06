import type { QueryResult } from '../shared/types'
const typeNames: Record<number, string> = {
  16: 'boolean', 17: 'bytea', 20: 'bigint', 21: 'smallint', 23: 'integer', 25: 'text',
  26: 'oid', 114: 'json', 700: 'real', 701: 'double precision', 1042: 'char', 1043: 'varchar',
  1082: 'date', 1083: 'time', 1114: 'timestamp', 1184: 'timestamptz', 1186: 'interval',
  1700: 'numeric', 2950: 'uuid', 3802: 'jsonb', 1007: 'integer[]', 1009: 'text[]',
}
export function postgresTypeName(oid: number) { return typeNames[oid] ?? `型 OID ${oid}` }
function formatValue(value: unknown) {
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}
export function ResultGrid({ results }: { results: QueryResult[] }) {
  if (!results.length) return <section className="panel empty-state"><div className="empty-symbol" aria-hidden="true">≡</div><h2>実行結果がここに表示されます</h2><p>SQL を入力して実行しましょう。試行錯誤が、理解への近道です。</p></section>
  return <div className="results" aria-live="polite">{results.map((result, index) => <section className="panel" key={index}>
    <div className="panel-heading"><h2><span className="result-number">{String(index + 1).padStart(2, '0')}</span> {result.command || '実行結果'}</h2><div className="result-meta"><span>{result.rowCount ?? result.rows.length} 行</span><span>{result.durationMs} ms（バッチ全体）</span></div></div>
    {result.fields.length ? <div className="table-scroll"><table><thead><tr><th className="row-number" aria-label="行番号">#</th>{result.fields.map((field, fieldIndex) => <th key={fieldIndex}>{field.name}<span className="column-type">{postgresTypeName(field.dataTypeID)}</span></th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}><td className="row-number">{rowIndex + 1}</td>{result.fields.map((field, fieldIndex) => <td key={fieldIndex}>{row[field.name] === null ? <span className="null-value">NULL</span> : formatValue(row[field.name])}</td>)}</tr>)}</tbody></table>{!result.rows.length && <p className="table-empty">結果は 0 行です。</p>}</div> : <p className="command-success">✓ {result.command || 'SQL'} を実行しました。</p>}
    {result.truncated && <p className="truncation">表示は先頭 1,000 行までです。WHERE や LIMIT で絞り込んでください。</p>}
  </section>)}</div>
}
