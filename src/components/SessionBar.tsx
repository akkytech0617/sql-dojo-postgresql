import { useState } from 'react'
import type { ConnectionInfo, SessionStatus, TransactionStatus } from '../shared/types'
const txLabels: Record<TransactionStatus, string> = { idle: 'トランザクションなし', transaction: 'トランザクション中', failed: '失敗状態・ROLLBACK が必要', unknown: '状態不明' }
interface Props {
  id: string; status?: SessionStatus; running: boolean; connecting: boolean
  onConnect: (info: ConnectionInfo) => Promise<void>; onDisconnect: () => Promise<void>; onCancel: () => Promise<void>
}
export function SessionBar({ id, status, running, connecting, onConnect, onDisconnect, onCancel }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [user, setUser] = useState('admin')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState('postgres')
  const busy = running || connecting || !!status?.busy
  return <section className="panel session-panel" aria-label="接続設定"><div className="session-row"><div className="session-identity"><span className="session-badge">{id}</span><div><strong>セッション {id}</strong><span className="connection-detail">{status?.user ?? 'admin'}@{status?.database ?? 'postgres'}</span></div></div><div className="session-state"><span className={`status-dot ${status?.connected ? 'online' : ''}`} />{status?.connected ? '接続済み' : '未接続'}<span className={`tx-label ${status?.transactionStatus === 'failed' ? 'tx-failed' : ''}`}>{status?.connected ? txLabels[status.transactionStatus] : status?.user ? '接続設定から再接続してください' : '初回実行時に自動接続'}</span></div><div className="session-actions">{running || status?.busy ? <button className="danger-button" onClick={() => { void onCancel() }}>実行をキャンセル</button> : <><button onClick={() => setShowForm(!showForm)} disabled={busy} aria-expanded={showForm}>接続設定</button>{status?.connected && <button onClick={() => { void onDisconnect() }} disabled={busy}>切断</button>}</>}</div></div>
    {showForm && <form className="connection-form" onSubmit={event => { event.preventDefault(); void onConnect({ user, password, database }) }}><label>ユーザー名<input value={user} onChange={event => setUser(event.target.value)} required autoComplete="username" /></label><label>パスワード<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label><label>データベース<input value={database} onChange={event => setDatabase(event.target.value)} required /></label><button className="primary" disabled={busy}>{connecting ? '接続中…' : '接続する'}</button><p className="muted small">接続し直すと、未確定のトランザクションと一時テーブルは破棄されます。</p></form>}
  </section>
}
