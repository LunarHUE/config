import { afterEach, describe, expect, test } from 'vitest'
import { z } from 'zod'
import { env as bindings } from 'cloudflare:workers'
import { ConfigError } from '../src/errors'
import { APP_CONFIG_YAML_GLOBAL, createBakedConfig } from '../src/baked'
import { defineConfig, env, field } from '../src/worker'

const globals = globalThis as Record<string, unknown>

afterEach(() => {
  delete globals[APP_CONFIG_YAML_GLOBAL]
  for (const key of Object.keys(bindings)) delete bindings[key]
})

describe('createBakedConfig', () => {
  test('resolves yaml and env sides and caches the result', () => {
    let reads = 0
    const config = createBakedConfig(
      {
        server: {
          port: field(z.number().int(), { env: 'PORT' }),
          paths: { nixosDir: field(z.string()) },
          secret: env('SECRET', z.string()),
        },
        client: { app: { name: field(z.string()) } },
      },
      {
        yaml: () => {
          reads += 1
          return { port: 3000, paths: { nixosDir: '/etc/nixos' }, app: { name: 'shop' } }
        },
        env: () => ({ PORT: '8080', SECRET: 's3cret' }),
      },
    )

    expect(config.server).toEqual({ port: 8080, paths: { nixosDir: '/etc/nixos' }, secret: 's3cret' })
    expect(config.client).toEqual({ app: { name: 'shop' } })
    expect(reads).toBe(1)
    config.reload()
    expect(config.server.port).toBe(8080)
    expect(reads).toBe(1)
  })

  test('a non-string binding passes through to the schema', () => {
    const kv = { get: () => 'x' }
    const config = createBakedConfig(
      { server: { store: env('KV', z.custom<typeof kv>((v) => v === kv)) } },
      { yaml: () => ({}), env: () => ({ KV: kv }) },
    )
    expect(config.server.store).toBe(kv)
  })

  test('a failed load is not cached', () => {
    const values: Record<string, unknown> = {}
    const config = createBakedConfig(
      { server: { secret: env('SECRET', z.string()) } },
      { yaml: () => ({}), env: () => values },
    )

    expect(() => config.server).toThrow(ConfigError)
    values.SECRET = 'now'
    expect(config.server.secret).toBe('now')
  })
})

describe('the worker entry', () => {
  test('reads yaml from the baked global and env from the bindings', () => {
    globals[APP_CONFIG_YAML_GLOBAL] = { api: { port: 3000 }, app: { name: 'shop' } }
    bindings.API_PORT = '9000'
    bindings.DATABASE_URL = 'postgres://db/app'

    const config = defineConfig({
      server: {
        api: { port: field(z.number().int(), { env: true }) },
        databaseUrl: env('DATABASE_URL', z.url()),
      },
      client: { app: { name: field(z.string()) } },
    })

    expect(config.server).toEqual({ api: { port: 9000 }, databaseUrl: 'postgres://db/app' })
    expect(config.client.app.name).toBe('shop')
  })

  test('a missing baked global names the plugin', () => {
    const config = defineConfig({ server: { a: field(z.string()) } })
    expect(() => config.server).toThrow(/__APP_CONFIG_YAML__.*@lunarhue\/config\/vite/)
  })

  test('env sides are read when accessed, not when defined', () => {
    globals[APP_CONFIG_YAML_GLOBAL] = {}
    const config = defineConfig({ server: { secret: env('SECRET', z.string()) } })
    bindings.SECRET = 'late'
    expect(config.server.secret).toBe('late')
  })
})
