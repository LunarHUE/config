import { afterEach, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { defineConfig, env, loadConfig } from '../src/index'

const DB = 'DRIZZLE_TEST_DATABASE_URL'

let repo: string | undefined

afterEach(() => {
  if (repo) fs.rmSync(repo, { recursive: true, force: true })
  repo = undefined
  delete process.env[DB]
})

/** A repo whose root marker sits above the package that reads the config. */
function makeRepo(): { root: string; pkg: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lunarhue-drizzle-')))
  repo = root
  fs.writeFileSync(path.join(root, 'config.default.yml'), 'logging:\n  level: info\n')
  fs.writeFileSync(path.join(root, '.env'), `${DB}=postgres://localhost/app\n`)
  const pkg = path.join(root, 'packages', 'db')
  fs.mkdirSync(pkg, { recursive: true })
  fs.writeFileSync(path.join(pkg, '.env'), `${DB}=postgres://localhost/db-package\n`)
  return { root, pkg }
}

test('a script in a nested package reads config from the repo root', () => {
  const { root, pkg } = makeRepo()
  const before = process.cwd()

  try {
    process.chdir(pkg)

    const config = defineConfig({ server: { databaseUrl: env(DB, z.url()) } })
    expect(config.server.databaseUrl).toBe('postgres://localhost/app')

    expect(loadConfig({ server: { databaseUrl: env(DB, z.url()) } }).root).toBe(root)
  } finally {
    process.chdir(before)
  }
})

test('passing dir applies the package .env on top of the root one', () => {
  const { root, pkg } = makeRepo()

  const result = loadConfig({ dir: pkg, server: { databaseUrl: env(DB, z.url()) } })

  expect(result.root).toBe(root)
  expect(result.dirs).toEqual([root, pkg])
  expect(result.server.databaseUrl).toBe('postgres://localhost/db-package')
})
