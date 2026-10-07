import { useCallback, useEffect, useState } from 'react'
import '../components/locks/locks.css'
import type { PanelDefinition } from '../app/panelRegistry'
import { api } from '../api/client'
import { BackendTable } from '../components/locks/BackendTable'
import { LockWaitList } from '../components/locks/LockWaitList'
import type { MonitorResponse } from '../shared/monitor'

function LocksPanel() {
  const [data, setData] = useState<MonitorResponse | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await api.monitor())
      setError('')
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)) }
  }, [])

  useEffect(() => {
    let active = true
    let inFlight = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // Chained timeout with an in-flight guard: one refresh at a time, next scheduled only after
    // the previous settles, and a fast unmount leaves no pending fetch behind.
    const tick = () => {
      if (!active || inFlight) return
      inFlight = true
      void load().finally(() => {
        inFlight = false
        if (active) timer = setTimeout(tick, 1000)
      })
    }
    tick()
    return () => { active = false; clearTimeout(timer) }
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
