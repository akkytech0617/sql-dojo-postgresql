import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { config } from '../server/config.js'
import { SessionManager } from '../server/sessions.js'
import type { MonitorResponse } from '../src/shared/monitor.js'
import type { QueryResponse } from '../src/shared/types.js'

const manager = new SessionManager()
const app = createApp(manager)
const host = `127.0.0.1:${config.apiPort}`

function post(path: string, body: unknown) {
  return app.request(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Host: host }, body: JSON.stringify(body) })
}
async function query(id: string, sql: string): Promise<QueryResponse> {
  const response = await post(`/sessions/${id}/query`, { sql })
  expect(response.status).toBe(200)
  return await response.json() as QueryResponse
}
async function monitor(): Promise<MonitorResponse> {
  const response = await app.request('/api/monitor', { headers: { Host: host } })
  expect(response.status).toBe(200)
  return await response.json() as MonitorResponse
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

afterAll(async () => { await manager.close() })

describe('lock monitor API', () => {
  it('reports the blocked/blocking pair while a row lock is held, then clears it after release', async () => {
    // Sessions stay on the always-present postgres database so this test is independent of lesson state.
    expect((await post('/sessions/A/connect', config.learner)).status).toBe(200)
    expect((await post('/sessions/B/connect', config.learner)).status).toBe(200)
    await query('A', `CREATE TABLE IF NOT EXISTS public.monitor_demo (id integer PRIMARY KEY, note text NOT NULL);
INSERT INTO public.monitor_demo (id, note) VALUES (1, 'x') ON CONFLICT (id) DO NOTHING;`)

    // A opens a transaction and holds the row lock.
    expect((await query('A', "BEGIN; UPDATE public.monitor_demo SET note = 'a' WHERE id = 1;")).error).toBeUndefined()
    const pidA = manager.status('A').backendPid
    const pidB = manager.status('B').backendPid
    expect(pidA).not.toBeNull()
    expect(pidB).not.toBeNull()

    // B blocks on the same row.
    const blocked = query('B', "UPDATE public.monitor_demo SET note = 'b' WHERE id = 1;")
    await sleep(700)

    const state = await monitor()
    const pair = state.lockWaits.find(wait => wait.blockedPid === pidB && wait.blockingPids.includes(pidA!))
    expect(pair, JSON.stringify(state.lockWaits)).toBeDefined()
    expect(pair!.mode).toBeTruthy()
    // Lock wait rows are mapped to the app session ids through the SessionManager.
    expect(pair!.blockedSessionId).toBe('B')
    expect(pair!.blockingSessionIds).toContain('A')
    expect(pair!.relation === null || pair!.relation === 'public.monitor_demo').toBe(true)

    // A is idle in transaction and visible as the lock holder; B waits on a lock.
    const backendA = state.backends.find(backend => backend.pid === pidA)
    const backendB = state.backends.find(backend => backend.pid === pidB)
    expect(backendA?.sessionId).toBe('A')
    expect(backendA?.state).toBe('idle in transaction')
    expect(backendA?.transactionStatus).toBe('transaction')
    expect(backendA?.xactAgeSeconds).toBeGreaterThanOrEqual(0)
    expect(backendB?.sessionId).toBe('B')
    expect(backendB?.waitEventType).toBe('Lock')

    // Releasing the lock lets B finish and the monitor shows no more waits.
    expect((await query('A', 'ROLLBACK;')).error).toBeUndefined()
    expect((await blocked).error).toBeUndefined()
    const after = await monitor()
    expect(after.lockWaits.filter(wait => wait.blockedPid === pidB)).toHaveLength(0)

    expect((await query('A', 'DROP TABLE public.monitor_demo;')).error).toBeUndefined()
  })
})
