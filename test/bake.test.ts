import { afterEach, describe, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { bakeYaml } from '../src/bake'
import { ConfigError } from '../src/errors'
import { env, field, file } from '../src/sources'

const temps: string[] = []

function tempRoot(files: Record<string, string> = {}): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lunarhue-bake-')))
  temps.push(root)
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(root, name), text)
  return root
}

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('bakeYaml', () => {
  test('keeps only the subtrees the definition reads, from both sections', () => {
    const root = tempRoot({
      'config.default.yml': [
        'paths:',
        '  nixosDir: /etc/nixos',
        '  dataDir: /var/lib/app',
        'app:',
        '  name: shop',
        'unused:',
        '  secretish: nope',
        '',
      ].join('\n'),
      'config.test.yml': 'paths:\n  dataDir: /tmp/app\n',
    })

    const result = bakeYaml({
      root,
      mode: 'test',
      server: {
        paths: { nixosDir: field(z.string()), dataDir: field(z.string(), { env: true }) },
        databaseUrl: env('DATABASE_URL', z.string()),
      },
      client: { app: { name: field(z.string()) } },
    })

    expect(result.yaml).toEqual({
      paths: { nixosDir: '/etc/nixos', dataDir: '/tmp/app' },
      app: { name: 'shop' },
    })
    expect(result.mode).toBe('test')
    expect(result.files).toEqual([
      path.join(root, 'config.default.yml'),
      path.join(root, 'config.test.yml'),
    ])
  })

  test('an explicit file path and a whole subtree bake too', () => {
    const root = tempRoot({
      'config.default.yml': 'old:\n  place: x\nauth:\n  signInPath: /sign-in\n  extra: 1\n',
    })

    const result = bakeYaml({
      root,
      server: { legacy: file('old.place', z.string()) },
      client: { auth: field(z.object({ signInPath: z.string() })) },
    })

    expect(result.yaml).toEqual({
      old: { place: 'x' },
      auth: { signInPath: '/sign-in', extra: 1 },
    })
  })

  test('a missing value is left for runtime, not an error', () => {
    const root = tempRoot({ 'config.default.yml': 'a: 1\n' })

    const result = bakeYaml({
      root,
      server: { port: field(z.number(), { env: 'PORT' }) },
    })

    expect(result.yaml).toEqual({})
  })

  test('a present value that fails its schema fails the bake', () => {
    const root = tempRoot({ 'config.default.yml': 'api:\n  port: eighty\n' })

    let error: unknown
    try {
      bakeYaml({ root, server: { api: { port: field(z.number(), { env: 'PORT' }) } } })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(ConfigError)
    expect((error as ConfigError).issues[0]).toMatchObject({
      section: 'server',
      key: 'api.port',
      source: 'file',
      path: 'api.port',
      env: 'PORT',
    })
  })

  test('an env-only definition needs no root and bakes an empty document', () => {
    const result = bakeYaml({
      root: tempRoot(),
      server: { url: env('DATABASE_URL', z.string()) },
    })
    expect(result.yaml).toEqual({})
  })
})
