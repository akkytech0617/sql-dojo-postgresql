import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Chapter } from '../../src/shared/lessons.js'
export function readBootstrap(path: string | undefined): string | undefined {
  return path ? readFileSync(resolve(path), 'utf8') : undefined
}
/**
 * Appends a replay-only step to the last chapter before `first`. Both the initial reset(first)
 * and every later reset(c+1) replay it at the same point, so solve and replay fingerprints agree.
 */
export function withBootstrap(chapters: Chapter[], first: number, sql: string | undefined): Chapter[] {
  if (sql === undefined) return chapters
  if (first < 2) throw new Error('LESSON_BOOTSTRAP requires a range starting at chapter 2 or later (library must exist).')
  const host = first - 1
  if (!chapters.some(chapter => chapter.id === host)) throw new Error(`LESSON_BOOTSTRAP: chapter ${host} not found`)
  return chapters.map(chapter => chapter.id !== host ? chapter : {
    ...chapter,
    steps: [...chapter.steps, {
      id: `ch${String(host).padStart(2, '0')}-99`, title: 'test bootstrap', explanation: '', task: '', hints: [],
      session: 'A', database: 'library', solution: '', replay: sql, check: { type: 'manual' },
    }],
  })
}
