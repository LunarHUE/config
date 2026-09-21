import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { DEFINITION, createLazyConfig, type Config, type InferConfig } from '../src/proxy'
import { env, file } from '../src/sources'
import type { LoadResult } from '../src/types'

const definition = {
  server: { databaseUrl: env('DATABASE_URL', z.string()) },
  client: { level: file('logging.level', z.string()) },
}

type Definition = typeof definition

type Result = LoadResult<Definition['server'], Definition['client']>

function fakeLoader(): { load: () => Result; calls: () => number } {
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
