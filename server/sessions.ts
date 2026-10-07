import { Client, type QueryResult as PgResult } from 'pg'
import type { EventEmitter } from 'node:events'
import { config } from './config.js'
import { serializeSqlError } from './errors-ja.js'
import type { ConnectionInfo, QueryResponse, SessionStatus, SqlNotice, TransactionStatus } from '../src/shared/types.js'

interface Session {
  id: string
  client: Client | null
  info: ConnectionInfo | null
  pid: number | null
  tx: TransactionStatus
  busy: boolean
  lazy: boolean
}
function sessionError(code: string, message: string) { return Object.assign(new Error(message), { code }) }
function protocolConnection(client: Client): EventEmitter {
  return (client as unknown as { connection: EventEmitter }).connection
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>()
  constructor(ids = ['admin', 'A', 'B']) {
    for (const id of ids) this.sessions.set(id, this.newSession(id, true))
  }
  private newSession(id: string, lazy = false): Session {
    return { id, client: null, info: null, pid: null, tx: 'unknown', busy: false, lazy }
  }
  /** Sessions are a fixed set (admin/A/B); unknown ids are a client error, not a new session. */
  private get(id: string): Session {
    const session = this.sessions.get(id)
    if (!session) throw sessionError('42704', `セッション ${id} は存在しません。admin / A / B のいずれかを指定してください。`)
    return session
  }
  private clear(session: Session) {
    session.client = null
    session.pid = null
    session.tx = 'unknown'
  }
  private makeClient(info: ConnectionInfo) {
    return new Client({ host: config.host, port: config.port, ...info, connectionTimeoutMillis: 5000, application_name: 'sql-dojo' })
  }
  private async open(session: Session, info: ConnectionInfo) {
    const old = session.client
    this.clear(session)
    session.lazy = false
    session.info = { ...info }
    if (old) await old.end().catch(() => undefined)
    const client = this.makeClient(info)
    client.on('error', () => { if (session.client === client) this.clear(session) })
    client.on('end', () => { if (session.client === client) this.clear(session) })
    try {
      await client.connect()
      session.client = client
      // pg does not expose ReadyForQuery in its public typings; this event carries I/T/E.
      const connection = protocolConnection(client)
      connection.on('readyForQuery', ({ status }: { status: string }) => {
        if (session.client === client) session.tx = ({ I: 'idle', T: 'transaction', E: 'failed' } as const)[status as 'I' | 'T' | 'E'] ?? 'unknown'
      })
      const result = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      session.pid = result.rows[0].pid
      session.tx = 'idle'
    } catch (error) {
      this.clear(session)
      await client.end().catch(() => undefined)
      throw error
    }
  }
  async connect(id: string, info: ConnectionInfo): Promise<SessionStatus> {
    const session = this.get(id)
    if (session.busy) throw sessionError('55006', 'セッションは実行中です。先にキャンセルしてください。')
    session.busy = true
    try { await this.open(session, info); return this.snapshot(session, false) }
    finally { session.busy = false }
  }
  async disconnect(id: string): Promise<SessionStatus> {
    const session = this.get(id)
    if (session.busy) throw sessionError('55006', 'セッションは実行中です。先にキャンセルしてください。')
    session.busy = true
    session.lazy = false
    const client = session.client
    this.clear(session)
    try { if (client) await client.end(); return this.snapshot(session, false) }
    finally { session.busy = false }
  }
  private snapshot(session: Session, busy = session.busy): SessionStatus {
    return { id: session.id, connected: session.client !== null, user: session.info?.user ?? null,
      database: session.info?.database ?? null, backendPid: session.pid, transactionStatus: session.tx, busy }
  }
  status(id: string): SessionStatus { return this.snapshot(this.get(id)) }
  list(): SessionStatus[] { return [...this.sessions.values()].map(session => this.snapshot(session)) }
  async query(id: string, sql: string): Promise<QueryResponse> {
    const session = this.get(id)
    if (session.busy) throw sessionError('55006', 'このセッションでは別の SQL が実行中です。')
    session.busy = true
    const notices: SqlNotice[] = []
    const noticeListener = (notice: { severity?: string; message?: string }) => notices.push({ severity: notice.severity ?? 'NOTICE', message: notice.message ?? '' })
    let client: Client | null = null
    const started = performance.now()
    try {
      if (!session.client && session.lazy) await this.open(session, config.admin)
      client = session.client
      if (!client) throw sessionError('08003', 'セッションは未接続です。接続し直してください。')
      client.on('notice', noticeListener)
      // A string-only query uses PostgreSQL's simple protocol, including multi-statement batches.
      const connection = protocolConnection(client)
      let settle: () => void = () => undefined
      const ready = new Promise<void>(resolve => { settle = resolve })
      connection.once('readyForQuery', settle)
      client.once('error', settle)
      client.once('end', settle)
      let response: PgResult | PgResult[]
      try {
        response = await client.query(sql)
      } finally {
        // pg rejects on ErrorResponse, before ReadyForQuery updates the transaction state.
        await ready
        connection.removeListener('readyForQuery', settle)
        client.removeListener('error', settle)
        client.removeListener('end', settle)
      }
      const results: PgResult[] = Array.isArray(response) ? response : [response]
      const durationMs = Math.round((performance.now() - started) * 100) / 100
      return { notices, results: results.map(result => ({
        command: result.command, rowCount: result.rowCount,
        fields: result.fields.map(({ name, dataTypeID }) => ({ name, dataTypeID })),
        rows: result.rows.slice(0, 1000), truncated: result.rows.length > 1000, durationMs,
      })) }
    } catch (error) { return { results: [], notices, error: serializeSqlError(error) } }
    finally { client?.removeListener('notice', noticeListener); session.busy = false }
  }
  async cancel(id: string): Promise<boolean> {
    const session = this.get(id)
    if (!session.client || !session.pid || !session.busy) return false
    // Separate admin connection: cancellation must not queue behind a running session query.
    const admin = this.makeClient(config.admin)
    admin.on('error', () => undefined)
    try {
      await admin.connect()
      const result = await admin.query<{ cancelled: boolean }>('SELECT pg_cancel_backend($1) AS cancelled', [session.pid])
      return result.rows[0].cancelled
    } finally { await admin.end().catch(() => undefined) }
  }
  async health(): Promise<boolean> {
    const admin = this.makeClient(config.admin)
    admin.on('error', () => undefined)
    try { await admin.connect(); await admin.query('SELECT 1'); return true }
    catch { return false }
    finally { await admin.end().catch(() => undefined) }
  }
  async close(): Promise<void> {
    await Promise.all([...this.sessions.values()].map(async session => {
      const client = session.client
      this.clear(session)
      if (client) await client.end().catch(() => undefined)
    }))
  }
}
