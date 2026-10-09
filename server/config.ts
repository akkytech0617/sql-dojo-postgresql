import 'dotenv/config'
import { z } from 'zod'
const env = z.object({
  PGHOST: z.string().default('127.0.0.1'),
  PGPORT: z.coerce.number().int().min(1).max(65535).default(5433),
  POSTGRES_USER: z.string().default('dojo_admin'),
  POSTGRES_PASSWORD: z.string().default('dojo_admin_pw'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(5173),
  DOJO_LEARNER_PASSWORD: z.string().default('dojo_learner_pw'),
}).parse(process.env)
/** Lessons hardcode this name in SQL and text, so it is a fixed constant, not an env var. */
export const LEARNER_ROLE = 'dojo_learner'
export const config = {
  host: env.PGHOST, port: env.PGPORT,
  admin: { user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD, database: 'postgres' },
  learner: { user: LEARNER_ROLE, password: env.DOJO_LEARNER_PASSWORD, database: 'postgres' },
  apiPort: env.API_PORT, webPort: env.WEB_PORT,
}
