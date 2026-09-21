import { afterEach, describe, expect, test } from 'vitest'
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

/** A subdirectory of `root` holding its own layers. */
function packageDir(root: string, name: string, files: Record<string, string> = {}): string {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text)
  return dir
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

  test('dir discovers the root from its parent and layers on top of it', () => {
    const KEY = envKey('LOAD_DIR_KEY')
    const root = tempRoot({
      '.env': `${KEY}=root\n`,
      'config.default.yml': 'app:\n  name: Acme\n  region: us\n',
    })
    const dir = packageDir(root, 'apps/api', {
      '.env': `${KEY}=api\n`,
      'config.default.yml': 'app:\n  name: Api\n',
    })

    const result = loadConfig({
      dir,
      mode: 'test',
      server: { key: env(KEY, z.string()) },
      client: {
        name: file('app.name', z.string()),
        region: file('app.region', z.string()),
      },
    })

    expect(result.root).toBe(root)
    expect(result.dirs).toEqual([root, dir])
    expect(result.server.key).toBe('api')
    expect(result.client.name).toBe('Api')
    expect(result.client.region).toBe('us')
  })

  test('a dir that is itself the root reads one layer set', () => {
    const root = tempRoot({ '.env': 'IGNORED=1\n', 'config.default.yml': 'a: 1\n' })

    const result = loadConfig({ dir: root, mode: 'test', client: { a: file('a', z.number()) } })

    expect(result.root).toBe(root)
    expect(result.dirs).toEqual([root])
    expect(result.files).toEqual([path.join(root, '.env'), path.join(root, 'config.default.yml')])
  })

  test('dir becomes the root when no marker exists and every key is an env key', () => {
    const base = tempRoot()
    const dir = packageDir(base, 'packages/db', { '.env': `${envKey('LOAD_DIR_ONLY')}=yes\n` })

    const result = loadConfig({
      dir,
      mode: 'test',
      server: { key: env('LOAD_DIR_ONLY', z.string()) },
    })

    expect(result.root).toBe(dir)
    expect(result.dirs).toEqual([dir])
    expect(result.server.key).toBe('yes')
  })

  test('dirs holds the one root when no dir is given', () => {
    const root = tempRoot({ 'config.default.yml': 'a: 1\n' })
    const result = loadConfig({ root, mode: 'test', client: { a: file('a', z.number()) } })

    expect(result.dirs).toEqual([root])
  })
})
