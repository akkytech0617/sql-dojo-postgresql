import { readFile } from 'node:fs/promises'
import { parse } from 'csv-parse/sync'
const dataRoot = new URL('../lessons/data/', import.meta.url)
const includes = new Set(['schema.sql', 'seed.sql', 'reservations.sql'])
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
export async function csvSql(file: string): Promise<string> {
  if (file !== 'authors.csv') throw new Error('許可されていない CSV です。')
  const rows = parse(await readFile(new URL(file, dataRoot), 'utf8'), { columns: true, skip_empty_lines: true }) as Record<string, string>[]
  if (!rows.length || rows.some(row => Object.keys(row).join(',') !== 'author_id,name,birth_year' || !/^\d+$/.test(row.author_id) || !/^\d+$/.test(row.birth_year))) {
    throw new Error('CSV の列・値が不正です。')
  }
  return `INSERT INTO public.authors(author_id,name,birth_year) VALUES ${rows.map(row =>
    `(${quote(row.author_id)},${quote(row.name)},${quote(row.birth_year)})`).join(',')} ON CONFLICT DO NOTHING;`
}
export async function expandLessonSql(sql: string): Promise<string> {
  const lines = await Promise.all(sql.split('\n').map(async line => {
    const match = /^\s*-- @(include|csv) ([\w.-]+)\s*$/.exec(line)
    if (!match) return line
    if (match[1] === 'csv') return csvSql(match[2])
    if (!includes.has(match[2])) throw new Error('許可されていない SQL ファイルです。')
    return readFile(new URL(match[2], dataRoot), 'utf8')
  }))
  return lines.join('\n')
}
/** Split only top-level semicolons, preserving dollar bodies, quoted identifiers and comments. */
export function splitStatements(sql: string): string[] {
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
