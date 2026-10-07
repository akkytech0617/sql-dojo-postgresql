import type { QueryResponse, QueryResult } from '../../shared/types.js'

/** Node of EXPLAIN (FORMAT JSON) output. Keys match PostgreSQL's JSON plan field names. */
export interface ExplainNode {
  'Node Type': string
  'Parent Relationship'?: string
  'Parallel Aware'?: boolean
  'Async Capable'?: boolean
  'Relation Name'?: string
  'Alias'?: string
  'Schema'?: string
  'Index Name'?: string
  'Strategy'?: string
  'Partial Mode'?: string
  'Startup Cost'?: number
  'Total Cost'?: number
  'Plan Rows'?: number
  'Plan Width'?: number
  'Actual Startup Time'?: number
  'Actual Total Time'?: number
  'Actual Rows'?: number
  'Actual Loops'?: number
  'Index Cond'?: string
  'Filter'?: string
  'Rows Removed by Filter'?: number
  'Rows Removed by Index Recheck'?: number
  'Recheck Cond'?: string
  'Hash Cond'?: string
  'Join Type'?: string
  'Join Filter'?: string
  'Sort Key'?: string[] | string
  'Sort Method'?: string
  'Sort Space Used'?: number
  'Sort Space Type'?: string
  'Group Key'?: string[]
  'Heap Fetches'?: number
  'Shared Hit Blocks'?: number
  'Shared Read Blocks'?: number
  'Shared Dirtied Blocks'?: number
  'Shared Written Blocks'?: number
  'Temp Read Blocks'?: number
  'Temp Written Blocks'?: number
  Plans?: ExplainNode[]
}

export interface ExplainDocument {
  Plan: ExplainNode
  'Planning Time'?: number
  'Execution Time'?: number
}

/** Japanese gloss for plan node types. Unknown types fall back to ''. */
export const nodeGloss: Record<string, string> = {
  'Seq Scan': '全件走査',
  'Index Scan': '索引走査',
  'Index Only Scan': '索引のみ走査',
  'Bitmap Heap Scan': 'ビットマップヒープ走査',
  'Bitmap Index Scan': 'ビットマップ索引走査',
  'Bitmap And': 'ビットマップAND',
  'Bitmap Or': 'ビットマップOR',
  'Nested Loop': 'ネステッドループ結合',
  'Merge Join': 'マージ結合',
  'Hash Join': 'ハッシュ結合',
  'Append': '分岐の統合',
  'Merge Append': '分岐のマージ統合',
  'Sort': 'ソート',
  'Incremental Sort': '漸進ソート',
  'Aggregate': '集約',
  'GroupAggregate': 'グループ集約',
  'HashAggregate': 'ハッシュ集約',
  'Gather': '並行ワーカーの集約',
  'Gather Merge': '並行ワーカーのマージ集約',
  'Hash': 'ハッシュ表の作成',
  'Materialize': '一時退避（物質化）',
  'Result': '結果の生成',
  'Limit': '行数制限',
  'Unique': '重複の除去',
  'LockRows': '行ロックの取得',
  'ModifyTable': '更新（INSERT/UPDATE/DELETE）',
  'Subquery Scan': 'サブクエリ走査',
  'CTE Scan': 'CTE走査',
  'Function Scan': '関数走査',
  'Values Scan': 'VALUES走査',
  'Table Function Scan': '表関数走査',
  'Recursive Union': '再帰UNION',
  'WindowAgg': 'ウィンドウ集約',
  'SetOp': '集合演算',
  'Foreign Scan': '外部表走査',
  'Sample Scan': 'サンプリング走査',
  'ProjectSet': '集合返却関数の評価',
  'Named Tuplestore Scan': '名前付きタプルストア走査',
}

/** Extracts the parsed plan document from an EXPLAIN (FORMAT JSON) QueryResult. */
export function parseExplainResult(result: QueryResult): ExplainDocument | null {
  const explain = result.fields.some(field => field.name === 'QUERY PLAN') ? result.rows[0]?.['QUERY PLAN'] : undefined
  if (!Array.isArray(explain)) return null
  const document = explain[0] as ExplainDocument | undefined
  return document?.Plan ? document : null
}

/** Rough row-count misestimate factor: >= 5 (or <= 0.2) on 50+ actual rows counts as a big miss worth flagging. */
export function misestimateFactor(node: ExplainNode): number | null {
  const estimated = node['Plan Rows']
  const actual = node['Actual Rows']
  if (estimated === undefined || actual === undefined || actual < 50) return null
  if (estimated === 0) return actual > 0 ? Infinity : null
  return actual / estimated
}

export function isBigMisestimate(node: ExplainNode): boolean {
  const factor = misestimateFactor(node)
  return factor !== null && (factor >= 5 || factor <= 0.2)
}

/** Total wall-clock contribution of a node: per-loop average times loop count. */
export function nodeTimeTotal(node: ExplainNode): number {
  const time = node['Actual Total Time']
  const loops = node['Actual Loops']
  if (time === undefined) return 0
  return time * (loops ?? 1)
}

/** Largest node time in the tree, used to scale the time bars. */
export function maxNodeTime(node: ExplainNode): number {
  const children = node.Plans ?? []
  return Math.max(nodeTimeTotal(node), ...children.map(maxNodeTime))
}

