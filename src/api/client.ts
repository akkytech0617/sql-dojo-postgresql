import type { ConnectionInfo, HealthResponse, QueryResponse, SessionStatus, SqlError } from '../shared/types'
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
  const data = await response.json()
  if (!response.ok) throw new ApiError(data.error?.ja?.title ?? data.message ?? 'リクエストに失敗しました。', data.error)
  return data as T
}
const sessionPath = (id: string) => `/sessions/${encodeURIComponent(id)}`
export const api = {
  health: () => request<HealthResponse>('/health'),
  sessions: () => request<SessionStatus[]>('/sessions'),
  connect: (id: string, info: ConnectionInfo) => request<SessionStatus>(`${sessionPath(id)}/connect`, info),
  disconnect: (id: string) => request<SessionStatus>(`${sessionPath(id)}/disconnect`, {}),
  query: (id: string, sql: string) => request<QueryResponse>(`${sessionPath(id)}/query`, { sql }),
  cancel: (id: string) => request<{ cancelled: boolean }>(`${sessionPath(id)}/cancel`, {}),
}
