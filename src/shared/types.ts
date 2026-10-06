export interface ConnectionInfo { user: string; password: string; database: string }
export type TransactionStatus = 'idle' | 'transaction' | 'failed' | 'unknown'
export interface SessionStatus {
  id: string
  connected: boolean
  user: string | null
  database: string | null
  backendPid: number | null
  transactionStatus: TransactionStatus
  busy: boolean
}
export interface QueryField { name: string; dataTypeID: number }
export interface QueryResult {
  command: string
  rowCount: number | null
  fields: QueryField[]
  rows: Record<string, unknown>[]
  truncated: boolean
  durationMs: number
}
export interface SqlNotice { severity: string; message: string }
export interface JapaneseError { title: string; explanation: string; tip: string }
export interface SqlError {
  code: string
  message: string
  detail?: string
  hint?: string
  position?: string
  where?: string
  severity?: string
  ja: JapaneseError
}
export interface QueryResponse { results: QueryResult[]; notices: SqlNotice[]; error?: SqlError }
export interface HealthResponse { ok: boolean; database: 'reachable' | 'unreachable' }