/**
 * Splits top-level statements only (dollar bodies, quoted strings and comments are preserved),
 * mirroring the server tokenizer so EXPLAIN never targets a truncated statement.
 */
function splitTopLevel(sql: string): string[] {
  const statements: string[] = []
  let start = 0, i = 0, blockDepth = 0
  let mode: 'normal' | 'single' | 'double' | 'line' | 'block' | 'dollar' = 'normal'
  let dollar = '', escapedString = false
  while (i < sql.length) {
    const ch = sql[i], next = sql[i + 1]
    if (mode === 'line') { if (ch === '\n') mode = 'normal'; i++; continue }
    if (mode === 'block') {
      if (ch === '/' && next === '*') { blockDepth++; i += 2; continue }
      if (ch === '*' && next === '/') { if (--blockDepth === 0) mode = 'normal'; i += 2; continue }
      i++; continue
    }
    if (mode === 'dollar') { if (sql.startsWith(dollar, i)) { mode = 'normal'; i += dollar.length } else i++; continue }
    if (mode === 'single' || mode === 'double') {
      const delimiter = mode === 'single' ? "'" : '"'
      if (mode === 'single' && escapedString && ch === '\\') { i += 2; continue }
      if (ch === delimiter) { if (next === delimiter) i += 2; else { mode = 'normal'; i++ } } else i++
      continue
    }
    if (ch === '-' && next === '-') { mode = 'line'; i += 2; continue }
    if (ch === '/' && next === '*') { mode = 'block'; blockDepth = 1; i += 2; continue }
    if (ch === "'") { escapedString = /(^|[^\w])E$/i.test(sql.slice(0, i)); mode = 'single'; i++; continue }
    if (ch === '"') { mode = 'double'; i++; continue }
    if (ch === '$') {
      const tag = /^\$(?:[a-zA-Z_]\w*)?\$/.exec(sql.slice(i))
      if (tag) { dollar = tag[0]; mode = 'dollar'; i += dollar.length; continue }
    }
    if (ch === ';') { const part = sql.slice(start, i).trim(); if (part) statements.push(part); start = i + 1 }
    i++
  }
  const rest = sql.slice(start).trim()
  if (rest) statements.push(rest)
  return statements
}

/** Strips a leading EXPLAIN and its options so the panel can add its own EXPLAIN wrapper. */
export function stripExplainWrapper(text: string): string {
  let rest = text
  for (;;) {
    const match = /^EXPLAIN\b\s*(\([^)]*\))?((?:\b(?:ANALYZE|ANALYSE|VERBOSE|COSTS|BUFFERS|TIMING|SUMMARY|SETTINGS|WAL|FORMAT\s+\w+)\b[\s,]*)*)/i.exec(rest)
    if (!match) return rest
    const next = rest.slice(match[0].length).trim()
    if (next === rest) return rest
    rest = next
  }
}

/** Keeps only the first statement; EXPLAIN applies to a single statement and later ones must not execute.
 *  Leading comments are stripped so the prefixed EXPLAIN cannot swallow the real statement. */
export function firstStatement(text: string): string {
  const statement = splitTopLevel(text)[0] ?? ''
  return stripExplainWrapper(statement.replace(/^(--[^\n]*\n?|\/\*[\s\S]*?\*\/|\s)+/, '').trim())
}

export function hasExtraStatements(text: string): boolean {
  return splitTopLevel(text).length > 1
}

/** Read-only statements execute safely under EXPLAIN ANALYZE; anything else may modify rows. */
export function isReadOnlyStatement(statement: string): boolean {
  return /^(SELECT|VALUES|TABLE)\b/i.test(statement)
}

/** SQL sent to the session: a plain EXPLAIN, or the ANALYZE-of-DML batch wrapped in BEGIN/ROLLBACK. */
export function explainRequest(statement: string, options: string, wrapInTransaction: boolean): string {
  return wrapInTransaction
    ? `BEGIN; EXPLAIN (${options}) ${statement}; ROLLBACK;`
    : `EXPLAIN (${options}) ${statement}`
}

/**
 * A wrapped batch that fails mid-way leaves the session inside an aborted transaction: when an
 * earlier statement of a multi-statement batch errors, the trailing ROLLBACK never runs. The
 * caller must send a cleanup ROLLBACK (still surfacing the original error) or the session stays
 * "idle in transaction (aborted)" and rejects every further statement with 25P02.
 */
export function needsCleanupRollback(wrapped: boolean, response: QueryResponse): boolean {
  return wrapped && !!response.error
}

/**
 * Suggests editor content from a step solution: the last EXPLAIN-able statement,
 * with a leading EXPLAIN (...) wrapper stripped so the panel re-adds its own options.
 */
export function prefillFromSolution(solution: string | undefined): string {
  if (!solution) return ''
  const statements = splitTopLevel(solution)
  for (let index = statements.length - 1; index >= 0; index -= 1) {
    const body = stripExplainWrapper(statements[index].replace(/^(--[^\n]*\n?|\/\*[\s\S]*?\*\/|\s)+/, '').trim())
    if (/^(SELECT|WITH|TABLE|VALUES)\b/i.test(body)) return body
  }
  return ''
}
