import { useEffect, useMemo, useState } from 'react'
import '../components/explain/explain.css'
import { api } from '../api/client'
import { ErrorPanel } from '../components/ErrorPanel'
import { PlanTree } from '../components/explain/PlanTree'
import { firstStatement, hasExtraStatements, explainRequest, isReadOnlyStatement, needsCleanupRollback, parseExplainResult, prefillFromSolution } from '../components/explain/ExplainPlan'
import type { PanelDefinition, PanelProps } from '../app/panelRegistry'
import type { ExplainDocument } from '../components/explain/ExplainPlan'
import type { SessionId } from '../shared/lessons'
import type { QueryResponse, SessionStatus } from '../shared/types'

const txLabels: Record<string, string> = { idle: 'トランザクションなし', transaction: 'トランザクション中', failed: '失敗状態', unknown: '状態不明' }

function ExplainPanel({ step }: PanelProps) {
  const [session, setSession] = useState<SessionId>('A')
  const [sql, setSql] = useState(() => prefillFromSolution(step?.solution))
  const [analyze, setAnalyze] = useState(false)
  const [buffers, setBuffers] = useState(false)
  const [statuses, setStatuses] = useState<SessionStatus[]>([])
  const [response, setResponse] = useState<QueryResponse | null>(null)
  const [plan, setPlan] = useState<ExplainDocument | null>(null)
  const [sent, setSent] = useState('')
  const [message, setMessage] = useState('')
  const [running, setRunning] = useState(false)

  useEffect(() => {
    let active = true
    const poll = () => { void api.sessions().then(value => { if (active) setStatuses(value) }).catch(() => undefined) }
    poll(); const timer = setInterval(poll, 1000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  const status = statuses.find(item => item.id === session)
  const statement = useMemo(() => firstStatement(sql), [sql])
  const extra = useMemo(() => hasExtraStatements(sql), [sql])
  const readOnly = statement ? isReadOnlyStatement(statement) : false
  // BUFFERS requires ANALYZE in PostgreSQL, so it implies it.
  const options = buffers ? 'FORMAT JSON, ANALYZE, BUFFERS' : analyze ? 'FORMAT JSON, ANALYZE' : 'FORMAT JSON'

  async function run() {
    if (!statement.trim() || running) return
    setRunning(true); setMessage(''); setPlan(null); setResponse(null)
    const wrap = !readOnly && analyze
    try {
      let toSend: string
      if (!wrap) {
        toSend = explainRequest(statement, options, false)
      } else {
        if (status && status.transactionStatus !== 'idle' && status.transactionStatus !== 'unknown') {
          setMessage(`セッション ${session} は${txLabels[status.transactionStatus] ?? status.transactionStatus}です。更新系の EXPLAIN ANALYZE は BEGIN/ROLLBACK で包むため、開いたトランザクションがある間は実行できません。先に COMMIT / ROLLBACK してください。`)
          return
        }
        toSend = explainRequest(statement, options, true)
      }
      const result = await api.query(session, toSend)
      setSent(toSend)
      setResponse(result)
      if (needsCleanupRollback(wrap, result)) {
        // The failed statement aborted the wrapping transaction and the batch's trailing ROLLBACK
        // never ran; close the aborted transaction so the session is usable again.
        const cleanup = await api.query(session, 'ROLLBACK').catch(() => null)
        if (!cleanup?.error) setMessage('SQL が失敗したため、EXPLAIN ANALYZE を包んでいたトランザクションを ROLLBACK で閉じました。下のエラーが元の失敗です。')
      } else if (!result.error) {
        const explained = result.results.find(item => item.fields.some(field => field.name === 'QUERY PLAN'))
        const document = explained ? parseExplainResult(explained) : null
        setPlan(document)
        if (!document) setMessage('実行計画を取得できませんでした。SELECT 文に対して使うのが基本です。')
      }
    } catch (error) { setMessage(String(error instanceof Error ? error.message : error)) }
    finally { setRunning(false) }
  }

  return <div className="explain-tools">
    <div className="explain-toolbar">
      <span className="session-toggle" role="group" aria-label="実行セッション">
        {(['A', 'B'] as const).map(id => <button key={id} aria-pressed={session === id} onClick={() => setSession(id)}>セッション {id}</button>)}
      </span>
      <span className="muted small">{status?.connected ? `${status.user}@${status.database}・${txLabels[status.transactionStatus] ?? status.transactionStatus}` : '未接続'}</span>
      <div className="explain-options">
        <label><input type="checkbox" checked={analyze} onChange={event => { setAnalyze(event.target.checked); if (!event.target.checked) setBuffers(false) }} />ANALYZE（実際に実行する）</label>
        <label><input type="checkbox" checked={buffers} onChange={event => { setBuffers(event.target.checked); if (event.target.checked) setAnalyze(true) }} disabled={!analyze} />BUFFERS</label>
      </div>
      <button className="primary" onClick={() => { void run() }} disabled={running || !statement.trim()}>{running ? '実行中…' : '実行計画を見る →'}</button>
    </div>
    {analyze && <p className="explain-warn">⚠ ANALYZE は SQL を<strong>実際に実行</strong>します。SELECT 以外の文は BEGIN … ROLLBACK で包んで変更が残らないようにします（開いたトランザクションがある間は実行できません）。</p>}
    <textarea className="explain-editor" value={sql} onChange={event => setSql(event.target.value)} spellCheck={false} aria-label="実行計画を見る SQL（1文）" placeholder="EXPLAIN で調べたい SQL を1文だけ入力してください。例: SELECT * FROM public.loan_history WHERE member_id = 7" />
    <div className="explain-run">
      {extra && <p className="explain-warn">⚠ 複数の文が入力されています。最初の1文だけの実行計画を表示します。</p>}
      {!statement.trim() && <p className="explain-hint">このステップの模範解答に SELECT があれば、自動で入力欄に入っています。</p>}
    </div>
    {sent && <p className="explain-sent">送信したSQL: <code>{sent}</code></p>}
    {message && <p className="feedback" role="status">{message}</p>}
    {response?.error && <ErrorPanel error={response.error} />}
    {plan && <>
      <div className="explain-summary">
        {plan['Planning Time'] !== undefined && <span>計画作成 <strong>{plan['Planning Time'].toFixed(3)}ms</strong></span>}
        {plan['Execution Time'] !== undefined && <span>実行 <strong>{plan['Execution Time'].toFixed(3)}ms</strong></span>}
        <span>木構造の下が先（子ノードから）に実行されます。時間バーは実測時間の相対比較です。</span>
      </div>
      <PlanTree root={plan.Plan} />
    </>}
  </div>
}

export const panel: PanelDefinition = { id: 'explain', label: '実行計画', component: ExplainPanel, order: 20 }
