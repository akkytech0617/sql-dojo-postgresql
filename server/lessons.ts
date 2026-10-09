import { Client } from 'pg'
import { chapters as defaultChapters } from '../lessons/index.js'
import type { Chapter, CheckRequest, CheckResponse, ResetResponse, Step } from '../src/shared/lessons.js'
import type { SessionManager } from './sessions.js'
import { config } from './config.js'
import { ensureLearnerRole } from './learner.js'
import { expandLessonSql, splitStatements } from './lesson-sql.js'
const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export async function withAdmin<T>(database: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ host: config.host, port: config.port, ...config.admin, database, connectionTimeoutMillis: 5000, application_name: 'sql-dojo-check' })
  client.on('error', () => undefined)
  try { await client.connect(); return await run(client) } finally { await client.end().catch(() => undefined) }
}
/** Learner-controlled SQL (replay, free practice) runs as the non-superuser learner account. */
export async function withLearner<T>(database: string, run: (client: Client) => Promise<T>): Promise<T> {
  await ensureLearnerRole()
  const client = new Client({ host: config.host, port: config.port, ...config.learner, database, connectionTimeoutMillis: 5000, application_name: 'sql-dojo-check' })
  client.on('error', () => undefined)
  try { await client.connect(); return await run(client) } finally { await client.end().catch(() => undefined) }
}
function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]))
  return value
}
function rowsKey(rows: Record<string, unknown>[], ordered: boolean): string {
  const items = rows.map(row => JSON.stringify(normalize(row)))
  return JSON.stringify(ordered ? items : items.sort())
}
export class LessonEngine {
  resetting = false
  constructor(private readonly manager: SessionManager, readonly chapters: Chapter[] = defaultChapters) {}
  step(id: string): Step | undefined { return this.chapters.flatMap(chapter => chapter.steps).find(step => step.id === id) }
  async check(input: CheckRequest): Promise<CheckResponse> {
    const step = this.step(input.stepId)
    if (!step) throw new Error('ステップが見つかりません。')
    let passed = false
    const check = step.check
    if (check.type === 'manual') passed = true
    else if (check.type === 'script') passed = !!step.script?.length && input.scriptCompleted?.length === step.script.length && input.scriptCompleted.every(Boolean)
    else if (check.type === 'error-code') passed = input.lastError?.code === check.code
    else {
      try {
        passed = await withAdmin(check.database ?? step.database ?? 'library', async client => {
          await client.query('BEGIN READ ONLY')
          try {
            await client.query("SET LOCAL statement_timeout = '10s'")
            const result = await client.query(check.type === 'sql' ? check.sql : check.expectedSql)
            if (check.type === 'sql') return result.rows[0]?.[result.fields[0]?.name] === true
            const actual = input.lastResult
            return !!actual && !input.lastError && !actual.truncated &&
              result.rows.length <= 1000 &&
              JSON.stringify(actual.fields.map(field => field.name)) === JSON.stringify(result.fields.map(field => field.name)) &&
              rowsKey(actual.rows, !!check.ordered) === rowsKey(result.rows, !!check.ordered)
          } finally { await client.query('ROLLBACK') }
        })
      } catch { passed = false }
    }
    return { passed, message: passed ? '正解です！次のステップへ進みましょう。' : 'まだ条件を満たしていません。実行結果とヒントを確認してください。' }
  }
  async reset(toChapter = 0): Promise<ResetResponse> {
    if (!Number.isInteger(toChapter) || toChapter < 0 || toChapter > 13) throw new Error('章番号は 0〜13 を指定してください。')
    if (this.resetting) throw new Error('リセットを実行中です。')
    this.resetting = true
    const replayedSteps: string[] = []
    try {
      await Promise.all(this.manager.list().filter(session => session.busy).map(session => this.manager.cancel(session.id)))
      for (let i = 0; this.manager.list().some(session => session.busy); i++) {
        if (i > 100) throw new Error('実行中の SQL が終了しません。')
        await sleep(50)
      }
      await this.manager.close()
      await withAdmin('postgres', async client => {
        await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='library' AND pid<>pg_backend_pid()")
        await client.query('DROP DATABASE IF EXISTS library WITH (FORCE)')
        await client.query('DROP DATABASE IF EXISTS library_scratch WITH (FORCE)')
        const roles = (await client.query<{ rolname: string }>("SELECT rolname FROM pg_roles WHERE starts_with(rolname,'lib_') ORDER BY rolname")).rows
        if (roles.length) {
          await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE starts_with(usename,'lib_') AND pid<>pg_backend_pid()")
          const databases = (await client.query<{ datname: string }>('SELECT datname FROM pg_database WHERE datallowconn ORDER BY datname')).rows
          for (const { datname } of databases) await withAdmin(datname, async db => {
            for (const { rolname } of roles) {
              // Objects left by a lesson role stay usable: they move to the learner account that owns the dojo.
              await db.query(`REASSIGN OWNED BY ${identifier(rolname)} TO ${identifier(config.learner.user)}`)
              await db.query(`DROP OWNED BY ${identifier(rolname)}`)
            }
          })
          for (const { rolname } of roles) await client.query(`DROP ROLE ${identifier(rolname)}`)
        }
      })
      for (const id of ['admin', 'A', 'B']) await this.manager.connect(id, config.learner)
      for (const chapter of this.chapters.filter(chapter => chapter.id < toChapter).sort((a, b) => a.id - b.id)) {
        for (const step of chapter.steps) {
          if ((step.session === 'AB' || step.check.type === 'error-code') && step.replay === undefined) throw new Error(`${step.id}: AB/エラーステップには replay が必要です。`)
          const sql = await expandLessonSql(step.replay ?? step.solution)
          // Replay as the learner so replayed objects are learner-owned, exactly like the solutions.
          if (sql.trim()) await withLearner(step.replayDatabase ?? step.database ?? 'library', async client => {
            for (const statement of splitStatements(sql)) await client.query(statement)
          })
          replayedSteps.push(step.id)
        }
      }
      const exists = await withAdmin('postgres', async client => (await client.query("SELECT 1 FROM pg_database WHERE datname='library'")).rowCount !== 0)
      if (exists) for (const id of ['A', 'B']) await this.manager.connect(id, { ...config.learner, database: 'library' })
      return { toChapter, replayedSteps, message: `${toChapter} 章の開始状態に戻しました。` }
    } finally { this.resetting = false }
  }
}
