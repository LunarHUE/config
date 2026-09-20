import { afterEach, describe, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import type { Plugin } from 'vite'
import { defineConfig } from '../src/index'
import { env, file } from '../src/sources'
import appConfig, { APP_CONFIG_GLOBAL, serializeClient } from '../src/vite'

const temps: string[] = []
const envKeys: string[] = []

function tempRoot(files: Record<string, string> = {}): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lunarhue-vite-')))
  temps.push(root)
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), text)
  }
  return root
}

/** loadEnvLayers writes into process.env, so every test uses a fresh name and cleans up. */
function envKey(name: string): string {
  envKeys.push(name)
  return name
}

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  for (const key of envKeys.splice(0)) delete process.env[key]
})

/** Run the serialized script and read back what it set, then drop the global. */
function evaluate(script: string): unknown {
  const globals = globalThis as Record<string, unknown>
  try {
    new Function(script)()
    return globals[APP_CONFIG_GLOBAL]
  } finally {
    delete globals[APP_CONFIG_GLOBAL]
  }
}

describe('serializeClient', () => {
  test('sets the global to the client section only', () => {
    const DB = envKey('VITE_SERIALIZE_DATABASE_URL')
    const root = tempRoot({
      '.env': `${DB}=postgres://localhost/app\n`,
      'config.default.yml': 'app:\n  name: shop\napi:\n  url: https://api.example.com\n',
    })

    const script = serializeClient({
      root,
      mode: 'test',
      server: { databaseUrl: env(DB, z.string()) },
      client: {
        appName: file('app.name', z.string()),
        apiUrl: file('api.url', z.string()),
      },
    })

    const value = evaluate(script)
    expect(value).toEqual({ appName: 'shop', apiUrl: 'https://api.example.com' })
    expect(Object.keys(value as object)).not.toContain('databaseUrl')
    expect(script).not.toContain('postgres://localhost/app')
  })

  test('escapes a value that closes the script tag', () => {
    const root = tempRoot({
      'config.default.yml': "app:\n  name: '</script><script>alert(1)</script>'\n",
    })

    const script = serializeClient({
      root,
      mode: 'test',
      client: { appName: file('app.name', z.string()) },
    })

    expect(script).not.toContain('</script>')
    expect(script).toContain('\\u003c')
    expect(evaluate(script)).toEqual({ appName: '</script><script>alert(1)</script>' })
  })

  test('a Config and a bare definition serialize the same', () => {
    const root = tempRoot({ 'config.default.yml': 'app:\n  name: shop\n' })
    const definition = {
      root,
      mode: 'test',
      client: { appName: file('app.name', z.string()) },
    }

    expect(serializeClient(defineConfig(definition))).toBe(serializeClient(definition))
  })
})

/** Call the plugin's config hook the way Vite does and return the define map. */
function callConfigHook(plugin: Plugin): Record<string, string> {
  const hook = plugin.config
  if (typeof hook !== 'function') throw new Error('expected a plain function config hook')
  const result = hook.call(undefined as never, {}, { command: 'build', mode: 'production' })
  if (result === null || result === undefined || result instanceof Promise) {
    throw new Error('expected the hook to return a config object')
  }
  return (result.define ?? {}) as Record<string, string>
}

function read(relative: string): string {
  return fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
}

describe('the vite plugin', () => {
  test('is named lunarhue-config', () => {
    expect(appConfig({ client: {} }).name).toBe('lunarhue-config')
  })

  test('defines the client section on the global', () => {
    const DB = envKey('VITE_PLUGIN_DATABASE_URL')
    const root = tempRoot({
      '.env': `${DB}=postgres://localhost/app\n`,
      'config.default.yml': 'app:\n  name: shop\n',
    })

    const define = callConfigHook(
      appConfig({
        root,
        mode: 'test',
        server: { databaseUrl: env(DB, z.string()) },
        client: { appName: file('app.name', z.string()) },
      }),
    )

    expect(Object.keys(define)).toEqual([`globalThis.${APP_CONFIG_GLOBAL}`])
    const value = define[`globalThis.${APP_CONFIG_GLOBAL}`] as string
    expect(JSON.parse(value)).toEqual({ appName: 'shop' })
    expect(value).not.toContain('databaseUrl')
  })

  test('loads once even when the hook runs twice', () => {
    const root = tempRoot({ 'config.default.yml': 'app:\n  name: shop\n' })
    const plugin = appConfig({
      root,
      mode: 'test',
      client: { appName: file('app.name', z.string()) },
    })

    const first = callConfigHook(plugin)
    fs.rmSync(path.join(root, 'config.default.yml'))

    expect(callConfigHook(plugin)).toEqual(first)
  })
})

describe('the vite module', () => {
  test('uses the same global name as the client entry', () => {
    const literal = (source: string): string => {
      const match = /APP_CONFIG_GLOBAL = '([^']+)'/.exec(read(source))
      if (match?.[1] === undefined) throw new Error(`no APP_CONFIG_GLOBAL in ${source}`)
      return match[1]
    }

    expect(literal('src/vite.ts')).toBe(literal('src/client.ts'))
  })

  test('imports nothing from vite at runtime', () => {
    const lines = read('src/vite.ts')
      .split('\n')
      .filter((line) => line.includes("from 'vite'"))

    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line.startsWith('import type ')).toBe(true)
  })
})
