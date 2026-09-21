import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'
import { z } from 'zod'

import { defineConfig } from '../src/index'
import { env, file } from '../src/sources'
import { watchConfig } from '../src/watch'

const temps: string[] = []
const envKeys: string[] = []
const stops: Array<() => void> = []

function tempRoot(files: Record<string, string>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lunarhue-watch-')))
  temps.push(root)
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(root, name), text)
  return root
}

/** The loader writes into process.env, so every test uses a fresh name and cleans up. */
function envKey(name: string): string {
  envKeys.push(name)
  return name
}

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  for (const key of envKeys.splice(0)) delete process.env[key]
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Poll until `get` returns a value, or give up. fs.watch timing varies by platform. */
async function waitFor<T>(get: () => T | undefined, label: string, ms = 2000): Promise<T> {
  const deadline = Date.now() + ms
  for (;;) {
    const value = get()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await sleep(10)
  }
}

describe('watchConfig', () => {
  test('a YAML change is visible after the reload', async () => {
    const root = tempRoot({ 'config.default.yml': 'app:\n  name: before\n' })
    const config = defineConfig({
      root,
      mode: 'test',
      client: { name: file('app.name', z.string()) },
    })
    const changes: string[] = []

    stops.push(watchConfig(config, { onChange: (f) => changes.push(f), debounce: 10 }))
    expect(config.client.name).toBe('before')

    await sleep(50)
    fs.writeFileSync(path.join(root, 'config.default.yml'), 'app:\n  name: after\n')

    const changed = await waitFor(() => changes[0], 'the YAML change')
    expect(changed).toBe(path.join(root, 'config.default.yml'))
    expect(config.client.name).toBe('after')
  })

  test('an env change reaches both the config and process.env', async () => {
    const KEY = envKey('WATCH_ENV_TOKEN')
    const root = tempRoot({
      '.env': `${KEY}=before\n`,
      'config.default.yml': 'app:\n  name: acme\n',
    })
    const config = defineConfig({
      root,
      mode: 'test',
      server: { token: env(KEY, z.string()) },
    })
    const changes: string[] = []

    stops.push(watchConfig(config, { onChange: (f) => changes.push(f), debounce: 10 }))
    expect(config.server.token).toBe('before')
    expect(process.env[KEY]).toBe('before')

    await sleep(50)
    fs.writeFileSync(path.join(root, '.env'), `${KEY}=after\n`)

    await waitFor(() => changes[0], 'the env change')
    expect(config.server.token).toBe('after')
    expect(process.env[KEY]).toBe('after')
  })

  test('the returned function stops the watcher', async () => {
    const root = tempRoot({ 'config.default.yml': 'app:\n  name: before\n' })
    const config = defineConfig({
      root,
      mode: 'test',
      client: { name: file('app.name', z.string()) },
    })
    const changes: string[] = []

    const stop = watchConfig(config, { onChange: (f) => changes.push(f), debounce: 10 })
    expect(config.client.name).toBe('before')

    await sleep(50)
    fs.writeFileSync(path.join(root, 'config.default.yml'), 'app:\n  name: after\n')
    await waitFor(() => changes[0], 'the first change')

    stop()
    fs.writeFileSync(path.join(root, 'config.default.yml'), 'app:\n  name: later\n')
    await sleep(300)

    expect(changes).toHaveLength(1)
    expect(config.client.name).toBe('after')
  })

  test('a change that fails validation goes to onError', async () => {
    const root = tempRoot({ 'config.default.yml': 'app:\n  name: before\n' })
    const config = defineConfig({
      root,
      mode: 'test',
      client: { name: file('app.name', z.string()) },
    })
    const changes: string[] = []
    const errors: unknown[] = []

    stops.push(
      watchConfig(config, {
        onChange: (f) => changes.push(f),
        onError: (e) => errors.push(e),
        debounce: 10,
      }),
    )
    expect(config.client.name).toBe('before')

    await sleep(50)
    fs.writeFileSync(path.join(root, 'config.default.yml'), 'app:\n  name: 42\n')

    const error = await waitFor(() => errors[0], 'the validation failure')
    expect((error as Error).message).toContain('Invalid config')
    expect(changes).toHaveLength(0)
  })

  test('watching a directory that disappears does not throw', () => {
    const root = tempRoot({ 'config.default.yml': 'app:\n  name: gone\n' })
    const config = defineConfig({
      root,
      mode: 'test',
      client: { name: file('app.name', z.string()) },
    })
    expect(config.client.name).toBe('gone')
    fs.rmSync(root, { recursive: true, force: true })

    const stop = watchConfig(config)
    stop()
  })
})
