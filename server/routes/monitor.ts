import { Hono } from 'hono'
import type { Client } from 'pg'
import type { SessionManager } from '../sessions.js'
import type { SessionStatus } from '../../src/shared/types.js'
import { withAdmin } from '../lessons.js'
import type { MonitorBackend, MonitorLockWait, MonitorResponse } from '../../src/shared/monitor.js'

interface ActivityRow {
  pid: number
  usename: string | null
  datname: string | null
  state: string | null
  xact_age_seconds: number | null
  state_age_seconds: number | null
  wait_event_type: string | null
  wait_event: string | null
  query: string | null
}
interface LockWaitRow {
  blocked_pid: number
  blocking_pids: number[]
  locktype: string
  mode: string
  relation: string | null
  wait_seconds: number | null
}

// Client backends only: background workers would add noise for learners.
const activitySql = `SELECT a.pid, a.usename, a.datname, a.state,
    CASE WHEN a.xact_start IS NOT NULL THEN EXTRACT(EPOCH FROM (clock_timestamp() - a.xact_start))::double precision END AS xact_age_seconds,
    CASE WHEN a.state_change IS NOT NULL THEN EXTRACT(EPOCH FROM (clock_timestamp() - a.state_change))::double precision END AS state_age_seconds,
    a.wait_event_type, a.wait_event, a.query
  FROM pg_stat_activity a
  WHERE a.pid <> pg_backend_pid() AND a.backend_type = 'client backend'
  ORDER BY a.pid`
// Ungranted lock requests with who is blocking them and for how long.
const lockWaitSql = `SELECT l.pid AS blocked_pid, pg_blocking_pids(l.pid) AS blocking_pids,
    l.locktype, l.mode,
    CASE WHEN l.relation IS NOT NULL THEN n.nspname || '.' || c.relname END AS relation,
    CASE WHEN a.state_change IS NOT NULL THEN EXTRACT(EPOCH FROM (clock_timestamp() - a.state_change))::double precision END AS wait_seconds
  FROM pg_locks l
  LEFT JOIN pg_class c ON c.oid = l.relation
  LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_activity a ON a.pid = l.pid
  WHERE NOT l.granted
  ORDER BY l.pid, l.locktype, l.mode`

/** Relation OIDs only resolve within their own database, so read stats from the database the lesson sessions use. */
async function monitorDatabase(statuses: SessionStatus[]): Promise<string> {
  const sessionDatabase = statuses.find(session => session.id === 'A' && session.connected)?.database
    ?? statuses.find(session => session.id === 'B' && session.connected)?.database
  if (sessionDatabase) return sessionDatabase
  return await withAdmin('postgres', async client =>
    (await client.query<{ exists: boolean }>("SELECT exists (SELECT 1 FROM pg_database WHERE datname = 'library') AS exists")).rows[0].exists ? 'library' : 'postgres')
}

async function readMonitor(manager: SessionManager): Promise<MonitorResponse> {
  const statuses = manager.list()
  const byPid = new Map(statuses.filter(session => session.connected && session.backendPid !== null).map(session => [session.backendPid as number, session]))
  const database = await monitorDatabase(statuses)
  return await withAdmin(database, async (client: Client) => {
    const activities = (await client.query<ActivityRow>(activitySql)).rows
    const waits = (await client.query<LockWaitRow>(lockWaitSql)).rows
    const backends: MonitorBackend[] = activities.map(row => {
      const session = byPid.get(row.pid)
      return {
        pid: row.pid,
        sessionId: session?.id ?? null,
        usename: row.usename,
        datname: row.datname,
        state: row.state,
        xactAgeSeconds: row.xact_age_seconds,
        stateAgeSeconds: row.state_age_seconds,
        waitEventType: row.wait_event_type,
        waitEvent: row.wait_event,
        query: row.query,
        transactionStatus: session?.transactionStatus ?? null,
        busy: session?.busy ?? null,
      }
    })
    const lockWaits: MonitorLockWait[] = waits.map(row => ({
      blockedPid: row.blocked_pid,
      blockedSessionId: byPid.get(row.blocked_pid)?.id ?? null,
      blockingPids: row.blocking_pids,
      blockingSessionIds: row.blocking_pids.map(pid => byPid.get(pid)?.id ?? null),
      locktype: row.locktype,
      mode: row.mode,
      relation: row.relation,
      waitSeconds: row.wait_seconds,
    }))
    return { database, updatedAt: new Date().toISOString(), backends, lockWaits }
  })
}

export function monitorRoutes(manager: SessionManager) {
  const routes = new Hono()
  routes.get('/', async c => c.json(await readMonitor(manager)))
  return routes
}
