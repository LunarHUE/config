import { describe, expect, test } from 'bun:test'
import { DEFAULT_MODE, resolveMode } from '../src/mode'

describe('resolveMode', () => {
  test('the option wins over both env vars', () => {
    const env = { APP_ENV: 'staging', NODE_ENV: 'production' }
    expect(resolveMode('test', env)).toBe('test')
  })

  test('APP_ENV wins over NODE_ENV', () => {
    const env = { APP_ENV: 'staging', NODE_ENV: 'production' }
    expect(resolveMode(undefined, env)).toBe('staging')
  })

  test('NODE_ENV is used when APP_ENV is unset', () => {
    expect(resolveMode(undefined, { NODE_ENV: 'production' })).toBe('production')
  })

  test('falls back to development when nothing is set', () => {
    expect(resolveMode(undefined, {})).toBe(DEFAULT_MODE)
    expect(DEFAULT_MODE).toBe('development')
  })

  test('an empty APP_ENV falls through to NODE_ENV', () => {
    const env = { APP_ENV: '', NODE_ENV: 'production' }
    expect(resolveMode(undefined, env)).toBe('production')
  })

  test('whitespace is trimmed and blank values are ignored', () => {
    expect(resolveMode('  staging  ', {})).toBe('staging')
    expect(resolveMode(undefined, { APP_ENV: '   ', NODE_ENV: 'production' })).toBe('production')
  })

  test('reads process.env when no env argument is given', () => {
    const before = process.env.APP_ENV
    try {
      process.env.APP_ENV = 'from-process-env'
      expect(resolveMode(undefined)).toBe('from-process-env')
    } finally {
      if (before === undefined) delete process.env.APP_ENV
      else process.env.APP_ENV = before
    }
  })
})
