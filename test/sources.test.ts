import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { env, file } from '../src/sources'

describe('sources', () => {
  test('env records the var name and schema', () => {
    const schema = z.string()
    const source = env('DATABASE_URL', schema)
    expect(source).toEqual({ kind: 'env', path: 'DATABASE_URL', schema })
  })

  test('file records the dotted path and schema', () => {
    const schema = z.number()
    const source = file('logging.level', schema)
    expect(source).toEqual({ kind: 'file', path: 'logging.level', schema })
  })
})
