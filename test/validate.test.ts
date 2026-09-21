import { type } from 'arktype'
import { describe, expect, test } from 'vitest'
import * as v from 'valibot'
import { z } from 'zod'
import { ConfigError } from '../src/errors'
import { env, file } from '../src/sources'
import type { ConfigDefinition } from '../src/types'
import { validate } from '../src/validate'

const defaults = { emptyStringAsUndefined: true }

function expectConfigError(run: () => unknown): ConfigError {
  try {
    run()
  } catch (error) {
    if (error instanceof ConfigError) return error
    throw error
  }
  throw new Error('expected a ConfigError')
}

describe('validate', () => {
  test('returns the validated values for both sections', () => {
    const result = validate(
      {
        server: { databaseUrl: env('DATABASE_URL', z.string()) },
        client: { level: file('logging.level', z.string()) },
      },
      { DATABASE_URL: 'postgres://localhost/app' },
      { logging: { level: 'debug' } },
      defaults,
    )

    expect(result.server.databaseUrl).toBe('postgres://localhost/app')
    expect(result.client.level).toBe('debug')
  })

  test('collects failures from both sections into one error', () => {
    const error = expectConfigError(() =>
      validate(
        {
          server: {
            databaseUrl: env('DATABASE_URL', z.string()),
            secret: env('SECRET', z.string()),
          },
          client: { level: file('logging.level', z.string()) },
        },
        {},
        {},
        defaults,
      ),
    )

    expect(error.issues).toHaveLength(3)
    expect(error.issues.map((i) => `${i.section}.${i.key}`)).toEqual([
      'server.databaseUrl',
      'server.secret',
      'client.level',
    ])
    expect(error.issues[0]).toMatchObject({ source: 'env', path: 'DATABASE_URL' })
    expect(error.issues[2]).toMatchObject({ source: 'file', path: 'logging.level' })
  })

  test('the message lists every issue under one heading', () => {
    const error = expectConfigError(() =>
      validate({ server: { databaseUrl: env('DATABASE_URL', z.string()) } }, {}, {}, defaults),
    )

    const [heading, line] = error.message.split('\n')
    expect(heading).toBe('Invalid config')
    expect(line).toMatch(/^ {2}server\.databaseUrl {2}\(env DATABASE_URL\) {2}\S/)
  })

  test('a nested issue path is appended to the key and the path', () => {
    const error = expectConfigError(() =>
      validate(
        { client: { auth: file('auth', z.object({ signInPath: z.string() })) } },
        {},
        { auth: {} },
        defaults,
      ),
    )

    expect(error.issues).toHaveLength(1)
    expect(error.issues[0]).toMatchObject({
      section: 'client',
      key: 'auth.signInPath',
      source: 'file',
      path: 'auth.signInPath',
    })
    expect(error.message).toContain('client.auth.signInPath  (file auth.signInPath)')
  })

  test('an empty env value becomes undefined by default', () => {
    const result = validate(
      { server: { region: env('REGION', z.string().optional()) } },
      { REGION: '' },
      {},
      defaults,
    )
    expect(result.server.region).toBeUndefined()

    const error = expectConfigError(() =>
      validate({ server: { region: env('REGION', z.string()) } }, { REGION: '' }, {}, defaults),
    )
    expect(error.issues[0]?.key).toBe('region')
  })

  test('emptyStringAsUndefined false keeps the empty string', () => {
    const result = validate(
      { server: { region: env('REGION', z.string()) } },
      { REGION: '' },
      {},
      { emptyStringAsUndefined: false },
    )
    expect(result.server.region).toBe('')
  })

  test('an empty file value is left alone', () => {
    const result = validate(
      { client: { label: file('ui.label', z.string()) } },
      {},
      { ui: { label: '' } },
      defaults,
    )
    expect(result.client.label).toBe('')
  })

  test('a schema default applies when the source has no value', () => {
    const result = validate(
      {
        server: { port: env('PORT', z.coerce.number().default(3000)) },
        client: { level: file('logging.level', z.string().default('info')) },
      },
      {},
      {},
      defaults,
    )

    expect(result.server.port).toBe(3000)
    expect(result.client.level).toBe('info')
  })

  test('a file source can return an object', () => {
    const result = validate(
      { client: { auth: file('auth', z.object({ signInPath: z.string() })) } },
      {},
      { auth: { signInPath: '/sign-in' } },
      defaults,
    )
    expect(result.client.auth).toEqual({ signInPath: '/sign-in' })
  })

  test('a nested section mixes env and file sources under one key', () => {
    const result = validate(
      {
        server: {
          telemetry: {
            endpoint: env('OTEL_ENDPOINT', z.string().optional()),
            serviceName: file('telemetry.serviceName', z.string()),
          },
        },
      },
      { OTEL_ENDPOINT: 'http://collector:4318' },
      { telemetry: { serviceName: 'api' } },
      defaults,
    )

    expect(result.server.telemetry).toEqual({
      endpoint: 'http://collector:4318',
      serviceName: 'api',
    })
    expect(result.server.telemetry.serviceName).toBe('api')
  })

  test('a failure inside a nested section reports the dotted key', () => {
    const error = expectConfigError(() =>
      validate(
        { server: { database: { pool: { max: env('POOL_MAX', z.string()) } } } },
        {},
        {},
        defaults,
      ),
    )

    expect(error.issues).toHaveLength(1)
    expect(error.issues[0]).toMatchObject({
      section: 'server',
      key: 'database.pool.max',
      source: 'env',
      path: 'POOL_MAX',
    })
  })

  test('a missing section is treated as empty', () => {
    const result = validate({}, {}, {}, defaults)
    expect(result.server).toEqual({})
    expect(result.client).toEqual({})
  })

  test('an async schema throws and names the key', () => {
    const asyncSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: async (value: unknown) => ({ value: value as string }),
      },
    }

    expect(() =>
      validate(
        { server: { slow: { kind: 'env', path: 'SLOW', schema: asyncSchema } } },
        {},
        {},
        defaults,
      ),
    ).toThrow(/Async schemas are not supported.*server\.slow/)
  })
})

