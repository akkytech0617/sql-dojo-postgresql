import type { MonitorBackend } from '../../shared/monitor'

const stateClass = (backend: MonitorBackend): string => {
  if (backend.state === 'idle in transaction') return 'lock-state-idle-in-transaction'
  if (backend.waitEventType === 'Lock') return 'lock-state-active-lock'
  return ''
}

const formatSeconds = (value: number | null): string =>
  value === null ? '—' : value < 60 ? `${value.toFixed(1)}秒` : `${Math.floor(value / 60)}分${Math.round(value % 60)}秒`

const txLabels: Record<string, string> = {
  idle: 'トランザクションなし',
  transaction: 'トランザクション中',
  failed: '失敗状態・ROLLBACK が必要',
  unknown: '状態不明',
}

/** Sessions managed by the app (A/B/admin) first, then any other client backend. */
function sortBackends(backends: MonitorBackend[]): MonitorBackend[] {
  const rank = (backend: MonitorBackend) => (backend.sessionId === 'A' ? 0 : backend.sessionId === 'B' ? 1 : backend.sessionId === 'admin' ? 2 : 3)
  return [...backends].sort((a, b) => rank(a) - rank(b) || a.pid - b.pid)
}

export function BackendTable({ backends }: { backends: MonitorBackend[] }) {
  if (!backends.length) return <p className="lock-empty">接続中のバックエンドはありません。</p>
  const rows = sortBackends(backends)
  return <div className="table-scroll lock-backend-table"><table>
    <thead><tr><th>セッション</th><th>PID</th><th>ユーザー / DB</th><th>状態</th><th>トランザクション経過</th><th>待ち</th><th>クエリ</th></tr></thead>
    <tbody>{rows.map(backend => <tr key={backend.pid} className={backend.state === 'idle in transaction' ? 'lock-tr-idle-in-transaction' : ''}>
      <td>{backend.sessionId ? <strong>{backend.sessionId}</strong> : <span className="lock-muted">—</span>}</td>
      <td>{backend.pid}</td>
      <td>{backend.usename ?? '—'}<span className="lock-muted">@{backend.datname ?? '—'}</span></td>
      <td className={`lock-state ${stateClass(backend)}`}>
        {backend.state ?? '—'}
        {backend.transactionStatus && backend.sessionId && <span className="lock-muted">・{txLabels[backend.transactionStatus] ?? backend.transactionStatus}</span>}
      </td>
      <td>{formatSeconds(backend.xactAgeSeconds)}</td>
      <td>{backend.waitEventType ? `${backend.waitEventType} / ${backend.waitEvent ?? ''}` : <span className="lock-muted">—</span>}</td>
      <td>{backend.query ? <code className="lock-query">{backend.query.replace(/\s+/g, ' ').slice(0, 200)}</code> : <span className="lock-muted">—</span>}</td>
    </tr>)}</tbody>
  </table></div>
}
