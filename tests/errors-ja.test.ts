import { describe, expect, it } from 'vitest'
import { explainSqlState, serializeSqlError } from '../server/errors-ja.js'
const requiredCodes = [
  '23505', '23503', '23502', '23514', '22P02', '22001', '22003', '42P01', '42703',
  '42P07', '42601', '42501', '42883', '3D000', '42P04', '40P01', '40001', '25P02',
  '55P03', '57014', '28P01', '28000', '3F000', '0A000', '2BP01', '55006', '42710',
  '42804', '21000', '23P01',
]
describe('Japanese SQLSTATE explanations', () => {
  it.each(requiredCodes)('has a specific explanation and tip for %s', code => {
    const explanation = explainSqlState(code)
    expect(explanation.title).not.toBe('データベースエラー')
    expect(explanation.title).not.toBe(explainSqlState(`${code.slice(0, 2)}ZZZ`).title)
    expect(explanation.explanation.length).toBeGreaterThan(0)
    expect(explanation.tip.length).toBeGreaterThan(0)
  })
  it('falls back by SQLSTATE class, then to a generic explanation', () => {
    expect(explainSqlState('22999').title).toBe('データのエラー')
    expect(explainSqlState('ZZ999').title).toBe('データベースエラー')
  })
  it('preserves PostgreSQL detail, hint, position, where and severity', () => {
    const error = Object.assign(new Error('syntax error'), { code: '42601', detail: 'detail', hint: 'hint', position: '7', where: 'where', severity: 'ERROR', password: 'never-return-this' })
    expect(serializeSqlError(error)).toEqual({ code: '42601', message: 'syntax error', detail: 'detail', hint: 'hint', position: '7', where: 'where', severity: 'ERROR', ja: explainSqlState('42601') })
    expect(serializeSqlError(null).code).toBe('XX000')
  })
})
