import { useCallback, useEffect, useState } from 'react'
import '../components/locks/locks.css'
import type { PanelDefinition } from '../app/panelRegistry'
import { BackendTable } from '../components/locks/BackendTable'
import { LockWaitList } from '../components/locks/LockWaitList'
import type { MonitorResponse } from '../shared/monitor'

async function fetchMonitor(): Promise<MonitorResponse> {
  let response: Response
  try { response = await fetch('/api/monitor') }
  catch { throw new Error('ロック情報の取得に失敗しました。API サーバーを確認してください。') }
  const data: unknown = await response.json()
  if (!response.ok) throw new Error((data as { message?: string }).message ?? 'ロック情報の取得に失敗しました。')
  return data as MonitorResponse
}

function LocksPanel() {
  const [data, setData] = useState<MonitorResponse | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const next = await fetchMonitor()
      setData(next)
      setError('')
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)) }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, 1000)
    return () => clearInterval(timer)
  }, [load])

  if (error) return <div className="lock-tools"><p className="feedback" role="status">{error}</p></div>
  if (!data) return <div className="lock-tools"><p className="lock-muted small">ロック情報を取得しています…</p></div>

  const blocked = data.lockWaits.length
  const idleInTransaction = data.backends.filter(backend => backend.state === 'idle in transaction')

  return <div className="lock-tools">
    <div className="lock-toolbar">
      <span className="lock-live"><span className="lock-live-dot" />1秒ごとに自動更新中</span>
      <span>{data.database} の pg_stat_activity / pg_locks ・ {new Date(data.updatedAt).toLocaleTimeString()}</span>
    </div>
    {idleInTransaction.length > 0 && <p className="lock-highlight-note small">
      ⚠ 「idle in transaction」（トランザクションを開いたまま放置）が {idleInTransaction.length} 件あります。COMMIT / ROLLBACK を忘れると、他のセッションをロックし続けます。
    </p>}
    {blocked > 0
      ? <p className="feedback lesson-toast" role="status">🔒 ロック待ち {blocked} 件 — 下の「⟶ 待ち ⟶」が、右のセッションが握っているロックを左のセッションが待っている様子です。</p>
      : <p className="lock-muted small">ロック待ちなし。9章のスクリプトでブロックが起きると、ここに A ⟶ 待ち ⟶ B の形で表示されます。</p>}
    <LockWaitList waits={data.lockWaits} backends={data.backends} />
    <BackendTable backends={data.backends} />
  </div>
}

export const panel: PanelDefinition = { id: 'locks', label: 'ロック監視', component: LocksPanel, order: 30 }
