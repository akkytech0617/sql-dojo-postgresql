import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api/client'
import { ErrorPanel } from '../components/ErrorPanel'
import { NoticeList } from '../components/NoticeList'
import { ResultGrid } from '../components/ResultGrid'
import { SessionBar } from '../components/SessionBar'
import { SqlEditor } from '../components/SqlEditor'
import type { ConnectionInfo, QueryResponse, SessionStatus, SqlError } from '../shared/types'
const initialSql = `-- まずは、小さなクエリから。
-- 範囲を選択すると、その部分だけ実行できます。
SELECT
  'SQL道場へようこそ' AS メッセージ,
  current_database() AS データベース,
  version() AS バージョン;`
export function PlaygroundPage() {
  const id = 'A'
  const [sql, setSql] = useState(initialSql)
  const [status, setStatus] = useState<SessionStatus>()
  const [response, setResponse] = useState<QueryResponse>({ results: [], notices: [] })
  const [running, setRunning] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [message, setMessage] = useState('')
  const [connectionError, setConnectionError] = useState<SqlError>()
  const inFlight = useRef(false)
  const refresh = useCallback(async () => {
    const sessions = await api.sessions()
    setStatus(sessions.find(session => session.id === id))
  }, [])
  useEffect(() => {
    let active = true
    const poll = () => { void api.sessions().then(sessions => {
      if (active) setStatus(sessions.find(session => session.id === id))
    }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : '接続状態を取得できません。') }) }
    poll()
    const timer = setInterval(poll, 2000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : '操作に失敗しました。')
    setConnectionError(error instanceof ApiError ? error.sqlError : undefined)
  }
  const run = useCallback(async (text: string) => {
    if (!text.trim() || inFlight.current) return
    inFlight.current = true
    setRunning(true); setMessage(''); setConnectionError(undefined)
    try { setResponse(await api.query(id, text)) }
    catch (error) { showError(error) }
    finally { inFlight.current = false; setRunning(false); await refresh().catch(showError) }
  }, [refresh])
  async function connect(info: ConnectionInfo) {
    setConnecting(true); setMessage(''); setConnectionError(undefined)
    try { setStatus(await api.connect(id, info)); setMessage('接続しました。') }
    catch (error) { showError(error); await refresh().catch(showError) }
    finally { setConnecting(false) }
  }
  async function disconnect() {
    setConnecting(true); setMessage(''); setConnectionError(undefined)
    try { setStatus(await api.disconnect(id)); setMessage('切断しました。再実行するには接続設定から接続してください。') }
    catch (error) { showError(error) }
    finally { setConnecting(false) }
  }
  async function cancel() {
    try { const result = await api.cancel(id); setMessage(result.cancelled ? 'キャンセルを送信しました。' : 'キャンセルできる実行はありません。') }
    catch (error) { showError(error) }
  }
  return <main className="playground"><div className="page-heading"><div><p className="eyebrow">手を動かして、理解する</p><h1>自由練習モード</h1><p className="page-description">SQL を書く、実行する、結果を見る。自分のペースで PostgreSQL を学びましょう。</p></div><span className="mode-tag">自由に試せる練習環境</span></div>
    <SessionBar id={id} status={status} running={running} connecting={connecting} onConnect={connect} onDisconnect={disconnect} onCancel={cancel} />
    {message && <p className="feedback" role="status">{message}</p>}
    <SqlEditor value={sql} onChange={setSql} onRun={text => { void run(text) }} busy={running || connecting || !!status?.busy} />
    <div className="section-label"><h2>実行結果</h2><span className="muted small">{running ? 'データベースで実行中…' : '結果・エラー・通知を確認'}</span></div>
    {(connectionError ?? response.error) && <ErrorPanel error={(connectionError ?? response.error)!} />}
    <NoticeList notices={response.notices} /><ResultGrid results={response.results} />
    <footer className="page-footer"><span>SQL道場 / ローカル学習環境</span><span>変更は実際のデータベースに反映されます。</span></footer>
  </main>
}
