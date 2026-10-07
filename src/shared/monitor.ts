import type { TransactionStatus } from './types.js'

/** One client backend as seen through pg_stat_activity, with the app session id when it belongs to a lesson session. */
export interface MonitorBackend {
  pid: number
  /** Lesson session id ('admin' | 'A' | 'B') when the backend pid matches a managed session, else null. */
  sessionId: string | null
  usename: string | null
  datname: string | null
  state: string | null
  /** Seconds since the current transaction started (null when no transaction is open). */
  xactAgeSeconds: number | null
  /** Seconds since the backend last changed state; approximates the lock wait time while blocked. */
  stateAgeSeconds: number | null
  waitEventType: string | null
  waitEvent: string | null
  query: string | null
  /** SessionManager-reported transaction status when mapped, else null. */
  transactionStatus: TransactionStatus | null
  /** SessionManager-reported busy flag when mapped, else null. */
  busy: boolean | null
}

/** One ungranted lock request; blocking_pids comes from pg_blocking_pids. */
export interface MonitorLockWait {
  blockedPid: number
  blockedSessionId: string | null
  blockingPids: number[]
  blockingSessionIds: (string | null)[]
  locktype: string
  mode: string
  /** Locked relation as schema.table when resolvable from the monitored database, else null. */
  relation: string | null
  waitSeconds: number | null
}

export interface MonitorResponse {
  /** Database the statistics were read from (relation names resolve within it). */
  database: string
  updatedAt: string
  backends: MonitorBackend[]
  lockWaits: MonitorLockWait[]
}
