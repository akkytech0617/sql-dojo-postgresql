import { useCallback, useEffect, useRef, useState } from 'react'
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
function Workspace({ step, onPassed, onBusy }: { step: Step; onPassed: () => void; onBusy: (busy: boolean) => void }) {
  const ids: SessionId[] = step.session === 'AB' ? ['A', 'B'] : [step.session]
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
  const refresh = useCallback(async () => setStatuses(await api.sessions()), [])
  useEffect(() => {
    let active = true
    const poll = () => { void api.sessions().then(value => { if (active) setStatuses(value) }).catch(error => { if (active) setMessage(String(error)) }) }
    poll(); const timer = setInterval(poll, 1000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  function mark(index: number, value: boolean) {
    const next = [...completedRef.current]; next[index] = value
    completedRef.current = next; setCompleted(next)
  }
  function setRunning(id: SessionId, value: boolean) {
    busyRef.current[id] = value; setBusy({ ...busyRef.current }); onBusy(busyRef.current.A || busyRef.current.B)
  }
  async function connection(id: SessionId, info: ConnectionInfo) {
    setRunning(id, true); setPassed(false)
    try { await api.connect(id, info); await refresh(); setMessage('接続しました。') }
    catch (error) { setMessage(String(error)) } finally { setRunning(id, false) }
  }
  async function run(id: SessionId, text: string, csv = false) {
    if (busyRef.current[id] || !text.trim()) return
    setRunning(id, true); setMessage(''); setPassed(false)
    const index = completedRef.current.findIndex(done => !done)
    const action = step.script?.[index]
    const matches = !csv && action?.session === id && action.sql.trim() === text.trim()
    let settled = false, observedBlock = false
    const timer = setTimeout(() => {
      if (matches && action?.expect === 'blocks' && !settled) {
        observedBlock = true; mark(index, true); setMessage('ロック待ちを確認しました。次のセッションの操作へ進んでください。')
      }
    }, 1000)
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
  }
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
  return <div className="lesson-workspace"><article className="lesson-reading">
    <p className="eyebrow">{step.id} / 市立図書館の業務から学ぶ</p><h1>{step.title}</h1>
    {step.story && <div className="lesson-story"><Md text={step.story} /></div>}
    <Md text={step.explanation} />
    <section className="lesson-task"><h2>今回の課題</h2><Md text={step.task} /></section>
    {step.connect && <button disabled={anyBusy} onClick={() => { void (async () => { for (const id of ['A', 'B'] as const) { const info = step.connect?.[id]; if (info) await connection(id, info) } })() }}>指定の接続に切り替え</button>}
    {step.solution.includes('@csv authors.csv') && <button disabled={anyBusy} onClick={() => { void run(ids[0], 'authors.csv', true) }}>同梱 CSV を読み込む</button>}
    {step.script && <ol className="script-guide">{step.script.map((action, index) => <li key={index} className={completed[index] ? 'script-done' : ''}>
      <strong>{completed[index] ? '✓ ' : ''}セッション {action.session} — {typeof action.expect === 'object' ? `エラー ${action.expect.errorCode}` : action.expect === 'blocks' ? 'ロック待ちを観察' : '実行'}</strong>
      {action.note && <p>{action.note}</p>}<pre><code>{action.sql}</code></pre>
      <button disabled={busy[action.session] || (index > 0 && !completed[index - 1])} onClick={() => setSql(value => ({ ...value, [action.session]: action.sql }))}>このSQLを挿入</button>
    </li>)}</ol>}
    <div className="lesson-help"><button disabled={hintCount >= step.hints.length} onClick={() => setHintCount(value => value + 1)}>ヒントを見る ({hintCount}/{step.hints.length})</button>{step.hints.slice(0, hintCount).map((hint, index) => <Md key={index} text={hint} />)}
      <details><summary>模範解答</summary><pre><code>{step.solution || 'このステップに SQL の入力はありません。'}</code></pre>{step.solution && <button onClick={() => setSql(value => ({ ...value, [ids[0]]: step.solution }))}>エディタに挿入</button>}</details>
      {step.mysqlNote && <details><summary>MySQLでは？</summary><Md text={step.mysqlNote} /></details>}
    </div>
    <button className="primary" disabled={anyBusy || grading} onClick={() => { void grade() }}>{grading ? '採点中…' : passed ? '✓ 合格・もう一度採点' : step.check.type === 'manual' ? '読みました・次へ進む準備' : '採点する'}</button>
    {message && <p className={`feedback lesson-toast ${passed ? 'passed' : ''}`} role="status">{message}</p>}
  </article><div className={`lesson-editors ${ids.length === 2 ? 'dual-session' : ''}`}>{ids.map(id => <section key={id} className="lesson-session" aria-label={`セッション ${id}`}>
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
  useEffect(() => { void api.lessons().then(setChapters).catch(error => setMessage(String(error))) }, [])
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
  return <main className="lesson-page"><aside className="lesson-sidebar"><div className="lesson-sidebar-heading"><p className="eyebrow">SQL道場 / 学習コース</p><h2>市立図書館を作ろう</h2><p className="muted small">{progress.length} / {allSteps.length} ステップ完了</p></div>
    <nav aria-label="章とステップ">{chapters.map(item => <details key={item.id} open={item.id === chapter?.id || undefined}><summary>{String(item.id).padStart(2, '0')} {item.title}</summary>{item.steps.length ? item.steps.map(item => <button key={item.id} className={step?.id === item.id ? 'selected-step' : ''} aria-current={step?.id === item.id ? 'step' : undefined} disabled={busy || resetting} onClick={() => setSelected(item.id)}><span>{progress.includes(item.id) ? '✓' : '○'}</span>{item.title}</button>) : <p className="muted small stub-label">教材を準備中</p>}</details>)}</nav>
    <button className="danger-button" disabled={busy || resetting} onClick={() => { void reset(0) }}>全部リセット</button>
  </aside><div className="lesson-main"><header className="lesson-toolbar"><span>{chapter?.title ?? '学習コース'}</span><button disabled={busy || resetting || !chapter} onClick={() => { void reset(chapter?.id ?? 0) }}>{resetting ? '状態を再生中…' : '章の最初からやり直す'}</button>{next && <button disabled={busy || resetting || !step || !progress.includes(step.id)} onClick={() => setSelected(next.id)}>次へ →</button>}</header>
    {message && <p className="feedback" role="status">{message}</p>}
    {!chapters.length ? <p className="muted">教材を読み込んでいます…</p> : step && !resetting && <Workspace key={`${generation}-${step.id}`} step={step} onBusy={setBusy} onPassed={() => setProgress(value => value.includes(step.id) ? value : [...value, step.id])} />}
  </div></main>
}
export const page = { id: 'lessons', label: '学習コース', component: LessonPage, order: 0 }
