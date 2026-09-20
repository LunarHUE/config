import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { ConfigError, RootNotFoundError } from '../src/errors'
import { loadConfig } from '../src/load'
import { env, file } from '../src/sources'

const temps: string[] = []
const envKeys: string[] = []

/** macOS symlinks /tmp, so realpath keeps the expected paths comparable. */
function tempRoot(files: Record<string, string> = {}): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lunarhue-load-')))
  temps.push(root)
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), text)
  }
  return root
}

/** loadEnvLayers writes into process.env, so every test uses fresh names and cleans up. */
function envKey(name: string): string {
  envKeys.push(name)
  return name
}

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  for (const key of envKeys.splice(0)) delete process.env[key]
})

describe('loadConfig', () => {
  test('reads both sections from the env and yaml layers', () => {
    const DB = envKey('LOAD_DATABASE_URL')
    const root = tempRoot({
      '.env': `${DB}=postgres://localhost/app\n`,
      'config.default.yml': 'logging:\n  level: info\nui:\n  title: Default\n',
      'config.test.yml': 'ui:\n  title: Testing\n',
    })

    const result = loadConfig({
      root,
      mode: 'test',
      server: { databaseUrl: env(DB, z.string()) },
      client: {
        level: file('logging.level', z.string()),
        title: file('ui.title', z.string()),
      },
    })

    expect(result.server.databaseUrl).toBe('postgres://localhost/app')
    expect(result.client.level).toBe('info')
    expect(result.client.title).toBe('Testing')
    expect(result.mode).toBe('test')
    expect(result.root).toBe(root)
  })

  test('files lists every file it read, env layers first', () => {
    const KEY = envKey('LOAD_FILES_KEY')
    const root = tempRoot({
      '.env': `${KEY}=a\n`,
      '.env.local': '',
      '.env.staging': '',
      'config.default.yml': 'a: 1\n',
      'config.staging.yml': 'a: 2\n',
      'config.local.yml': 'a: 3\n',
    })

    const result = loadConfig({
      root,
      mode: 'staging',
      server: { key: env(KEY, z.string()) },
    })

    expect(result.files).toEqual([
      path.join(root, '.env'),
      path.join(root, '.env.local'),
      path.join(root, '.env.staging'),
      path.join(root, 'config.default.yml'),
      path.join(root, 'config.staging.yml'),
      path.join(root, 'config.local.yml'),
    ])
  })

  test('each layer overrides the one below it', () => {
    const root = tempRoot({
      'config.default.yml': 'fromDefault: default\nfromMode: default\n',
      'config.staging.yml': 'fromMode: staging\n',
    })

    const result = loadConfig({
      root,
      mode: 'staging',
      client: {
        fromSchema: file('missing.value', z.string().default('schema')),
        fromDefault: file('fromDefault', z.string()),
        fromMode: file('fromMode', z.string()),
      },
    })

    expect(result.client).toEqual({
      fromSchema: 'schema',
      fromDefault: 'default',
      fromMode: 'staging',
    })
  })

  test('throws RootNotFoundError when a file key has no root', () => {
    const dir = tempRoot()
    const before = process.cwd()
    try {
      process.chdir(dir)
      expect(() =>
        loadConfig({ mode: 'test', client: { level: file('logging.level', z.string()) } }),
      ).toThrow(RootNotFoundError)
    } finally {
      process.chdir(before)
    }
  })

  test('an env-only definition works without a root', () => {
    const KEY = envKey('LOAD_NO_ROOT_KEY')
    const dir = tempRoot({ '.env': `${KEY}=from-file\n` })
    const before = process.cwd()
    try {
      process.chdir(dir)
      const result = loadConfig({ mode: 'test', server: { key: env(KEY, z.string()) } })
      expect(result.server.key).toBe('from-file')
      expect(result.root).toBe(dir)
      expect(result.files).toEqual([path.join(dir, '.env')])
    } finally {
      process.chdir(before)
    }
  })

  test('a validation failure propagates as a ConfigError', () => {
    const root = tempRoot({ 'config.default.yml': 'logging:\n  level: 3\n' })

    expect(() =>
      loadConfig({ root, mode: 'test', client: { level: file('logging.level', z.string()) } }),
    ).toThrow(ConfigError)
  })

  test('a relative root resolves against the cwd', () => {
    const base = tempRoot()
    const nested = path.join(base, 'repo')
    fs.mkdirSync(nested)
    fs.writeFileSync(path.join(nested, 'config.default.yml'), 'a: 1\n')

    const before = process.cwd()
    try {
      process.chdir(base)
      const result = loadConfig({ root: 'repo', mode: 'test', client: { a: file('a', z.number()) } })
      expect(result.root).toBe(nested)
      expect(result.client.a).toBe(1)
    } finally {
      process.chdir(before)
    }
  })
})
