import { describe, expect, test } from 'bun:test'
import { getPath, merge } from '../src/merge'

describe('merge', () => {
  test('recurses into nested objects', () => {
    const base = { logging: { level: 'info', file: 'app.log' }, port: 3000 }
    const override = { logging: { level: 'debug' } }
    expect(merge(base, override)).toEqual({
      logging: { level: 'debug', file: 'app.log' },
      port: 3000,
    })
  })

  test('replaces arrays wholesale', () => {
    const base = { hosts: ['a', 'b', 'c'] }
    const override = { hosts: ['z'] }
    expect(merge(base, override)).toEqual({ hosts: ['z'] })
  })

  test('replaces primitives', () => {
    expect(merge({ port: 3000 }, { port: 8080 })).toEqual({ port: 8080 })
    expect(merge('a', 'b')).toBe('b')
  })

  test('an explicit null overrides', () => {
    expect(merge({ dsn: 'https://sentry.example' }, { dsn: null })).toEqual({ dsn: null })
  })

  test('keeps the lower value when the key is absent above', () => {
    expect(merge({ port: 3000, host: 'localhost' }, { port: 8080 })).toEqual({
      port: 8080,
      host: 'localhost',
    })
  })

  test('does not mutate either input', () => {
    const base = { logging: { level: 'info' }, hosts: ['a'] }
    const override = { logging: { level: 'debug' }, hosts: ['b'] }
    const result = merge(base, override) as { logging: { level: string }; hosts: string[] }

    expect(base).toEqual({ logging: { level: 'info' }, hosts: ['a'] })
    expect(override).toEqual({ logging: { level: 'debug' }, hosts: ['b'] })

    result.logging.level = 'trace'
    result.hosts.push('c')
    expect(base.logging.level).toBe('info')
    expect(override.logging.level).toBe('debug')
    expect(override.hosts).toEqual(['b'])
  })

  test('an object can be replaced by a primitive', () => {
    expect(merge({ logging: { level: 'info' } }, { logging: false })).toEqual({ logging: false })
  })

  test('a primitive can be replaced by an object', () => {
    expect(merge({ logging: false }, { logging: { level: 'info' } })).toEqual({
      logging: { level: 'info' },
    })
  })
})

describe('getPath', () => {
  const doc = {
    logging: { level: 'debug', sinks: ['stdout'] },
    sentry: { dsn: null },
    port: 3000,
  }

  test('reads a nested value', () => {
    expect(getPath(doc, 'logging.level')).toBe('debug')
  })

  test('returns undefined for a missing segment', () => {
    expect(getPath(doc, 'logging.format')).toBeUndefined()
    expect(getPath(doc, 'redis.url')).toBeUndefined()
  })

  test('returns undefined when a segment walks into a non-object', () => {
    expect(getPath(doc, 'port.value')).toBeUndefined()
    expect(getPath(doc, 'logging.sinks.0')).toBeUndefined()
    expect(getPath(doc, 'logging.level.length')).toBeUndefined()
  })

  test('returns a stored null as null, not undefined', () => {
    expect(getPath(doc, 'sentry.dsn')).toBeNull()
  })

  test('an empty path is the whole document', () => {
    expect(getPath(doc, '')).toBe(doc)
  })
})
