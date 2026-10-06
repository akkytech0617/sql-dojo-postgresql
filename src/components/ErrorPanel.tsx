import type { SqlError } from '../shared/types'
export function ErrorPanel({ error }: { error: SqlError }) {
  return <section className="error-panel" role="alert"><div className="error-heading"><h2>{error.ja.title}</h2><code>SQLSTATE {error.code}</code></div><p>{error.ja.explanation}</p><p className="error-tip">ヒント：{error.ja.tip}</p><details open><summary>PostgreSQL のメッセージ{error.position && `（位置 ${error.position}）`}</summary><pre>{error.message}</pre>{error.detail && <pre>詳細：{error.detail}</pre>}{error.hint && <pre>ヒント：{error.hint}</pre>}{error.where && <pre>場所：{error.where}</pre>}</details></section>
}
