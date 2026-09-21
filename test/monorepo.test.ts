import { afterEach, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { env, file, loadConfig } from '../src/index'

const API_KEY = 'MONOREPO_API_TOKEN'
const DB_KEY = 'MONOREPO_DB_TOKEN'
const SHARED_KEY = 'MONOREPO_SHARED_TOKEN'
const ROOT_KEY = 'MONOREPO_ROOT_TOKEN'

let repo: string | undefined

afterEach(() => {
  if (repo) fs.rmSync(repo, { recursive: true, force: true })
  repo = undefined
  for (const key of [API_KEY, DB_KEY, SHARED_KEY, ROOT_KEY]) delete process.env[key]
})

/** A repo with shared config at the root and per-package layers under it. */
function makeRepo(): { root: string; api: string; db: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lunarhue-monorepo-')))
  repo = root
  write(root, 'config.default.yml', 'app:\n  name: Acme\n  support: help@acme.test\n')
  write(root, '.env', `${SHARED_KEY}=root\n${ROOT_KEY}=root\n`)

  const api = path.join(root, 'apps', 'api')
  fs.mkdirSync(api, { recursive: true })
  write(api, 'config.default.yml', 'app:\n  name: Acme API\n')
  write(api, '.env', `${SHARED_KEY}=api\n${API_KEY}=api\n`)

  const db = path.join(root, 'packages', 'db')
  fs.mkdirSync(db, { recursive: true })
  write(db, '.env', `${DB_KEY}=db\n`)

  return { root, api, db }
}

function write(dir: string, name: string, text: string): void {
  fs.writeFileSync(path.join(dir, name), text)
}

test('a package layers its own config and env over the repo root', () => {
  const { root, api } = makeRepo()

  const result = loadConfig({
    dir: api,
    mode: 'test',
    server: {
      shared: env(SHARED_KEY, z.string()),
      rootOnly: env(ROOT_KEY, z.string()),
      apiOnly: env(API_KEY, z.string()),
      dbOnly: env(DB_KEY, z.string().optional()),
    },
    client: {
      name: file('app.name', z.string()),
      support: file('app.support', z.string()),
    },
  })

  expect(result.root).toBe(root)
  expect(result.dirs).toEqual([root, api])
  expect(result.client.name).toBe('Acme API')
  expect(result.client.support).toBe('help@acme.test')
  expect(result.server.shared).toBe('api')
  expect(result.server.rootOnly).toBe('root')
  expect(result.server.apiOnly).toBe('api')
  expect(result.server.dbOnly).toBeUndefined()
})

test('a package with only a .env layers it over the root .env', () => {
  const { root, db } = makeRepo()

  const result = loadConfig({
    dir: db,
    mode: 'test',
    server: {
      shared: env(SHARED_KEY, z.string()),
      dbOnly: env(DB_KEY, z.string()),
    },
  })

  expect(result.root).toBe(root)
  expect(result.dirs).toEqual([root, db])
  expect(result.server.shared).toBe('root')
  expect(result.server.dbOnly).toBe('db')
})

test('the result does not depend on the cwd', () => {
  const { root, api } = makeRepo()
  const before = process.cwd()

  try {
    process.chdir(root)
    const result = loadConfig({
      dir: api,
      mode: 'test',
      server: { shared: env(SHARED_KEY, z.string()) },
      client: { name: file('app.name', z.string()) },
    })

    expect(result.root).toBe(root)
    expect(result.dirs).toEqual([root, api])
    expect(result.server.shared).toBe('api')
    expect(result.client.name).toBe('Acme API')
  } finally {
    process.chdir(before)
  }
})