describe('validator libraries agree on the same fixture', () => {
  const env_ = { PORT: '8080', API_URL: 'https://api.example.com' }
  const yaml = { logging: { level: 'debug' } }

  function check(definition: ConfigDefinition) {
    const result = validate(definition, env_, yaml, defaults)
    expect(result.server).toEqual({ port: 8080 })
    expect(result.client).toEqual({ apiUrl: 'https://api.example.com', level: 'debug' })
  }

  test('zod', () => {
    check({
      server: { port: env('PORT', z.coerce.number()) },
      client: {
        apiUrl: env('API_URL', z.url()),
        level: file('logging.level', z.string()),
      },
    })
  })

  test('arktype', () => {
    check({
      server: { port: env('PORT', type('string.numeric.parse')) },
      client: {
        apiUrl: env('API_URL', type('string.url')),
        level: file('logging.level', type('string')),
      },
    })
  })

  test('valibot', () => {
    check({
      server: { port: env('PORT', v.pipe(v.string(), v.transform(Number), v.number())) },
      client: {
        apiUrl: env('API_URL', v.pipe(v.string(), v.url())),
        level: file('logging.level', v.string()),
      },
    })
  })

  test('each library reports a failure the same way', () => {
    const broken = [
      { apiUrl: env('API_URL', z.url()) },
      { apiUrl: env('API_URL', type('string.url')) },
      { apiUrl: env('API_URL', v.pipe(v.string(), v.url())) },
    ]

    for (const client of broken) {
      const error = expectConfigError(() =>
        validate({ client }, { API_URL: 'not-a-url' }, {}, defaults),
      )
      expect(error.issues).toHaveLength(1)
      expect(error.issues[0]).toMatchObject({
        section: 'client',
        key: 'apiUrl',
        source: 'env',
        path: 'API_URL',
      })
      expect(error.issues[0]?.message.length).toBeGreaterThan(0)
    }
  })
})
