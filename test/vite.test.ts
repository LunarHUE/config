import { afterEach, describe, expect, test, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import type { Plugin, ViteDevServer } from 'vite'
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

interface FakeServer {
  watcher: { add: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> }
  restart: ReturnType<typeof vi.fn>
}

function fakeServer(): FakeServer {
  return { watcher: { add: vi.fn(), on: vi.fn() }, restart: vi.fn() }
}

/** Call the plugin's configureServer hook the way Vite does. */
function callConfigureServer(plugin: Plugin, server: FakeServer): void {
  const hook = plugin.configureServer
  if (typeof hook !== 'function') throw new Error('expected a plain function configureServer hook')
  hook.call(undefined as never, server as unknown as ViteDevServer)
}

/** The listener the plugin registered for one watcher event. */
function listener(server: FakeServer, event: string): (file: string) => void {
  const call = server.watcher.on.mock.calls.find((args: unknown[]) => args[0] === event)
  if (!call) throw new Error(`no ${event} listener`)
  return call[1] as (file: string) => void
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

  test('a nested client group stays nested in the define value', () => {
    const API = envKey('VITE_PLUGIN_PUBLIC_API_URL')
    const root = tempRoot({
      '.env': `${API}=https://api.example.com\n`,
      'config.default.yml': 'app:\n  name: shop\nui:\n  theme: dark\n',
    })

    const define = callConfigHook(
      appConfig({
        root,
        mode: 'test',
        client: {
          appName: file('app.name', z.string()),
          ui: { theme: file('ui.theme', z.string()), apiUrl: env(API, z.string()) },
        },
      }),
    )

    const value = define[`globalThis.${APP_CONFIG_GLOBAL}`] as string
    expect(JSON.parse(value)).toEqual({
      appName: 'shop',
      ui: { theme: 'dark', apiUrl: 'https://api.example.com' },
    })
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

describe('the vite plugin in dev', () => {
  function devPlugin(extra: { watch?: boolean } = {}): { plugin: Plugin; root: string } {
    const root = tempRoot({ '.env': 'UNUSED=1\n', 'config.default.yml': 'app:\n  name: shop\n' })
    const plugin = appConfig(
      { root, mode: 'test', client: { appName: file('app.name', z.string()) } },
      extra,
    )
    return { plugin, root }
  }

  test('has a configureServer hook', () => {
    expect(typeof appConfig({ client: {} }).configureServer).toBe('function')
  })

  test('watches every file the load read', () => {
    const { plugin, root } = devPlugin()
    const server = fakeServer()

    callConfigureServer(plugin, server)

    expect(server.watcher.add).toHaveBeenCalledWith([
      path.join(root, '.env'),
      path.join(root, 'config.default.yml'),
    ])
    expect(server.watcher.on.mock.calls.map((args: unknown[]) => args[0])).toEqual([
      'change',
      'add',
      'unlink',
    ])
  })

  test('a change to a loaded file restarts the server once', () => {
    const { plugin, root } = devPlugin()
    const server = fakeServer()

    callConfigureServer(plugin, server)
    listener(server, 'change')(path.join(root, 'config.default.yml'))

    expect(server.restart).toHaveBeenCalledTimes(1)
  })

  test('a layer that did not exist at load time restarts the server', () => {
    const { plugin, root } = devPlugin()
    const server = fakeServer()

    callConfigureServer(plugin, server)
    listener(server, 'add')(path.join(root, 'config.local.yml'))

    expect(server.restart).toHaveBeenCalledTimes(1)
  })

  test('an unrelated file does not restart the server', () => {
    const { plugin, root } = devPlugin()
    const server = fakeServer()

    callConfigureServer(plugin, server)
    listener(server, 'change')(path.join(root, 'src/main.ts'))

    expect(server.restart).not.toHaveBeenCalled()
  })

  test('a restart makes the config hook read the files again', () => {
    const { plugin, root } = devPlugin()
    const server = fakeServer()

    expect(callConfigHook(plugin)).toEqual(callConfigHook(plugin))
    callConfigureServer(plugin, server)

    fs.writeFileSync(path.join(root, 'config.default.yml'), 'app:\n  name: later\n')
    listener(server, 'change')(path.join(root, 'config.default.yml'))

    const define = callConfigHook(plugin)
    expect(JSON.parse(define[`globalThis.${APP_CONFIG_GLOBAL}`] as string)).toEqual({
      appName: 'later',
    })
  })

  test('watch false registers nothing', () => {
    const { plugin } = devPlugin({ watch: false })
    const server = fakeServer()

    callConfigureServer(plugin, server)

    expect(server.watcher.add).not.toHaveBeenCalled()
    expect(server.watcher.on).not.toHaveBeenCalled()
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
