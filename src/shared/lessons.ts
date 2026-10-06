import type { QueryResult, SqlError } from './types.js'
export type SessionId = 'A' | 'B'
export interface ConnectSpec { user: string; password: string; database: string }
export interface ScriptAction {
  session: SessionId
  sql: string
  expect: 'ok' | 'blocks' | { errorCode: string }
  /** For a blocked action that eventually fails (e.g. deadlock victim). Default is success. */
  completionErrorCode?: string
  note?: string
}
export type Check =
  | { type: 'sql'; sql: string; database?: string }
  | { type: 'result-equals'; expectedSql: string; ordered?: boolean; database?: string }
  | { type: 'error-code'; code: string }
  | { type: 'script' }
  | { type: 'manual' }
export interface Step {
  id: string
  title: string
  story?: string
  explanation: string
  task: string
  hints: string[]
  solution: string
  session: SessionId | 'AB'
  /** Default execution/check database is library. ch0/ch1 must specify postgres as needed. */
  database?: string
  connect?: Partial<Record<SessionId, ConnectSpec>>
  script?: ScriptAction[]
  /** Empty string explicitly means no persistent changes. Required for AB/error steps. */
  replay?: string
  replayDatabase?: string
  check: Check
  checkPassesBefore?: boolean
  mysqlNote?: string
}
export interface Chapter { id: number; title: string; summary: string; steps: Step[] }
export interface CheckRequest {
  stepId: string
  lastResult?: QueryResult
  lastError?: Pick<SqlError, 'code'>
  /** Locally guided evidence only: this local learning app is not an exam server. */
  scriptCompleted?: boolean[]
}
export interface CheckResponse { passed: boolean; message: string }
export interface ResetResponse { toChapter: number; replayedSteps: string[]; message: string }
