import { Client } from 'pg'
import { config } from './config.js'
/** The learner role is a plain login: it may create databases/roles for the lessons, nothing else. */
let provisioning: Promise<void> | null = null
async function warnLegacyLibrary(client: Client): Promise<void> {
  const owner = (await client.query<{ owner: string }>(
    "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = 'library'")).rows[0]?.owner
  if (owner && owner !== config.learner.user) {
    console.warn(`library データベースの所有者が ${config.learner.user} ではなく ${owner} です（更新前の状態）。`
      + '画面の「章の最初からやり直す」または「全部リセット」を実行すると、学習用の作業アカウントで作り直されます。')
  }
}
/** Idempotent: pg cannot parameterize utility statements, so identifiers and the password are escaped client-side. */
export async function provisionLearnerRole(): Promise<void> {
  const client = new Client({ host: config.host, port: config.port, ...config.admin, connectionTimeoutMillis: 5000, application_name: 'sql-dojo-bootstrap' })
  client.on('error', () => undefined)
  const role = client.escapeIdentifier(config.learner.user)
  try {
    await client.connect()
    if ((await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [config.learner.user])).rowCount === 0) {
      await client.query(`CREATE ROLE ${role}`)
    }
    await client.query(`ALTER ROLE ${role} LOGIN NOSUPERUSER CREATEDB CREATEROLE NOBYPASSRLS PASSWORD ${client.escapeLiteral(config.learner.password)}`)
    await client.query(`GRANT pg_monitor TO ${role}`)
    // ch9 fixes the deadlock victim with SET deadlock_timeout; PostgreSQL 18 grants that one parameter
    // instead of making the learner a superuser.
    await client.query(`GRANT SET ON PARAMETER deadlock_timeout TO ${role}`)
    // Tests and free practice create scratch tables in the postgres database.
    await client.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${role}`)
    await warnLegacyLibrary(client)
  } finally { await client.end().catch(() => undefined) }
}
/** Runs at most once per process; a failure clears the memo so the next request retries. */
export function ensureLearnerRole(): Promise<void> {
  provisioning ??= provisionLearnerRole().catch(error => { provisioning = null; throw error })
  return provisioning
}
