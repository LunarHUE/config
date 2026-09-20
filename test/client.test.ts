import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { APP_CONFIG_GLOBAL, BoundaryError, defineConfig } from '../src/client.js'
import { env, file } from '../src/sources.js'

const definition = {
  server: { databaseUrl: env('DATABASE_URL', z.string()) },
  client: { appName: file('app.name', z.string()), apiUrl: file('api.url', z.string()) },
}

/** Run `body` with the global set, then put the global back the way it was. */
function withGlobal(value: unknown, body: () => void): void {
  const globals = globalThis as Record<string, unknown>
  const had = APP_CONFIG_GLOBAL in globals
  const previous = globals[APP_CONFIG_GLOBAL]
  globals[APP_CONFIG_GLOBAL] = value
  try {
    body()
  } finally {
    if (had) globals[APP_CONFIG_GLOBAL] = previous
    else delete globals[APP_CONFIG_GLOBAL]
  }
}

function withoutGlobal(body: () => void): void {
  const globals = globalThis as Record<string, unknown>
  const had = APP_CONFIG_GLOBAL in globals
  const previous = globals[APP_CONFIG_GLOBAL]
  delete globals[APP_CONFIG_GLOBAL]
  try {
    body()
  } finally {
    if (had) globals[APP_CONFIG_GLOBAL] = previous
  }
}

describe('client config', () => {
  test('client reads the global', () => {
    withGlobal({ appName: 'shop', apiUrl: 'https://api.example.com' }, () => {
      const config = defineConfig(definition)
      expect(config.client.appName).toBe('shop')
      expect(config.client.apiUrl).toBe('https://api.example.com')
    })
  })

  test('a missing global points at the plugin and serializeClient', () => {
    withoutGlobal(() => {
      const config = defineConfig(definition)
      let message = ''
      try {
        void config.client
      } catch (error) {
        message = (error as Error).message
      }
      expect(message).toContain(APP_CONFIG_GLOBAL)
      expect(message).toContain('@lunarhue/config/vite')
      expect(message).toContain('serializeClient')
    })
  })

  test('reading a server key throws BoundaryError naming the key', () => {
    withGlobal({ appName: 'shop', apiUrl: '' }, () => {
      const config = defineConfig(definition)
      let caught: unknown
      try {
        void config.server.databaseUrl
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(BoundaryError)
      expect((caught as BoundaryError).key).toBe('databaseUrl')
      expect((caught as BoundaryError).message).toContain('databaseUrl')
    })
  })

  test('symbol keys throw too', () => {
    const config = defineConfig(definition)
    expect(() => {
      void (config.server as unknown as Record<symbol, unknown>)[Symbol.iterator]
    }).toThrow(BoundaryError)
  })

  test('destructuring server does not throw', () => {
    const config = defineConfig(definition)
    expect(() => {
      const { server } = config
      void server
    }).not.toThrow()
  })

  test('a later change to the global is visible on the next read', () => {
    withGlobal({ appName: 'first', apiUrl: '' }, () => {
      const config = defineConfig(definition)
      expect(config.client.appName).toBe('first')
      ;(globalThis as Record<string, unknown>)[APP_CONFIG_GLOBAL] = {
        appName: 'second',
        apiUrl: '',
      }
      expect(config.client.appName).toBe('second')
    })
  })

  test('the source has no node: imports', () => {
    const source = readFileSync(new URL('../src/client.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('node:')
  })
})
