import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { DEFINITION, createLazyConfig, type Config, type InferConfig } from '../src/proxy'
import { env, file } from '../src/sources'
import type { EnvMap, LoadResult } from '../src/types'

const definition = {
  server: { databaseUrl: env('DATABASE_URL', z.string()) },
  client: { level: file('logging.level', z.string()) },
}

type Definition = typeof definition

type Result = LoadResult<Definition['server'], Definition['client']>

function fakeLoader(overrides: () => Partial<Result> = () => ({})): {
  load: () => Result
  calls: () => number
} {
  let calls = 0
  return {
    load: () => {
      calls += 1
      return {
        server: { databaseUrl: 'postgres://localhost/app' },
        client: { level: 'debug' },
        mode: 'test',
        root: '/app',
        dirs: ['/app'],
        files: [],
        envWritten: [],
        ...overrides(),
      }
    },
    calls: () => calls,
  }
}

describe('createLazyConfig', () => {
  test('does not load until a section is read', () => {
    const loader = fakeLoader()
    createLazyConfig(definition, loader.load)
    expect(loader.calls()).toBe(0)
  })

  test('loads once however many times the sections are read', () => {
    const loader = fakeLoader()
    const config = createLazyConfig(definition, loader.load)

    expect(config.server.databaseUrl).toBe('postgres://localhost/app')
    expect(config.client.level).toBe('debug')
    expect(config.server.databaseUrl).toBe('postgres://localhost/app')
    expect(config.client.level).toBe('debug')

    expect(loader.calls()).toBe(1)
  })

  test('the definition comes back out through DEFINITION', () => {
    const loader = fakeLoader()
    const config = createLazyConfig(definition, loader.load)

    expect(config[DEFINITION]).toBe(definition)
    expect(loader.calls()).toBe(0)
  })

  test('a failing load throws on every access and is not cached', () => {
    let calls = 0
    const config = createLazyConfig(definition, () => {
      calls += 1
      throw new Error('boom')
    })

    expect(() => config.server).toThrow('boom')
    expect(() => config.client).toThrow('boom')
    expect(calls).toBe(2)
  })

  test('reload clears the cache so the next read loads again', () => {
    const loader = fakeLoader()
    const config = createLazyConfig(definition, loader.load)

    expect(config.client.level).toBe('debug')
    config.reload()
    expect(config.client.level).toBe('debug')

    expect(loader.calls()).toBe(2)
  })

  test('reload deletes a key the loader wrote into processEnv', () => {
    const processEnv: EnvMap = {}
    const loader = fakeLoader(() => {
      processEnv.WROTE_THIS = 'from-file'
      return { envWritten: ['WROTE_THIS'] }
    })
    const config = createLazyConfig(definition, loader.load, processEnv)

    expect(config.server.databaseUrl).toBe('postgres://localhost/app')
    expect(processEnv.WROTE_THIS).toBe('from-file')

    config.reload()
    expect('WROTE_THIS' in processEnv).toBe(false)
  })

  test('reload leaves a key the app changed since the load alone', () => {
    const processEnv: EnvMap = {}
    const loader = fakeLoader(() => {
      processEnv.WROTE_THIS = 'from-file'
      return { envWritten: ['WROTE_THIS'] }
    })
    const config = createLazyConfig(definition, loader.load, processEnv)

    expect(config.server.databaseUrl).toBe('postgres://localhost/app')
    processEnv.WROTE_THIS = 'changed-by-the-app'

    config.reload()
    expect(processEnv.WROTE_THIS).toBe('changed-by-the-app')
  })

  test('reload before any load does nothing', () => {
    const processEnv: EnvMap = { UNTOUCHED: 'yes' }
    const loader = fakeLoader()
    const config = createLazyConfig(definition, loader.load, processEnv)

    config.reload()

    expect(loader.calls()).toBe(0)
    expect(processEnv.UNTOUCHED).toBe('yes')
  })

  test('the sections carry the schema output types', () => {
    const loader = fakeLoader()
    const config = createLazyConfig(definition, loader.load)

    expectTypeOf(config.server.databaseUrl).toEqualTypeOf<string>()
    expectTypeOf(config.client.level).toEqualTypeOf<string>()
    expectTypeOf<InferConfig<Config<Definition['server'], Definition['client']>>>().toEqualTypeOf<{
      server: { databaseUrl: string }
      client: { level: string }
    }>()
  })
})
