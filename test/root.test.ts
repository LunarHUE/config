import { afterEach, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ROOT_MARKER, findRoot } from '../src/root'

const temps: string[] = []

/** macOS symlinks /tmp, so realpath keeps the expected paths comparable. */
function tempDir(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lunarhue-root-')))
  temps.push(dir)
  return dir
}

function makeDir(...segments: string[]): string {
  const dir = path.join(...segments)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function markRoot(dir: string): string {
  fs.writeFileSync(path.join(dir, ROOT_MARKER), 'a: 1\n')
  return dir
}

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

test('finds the root from a directory two levels down', () => {
  const root = markRoot(tempDir())
  const nested = makeDir(root, 'apps', 'web')
  expect(findRoot(nested)).toBe(root)
})

test('returns the root when starting there', () => {
  const root = markRoot(tempDir())
  expect(findRoot(root)).toBe(root)
})

test('ignores a marker that sits in a sibling branch', () => {
  const base = tempDir()
  const start = makeDir(base, 'apps', 'web')
  const sibling = markRoot(makeDir(base, 'tools', 'deep'))
  const found = findRoot(start)
  expect(found).not.toBe(sibling)
  expect(found).not.toBe(base)
})

test('returns undefined when no marker exists on the way up', () => {
  const base = tempDir()
  const start = makeDir(base, 'apps', 'web')
  const found = findRoot(start)
  // We only control the temp tree. Someone could have left a config.default.yml
  // in /tmp or /, and finding that would be correct behaviour, so the check is
  // that nothing inside our own tree matched.
  expect(found === undefined || !found.startsWith(base)).toBe(true)
})

test('the nearest marker wins over an ancestor', () => {
  const ancestor = markRoot(tempDir())
  const nearer = markRoot(makeDir(ancestor, 'packages', 'api'))
  expect(findRoot(makeDir(nearer, 'src'))).toBe(nearer)
})

test('resolves a relative cwd', () => {
  const root = markRoot(tempDir())
  const nested = makeDir(root, 'apps')
  expect(findRoot(path.relative(process.cwd(), nested))).toBe(root)
})
