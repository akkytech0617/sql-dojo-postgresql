import type { MonitorBackend, MonitorLockWait } from '../../shared/monitor'

const sessionLabel = (sessionId: string | null, pid: number) => sessionId ?? `pid ${pid}`

const locktypeLabels: Record<string, string> = {
  transactionid: 'トランザクション',
  tuple: '行（タプル）',
  relation: '表',
  page: 'ページ',
  object: 'オブジェクト',
  database: 'データベース',
}

interface WaitPair {
  key: string
  blocked: MonitorLockWait
  relations: (string | null)[]
  modes: string[]
  locktypes: string[]
  blockingPids: number[]
  blockingSessionIds: (string | null)[]
}

/** Groups ungranted lock rows into blocked ⟶ 待ち ⟶ blocking pairs for the visualization. */
function pairWaits(waits: MonitorLockWait[]): WaitPair[] {
  const groups = new Map<string, WaitPair>()
  for (const wait of waits) {
    const key = `${wait.blockedPid}->${wait.blockingPids.join(',')}`
    const group = groups.get(key) ?? {
      key, blocked: wait, relations: [], modes: [], locktypes: [], blockingPids: wait.blockingPids, blockingSessionIds: wait.blockingSessionIds,
    }
    if (wait.relation && !group.relations.includes(wait.relation)) group.relations.push(wait.relation)
    if (!group.modes.includes(wait.mode)) group.modes.push(wait.mode)
    if (!group.locktypes.includes(wait.locktype)) group.locktypes.push(wait.locktype)
    groups.set(key, group)
  }
  return [...groups.values()]
}

function backendByPid(backends: MonitorBackend[]): Map<number, MonitorBackend> {
  return new Map(backends.map(backend => [backend.pid, backend]))
}

export function LockWaitList({ waits, backends }: { waits: MonitorLockWait[]; backends: MonitorBackend[] }) {
  const pairs = pairWaits(waits)
  if (!pairs.length) return <p className="lock-empty">現在、ロック待ちはありません。9章のスクリプトで待ちが発生すると、ここに「どのセッションが・誰を・何秒待っているか」が表示されます。</p>
  const byPid = backendByPid(backends)
  return <ul className="lock-wait-list">{pairs.map(pair => {
    const blocked = byPid.get(pair.blocked.blockedPid)
    const waitSeconds = pair.blocked.waitSeconds
    return <li key={pair.key} className="lock-wait-item">
      <div className="lock-wait-flow">
        <span className="lock-chip lock-chip-blocked" title={`pid ${pair.blocked.blockedPid}`}>
          {sessionLabel(pair.blocked.blockedSessionId, pair.blocked.blockedPid)}
        </span>
        <span className="lock-arrow">待ち{waitSeconds !== null ? `（${waitSeconds.toFixed(1)}秒）` : ''}</span>
        {pair.blockingPids.map((pid, index) => (
          <span key={pid} className="lock-chip lock-chip-holding" title={`pid ${pid}`}>
            {sessionLabel(pair.blockingSessionIds[index] ?? null, pid)}
          </span>
        ))}
      </div>
      <div className="lock-wait-detail">
        {pair.relations.map(relation => <span key={relation} className="lock-tag">{relation}</span>)}
        {pair.locktypes.map(locktype => <span key={locktype} className="lock-tag">{locktypeLabels[locktype] ?? locktype}{pair.modes.length ? ` (${pair.modes.join('・')})` : ''}</span>)}
        {!pair.relations.length && pair.modes.map(mode => <span key={mode} className="lock-tag">{mode}</span>)}
        {blocked?.query && <code className="lock-query lock-tag">{blocked.query.replace(/\s+/g, ' ').slice(0, 160)}</code>}
      </div>
    </li>
  })}</ul>
}
