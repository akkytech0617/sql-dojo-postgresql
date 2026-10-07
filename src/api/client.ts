import type { ConnectionInfo, HealthResponse, QueryResponse, SessionStatus, SqlError } from '../shared/types'
import type { Chapter, CheckRequest, CheckResponse, ResetResponse, SessionId } from '../shared/lessons'
import type { MonitorResponse } from '../shared/monitor'
export class ApiError extends Error {
  constructor(message: string, public readonly sqlError?: SqlError) { super(message); this.name = 'ApiError' }
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  } catch { throw new ApiError('API に接続できません。開発サーバーを確認してください。') }
  const data: unknown = await response.json().catch(() => null)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    // A non-JSON body (proxy error page, crashed handler) must not surface as a SyntaxError.
    throw new ApiError(`API から予期しない応答がありました（HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}）。`)
  }
  const payload = data as { error?: SqlError; message?: string }
  if (!response.ok) throw new ApiError(payload.error?.ja?.title ?? payload.message ?? 'リクエストに失敗しました。', payload.error)
  return data as T
}
const sessionPath = (id: string) => `/sessions/${encodeURIComponent(id)}`
export const api = {
  lessons: () => request<Chapter[]>('/lessons'),
  check: (input: CheckRequest) => request<CheckResponse>('/lessons/check', input),
  reset: (toChapter = 0) => request<ResetResponse>('/reset', { toChapter }),
  csv: (file: string, session: SessionId) => request<QueryResponse>('/lessons/csv', { file, session }),
  health: () => request<HealthResponse>('/health'),
  sessions: () => request<SessionStatus[]>('/sessions'),
  monitor: () => request<MonitorResponse>('/monitor'),
  connect: (id: string, info: ConnectionInfo) => request<SessionStatus>(`${sessionPath(id)}/connect`, info),
  disconnect: (id: string) => request<SessionStatus>(`${sessionPath(id)}/disconnect`, {}),
  query: (id: string, sql: string) => request<QueryResponse>(`${sessionPath(id)}/query`, { sql }),
  cancel: (id: string) => request<{ cancelled: boolean }>(`${sessionPath(id)}/cancel`, {}),
}
