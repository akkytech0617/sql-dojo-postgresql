import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './lessons.css'
import { api } from '../api/client'
import { ErrorPanel } from '../components/ErrorPanel'
import { NoticeList } from '../components/NoticeList'
import { PanelDock } from '../components/PanelDock'
import { ResultGrid } from '../components/ResultGrid'
import { SessionBar } from '../components/SessionBar'
import { SqlEditor } from '../components/SqlEditor'
import type { Chapter, SessionId, Step } from '../shared/lessons'
import type { ConnectionInfo, QueryResponse, SessionStatus } from '../shared/types'
const storageKey = 'sql-dojo-progress-v1'
function savedProgress(): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [] } catch { return [] }
}
function Md({ text }: { text: string }) { return <div className="lesson-markdown"><Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown></div> }
const emptyResponse = (): QueryResponse => ({ results: [], notices: [] })
const workCollapsedKey = 'sql-dojo-work-collapsed-v1'
function savedWorkCollapsed(): boolean {
  try { return localStorage.getItem(workCollapsedKey) === '1' } catch { return false }
}
function Workspace({ step, onPassed, onBusy, workCollapsed, onExpandWork }: { step: Step; onPassed: () => void; onBusy: (busy: boolean) => void; workCollapsed: boolean; onExpandWork: () => void }) {
  const ids: SessionId[] = useMemo(() => step.session === 'AB' ? ['A', 'B'] : [step.session], [step.session])
  const [sql, setSql] = useState<Record<SessionId, string>>({ A: '', B: '' })
  const [responses, setResponses] = useState<Record<SessionId, QueryResponse>>({ A: emptyResponse(), B: emptyResponse() })
  const [statuses, setStatuses] = useState<SessionStatus[]>([])
  const [busy, setBusy] = useState<Record<SessionId, boolean>>({ A: false, B: false })
  const busyRef = useRef({ A: false, B: false })
  const [completed, setCompleted] = useState<boolean[]>(step.script?.map(() => false) ?? [])
  const completedRef = useRef(completed)
  const [hintCount, setHintCount] = useState(0)
  const [message, setMessage] = useState('')
  const [grading, setGrading] = useState(false)
  const [passed, setPassed] = useState(false)
  const [entryOpen, setEntryOpen] = useState<SessionId[]>([])
  const [entryResetNote, setEntryResetNote] = useState('')
  const enteredRef = useRef(false)
  const refresh = useCallback(async (): Promise<SessionStatus[]> => {
    const value = await api.sessions()
    setStatuses(value)
    return value
  }, [])
  useEffect(() => {
    let active = true
    const poll = () => { void api.sessions().then(value => { if (active) setStatuses(value) }).catch(error => { if (active) setMessage(String(error)) }) }
    poll(); const timer = setInterval(poll, 1000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  useEffect(() => {
    if (enteredRef.current) return
    enteredRef.current = true
    void (async () => {
      if (step.session === 'AB' && step.script) {
        // Guided two-session experiments need known-clean sessions: an open transaction or a
        // left-over SET (lock_timeout, deadlock_timeout) from an earlier step would change the
        // outcome. Reset both — but never send anything to a session that is still running.
        const before = await api.sessions().catch(() => [] as SessionStatus[])
        const reset: SessionId[] = []
        for (const id of ids) {
          const status = before.find(item => item.id === id)
          if (!status?.connected || status.busy) continue
          const response = await api.query(id, 'ROLLBACK; RESET ALL;').catch(() => null)
          if (response && !response.error) reset.push(id)
        }
        if (reset.length) setEntryResetNote(`このステップに入る際、セッション ${reset.join('・')} に ROLLBACK; RESET ALL; を自動実行しました（前のステップで開いたままのトランザクションと SET した設定を、このステップの実験の前に戻すため）。`)
      }
      const statuses = await refresh().catch(() => [] as SessionStatus[])
      // Snapshot once on entry only: opening a transaction mid-step is often the lesson itself.
      setEntryOpen(ids.filter(id => {
        const status = statuses.find(item => item.id === id)
        return !!status?.connected && (status.transactionStatus === 'transaction' || status.transactionStatus === 'failed')
      }))
    })()
  }, [step, ids, refresh])
  const mark = useCallback((index: number, value: boolean) => {
    const next = [...completedRef.current]; next[index] = value
    completedRef.current = next; setCompleted(next)
  }, [])
  const setRunning = useCallback((id: SessionId, value: boolean) => {
    busyRef.current[id] = value; setBusy({ ...busyRef.current }); onBusy(busyRef.current.A || busyRef.current.B)
  }, [onBusy])
  async function connection(id: SessionId, info: ConnectionInfo) {
    setRunning(id, true); setPassed(false)
    try { await api.connect(id, info); await refresh(); setMessage('接続しました。') }
    catch (error) { setMessage(String(error)) } finally { setRunning(id, false) }
  }
  async function rollbackEntry() {
    const current = await api.sessions().catch(() => [] as SessionStatus[])
    const done: SessionId[] = []
    for (const id of entryOpen) {
      const status = current.find(item => item.id === id)
      if (!status?.connected || status.busy) continue
      setRunning(id, true)
      const response = await api.query(id, 'ROLLBACK').catch(() => null)
      setRunning(id, false)
      if (response && !response.error) done.push(id)
    }
    setEntryOpen(value => value.filter(id => !done.includes(id)))
    if (done.length) setMessage(`セッション ${done.join('・')} を ROLLBACK して、状態を戻しました。`)
    await refresh().catch(error => setMessage(String(error)))
  }
  const run = useCallback(async (id: SessionId, text: string, csv = false) => {
    if (busyRef.current[id] || !text.trim()) return
    setRunning(id, true); setMessage(''); setPassed(false)
    const index = completedRef.current.findIndex(done => !done)
    const action = step.script?.[index]
    const matches = !csv && action?.session === id && action.sql.trim() === text.trim()
    let settled = false, observedBlock = false
    // Backstop for when the lock monitor is slow or unreachable: a matched guide query that is
    // still running after 1s reads as blocked (the previous heuristic), never double-marking.
    const timer = setTimeout(() => {
      if (matches && action?.expect === 'blocks' && !settled && !observedBlock) {
        observedBlock = true; mark(index, true); setMessage('ロック待ちを確認しました。次のセッションの操作へ進んでください。')
      }
    }, 1000)
    if (matches && action?.expect === 'blocks') {
      void (async () => {
        // Primary detection: ask the server's lock view whether this session is waiting on a lock.
        while (!settled && !observedBlock) {
          try {
            const monitor = await api.monitor()
            if (monitor.lockWaits.some(wait => wait.blockedSessionId === id)) {
              observedBlock = true; mark(index, true); setMessage('ロック待ちを確認しました（pg_locks の待ちを検出）。次のセッションの操作へ進んでください。')
              return
            }
          } catch { return } // monitor failed → the 1s timer fallback decides
          await new Promise(resolve => setTimeout(resolve, 250))
        }
      })()
    }
    try {
      const response = csv ? await api.csv('authors.csv', id) : await api.query(id, text)
      settled = true; setResponses(value => ({ ...value, [id]: response }))
      if (matches && action) {
        const ok = typeof action.expect === 'object' ? response.error?.code === action.expect.errorCode :
          action.expect === 'blocks' ? observedBlock && (action.completionErrorCode ? response.error?.code === action.completionErrorCode : !response.error) : !response.error
        mark(index, ok)
        if (!ok) setMessage('ガイドの期待結果と異なります。SQL と実行順を確認してください。')
      }
    } catch (error) { settled = true; if (matches) mark(index, false); setMessage(String(error)) }
    finally { clearTimeout(timer); setRunning(id, false); await refresh().catch(error => setMessage(String(error))) }
  }, [step, mark, setRunning, refresh])
  async function grade() {
    setGrading(true)
    try {
      const response = responses[step.session === 'AB' ? 'A' : step.session]
      const result = await api.check({ stepId: step.id, lastResult: response.results.at(-1), lastError: response.error, scriptCompleted: completedRef.current })
      setMessage(result.message); setPassed(result.passed)
      if (result.passed) onPassed()
    } catch (error) { setMessage(String(error)) } finally { setGrading(false) }
  }
  const anyBusy = busy.A || busy.B
  const insertSql = (id: SessionId, text: string) => { setSql(value => ({ ...value, [id]: text })); onExpandWork() }
  return <div className={`lesson-workspace ${workCollapsed ? 'work-collapsed' : ''}`}>
    {(entryResetNote || entryOpen.length > 0) && <div className="lesson-entry-state" role="status">
      {entryResetNote && <p className="feedback lesson-toast">{entryResetNote}</p>}
      {entryOpen.length > 0 && <div className="lesson-entry-rollback">
        <p className="feedback lesson-toast">前のステップのトランザクションが、セッション {entryOpen.join('・')} で開いたままです。このままだとロックや SET した設定がこのステップに影響します。</p>
        <button onClick={() => { void rollbackEntry() }}>ROLLBACK して状態を戻す</button>
      </div>}
    </div>}
    <article className="lesson-reading">
    <p className="eyebrow">{step.id} / 図書館の業務から学ぶ</p><h1>{step.title}</h1>
    {step.story && <div className="lesson-story"><Md text={step.story} /></div>}
    <Md text={step.explanation} />
    <section className="lesson-task"><h2>今回の課題</h2><Md text={step.task} /></section>
    {step.connect && <button disabled={anyBusy} onClick={() => { void (async () => { for (const id of ['A', 'B'] as const) { const info = step.connect?.[id]; if (info) await connection(id, info) } })() }}>指定の接続に切り替え</button>}
    {step.solution.includes('@csv authors.csv') && <button disabled={anyBusy} onClick={() => { void run(ids[0], 'authors.csv', true) }}>同梱 CSV を読み込む</button>}
    {step.script && <ol className="script-guide">{step.script.map((action, index) => <li key={index} className={completed[index] ? 'script-done' : ''}>
      <strong>{completed[index] ? '✓ ' : ''}セッション {action.session} — {typeof action.expect === 'object' ? `エラー ${action.expect.errorCode}` : action.expect === 'blocks' ? 'ロック待ちを観察' : '実行'}</strong>
      {action.note && <p>{action.note}</p>}<pre><code>{action.sql}</code></pre>
      <button disabled={busy[action.session] || (index > 0 && !completed[index - 1])} onClick={() => insertSql(action.session, action.sql)}>このSQLを挿入</button>
    </li>)}</ol>}
    <div className="lesson-help"><button disabled={hintCount >= step.hints.length} onClick={() => setHintCount(value => value + 1)}>ヒントを見る ({hintCount}/{step.hints.length})</button>{step.hints.slice(0, hintCount).map((hint, index) => <Md key={index} text={hint} />)}
      <details><summary>模範解答</summary><pre><code>{step.solution || 'このステップに SQL の入力はありません。'}</code></pre>{step.solution && <button onClick={() => insertSql(ids[0], step.solution)}>エディタに挿入</button>}</details>
      {step.mysqlNote && <details><summary>MySQLでは？</summary><Md text={step.mysqlNote} /></details>}
    </div>
    <button className="primary" disabled={anyBusy || grading} onClick={() => { void grade() }}>{grading ? '採点中…' : passed ? '✓ 合格・もう一度採点' : step.check.type === 'manual' ? '読みました・次へ進む準備' : '採点する'}</button>
    {message && <p className={`feedback lesson-toast ${passed ? 'passed' : ''}`} role="status">{message}</p>}
  </article>
  {workCollapsed && <button className="lesson-work-rail" onClick={onExpandWork} aria-label="SQL作業エリアを開く" title="SQL作業エリアを開く"><span aria-hidden="true">◂</span><span className="lesson-work-rail-label">SQL作業エリアを開く</span>{anyBusy && <span className="lesson-work-rail-busy">実行中</span>}</button>}
  {/* Hidden rather than unmounted so editor text, results and running queries survive a collapse. */}
  <div className={`lesson-editors ${ids.length === 2 ? 'dual-session' : ''}`} hidden={workCollapsed}>{ids.map(id => <section key={id} className="lesson-session" aria-label={`セッション ${id}`}>
    <SessionBar id={id} status={statuses.find(status => status.id === id)} running={busy[id]} connecting={false}
      onConnect={info => connection(id, info)}
      onDisconnect={async () => { try { await api.disconnect(id); await refresh() } catch (error) { setMessage(String(error)) } }}
      onCancel={async () => { try { await api.cancel(id) } catch (error) { setMessage(String(error)) } }} />
    <SqlEditor value={sql[id]} onChange={text => setSql(value => ({ ...value, [id]: text }))} busy={busy[id] || !!statuses.find(status => status.id === id)?.busy} onRun={text => { void run(id, text) }} />
    {responses[id].error && <ErrorPanel error={responses[id].error!} />}<NoticeList notices={responses[id].notices} /><ResultGrid results={responses[id].results} />
  </section>)}<div className="lesson-dock"><PanelDock step={step} /></div></div></div>
}
export function LessonPage() {
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [selected, setSelected] = useState('ch00-01')
  const [progress, setProgress] = useState(savedProgress)
  const [message, setMessage] = useState('')
  const [resetting, setResetting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [workCollapsed, setWorkCollapsed] = useState(savedWorkCollapsed)
  const expandWork = useCallback(() => setWorkCollapsed(false), [])
  useEffect(() => { void api.lessons().then(setChapters).catch(error => setMessage(String(error))) }, [])
  useEffect(() => { try { localStorage.setItem(workCollapsedKey, workCollapsed ? '1' : '0') } catch { /* Storage may be disabled. */ } }, [workCollapsed])
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(progress)) } catch { /* Storage may be disabled. */ } }, [progress])
  const allSteps = chapters.flatMap(chapter => chapter.steps)
  const step = allSteps.find(step => step.id === selected) ?? allSteps[0]
  const chapter = chapters.find(chapter => chapter.steps.some(item => item.id === step?.id))
  async function reset(toChapter: number) {
    if (!window.confirm('library と lib_ ロールを作り直します。学習用データは失われます。続けますか？')) return
    setResetting(true)
    try {
      const result = await api.reset(toChapter); setMessage(result.message)
      setProgress(value => value.filter(id => Number(id.slice(2, 4)) < toChapter))
      setSelected(chapters.find(chapter => chapter.id === toChapter)?.steps[0]?.id ?? 'ch00-01')
      setGeneration(value => value + 1)
    } catch (error) { setMessage(String(error)) } finally { setResetting(false) }
  }
  const next = allSteps[allSteps.findIndex(item => item.id === step?.id) + 1]
  return <main className="lesson-page"><aside className="lesson-sidebar"><div className="lesson-sidebar-heading"><p className="eyebrow">SQL道場 / 学習コース</p><h2>図書館を作ろう</h2><p className="muted small">{progress.length} / {allSteps.length} ステップ完了</p></div>
    <nav aria-label="章とステップ">{chapters.map(item => <details key={item.id} open={item.id === chapter?.id || undefined}><summary>{String(item.id).padStart(2, '0')} {item.title}</summary>{item.steps.length ? item.steps.map(item => <button key={item.id} className={step?.id === item.id ? 'selected-step' : ''} aria-current={step?.id === item.id ? 'step' : undefined} disabled={busy || resetting} onClick={() => setSelected(item.id)}><span>{progress.includes(item.id) ? '✓' : '○'}</span>{item.title}</button>) : <p className="muted small stub-label">教材を準備中</p>}</details>)}</nav>
    <button className="danger-button" disabled={busy || resetting} onClick={() => { void reset(0) }}>全部リセット</button>
  </aside><div className="lesson-main"><header className="lesson-toolbar"><span>{chapter?.title ?? '学習コース'}</span><button disabled={busy || resetting || !chapter} onClick={() => { void reset(chapter?.id ?? 0) }}>{resetting ? '状態を再生中…' : '章の最初からやり直す'}</button><button aria-pressed={workCollapsed} onClick={() => setWorkCollapsed(value => !value)}>{workCollapsed ? '◂ SQL作業エリアを表示' : 'SQL作業エリアを折りたたむ ▸'}</button>{next && <button className="primary" disabled={busy || resetting || !step} title={step && !progress.includes(step.id) ? 'このステップは未合格ですが、先に進めます' : undefined} onClick={() => { setSelected(next.id); window.scrollTo({ top: 0 }) }}>次へ →</button>}</header>
    {message && <p className="feedback" role="status">{message}</p>}
    {!chapters.length ? <p className="muted">教材を読み込んでいます…</p> : step && !resetting && <Workspace key={`${generation}-${step.id}`} step={step} onBusy={setBusy} workCollapsed={workCollapsed} onExpandWork={expandWork} onPassed={() => setProgress(value => value.includes(step.id) ? value : [...value, step.id])} />}
  </div></main>
}
export const page = { id: 'lessons', label: '学習コース', component: LessonPage, order: 0 }
