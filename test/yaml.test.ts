import { afterAll, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadYamlLayers, parseYamlDocument, yamlLayerFiles } from '../src/yaml'

function tempRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'lunarhue-config-'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text)
  return root
}

describe('parseYamlDocument', () => {
  test('an empty file is an empty object', () => {
    expect(parseYamlDocument('', '/app/config.default.yml')).toEqual({})
    expect(parseYamlDocument('# only a comment\n', '/app/config.default.yml')).toEqual({})
  })

  test('a scalar top level throws and names the file', () => {
    expect(() => parseYamlDocument('42\n', '/app/config.local.yml')).toThrow(
      /\/app\/config\.local\.yml/,
    )
  })

  test('a sequence top level throws and names the file', () => {
    expect(() => parseYamlDocument('- a\n- b\n', '/app/config.local.yml')).toThrow(
      /\/app\/config\.local\.yml/,
    )
  })

  test('yes and no stay strings under the core schema', () => {
    const doc = parseYamlDocument('a: yes\nb: no\nc: true\n', '/app/config.default.yml')
    expect(doc).toEqual({ a: 'yes', b: 'no', c: true })
  })

  test('a date stays a string', () => {
    const doc = parseYamlDocument('released: 2024-01-31\n', '/app/config.default.yml')
    expect(doc.released).toBe('2024-01-31')
  })

  test('a syntax error names the file', () => {
    expect(() => parseYamlDocument('a: [1, 2\n', '/app/config.dev.yml')).toThrow(
      /\/app\/config\.dev\.yml/,
    )
  })
})

describe('yamlLayerFiles', () => {
  test('lists the layers lowest precedence first', () => {
    expect(yamlLayerFiles('production')).toEqual([
      'config.default.yml',
      'config.production.yml',
      'config.local.yml',
    ])
  })

  test('does not repeat a file when the mode collides with a fixed layer', () => {
    expect(yamlLayerFiles('local')).toEqual(['config.default.yml', 'config.local.yml'])
    expect(yamlLayerFiles('default')).toEqual(['config.default.yml', 'config.local.yml'])
  })
})

describe('loadYamlLayers', () => {
  const roots: string[] = []
  const root = (files: Record<string, string>) => {
    const dir = tempRoot(files)
    roots.push(dir)
    return dir
  }

  afterAll(() => {
    for (const dir of roots) rmSync(dir, { recursive: true, force: true })
  })

  test('later layers win and untouched keys survive', () => {
    const dir = root({
      'config.default.yml': 'port: 3000\nlogging:\n  level: info\n  file: app.log\nhosts: [a, b]\n',
      'config.dev.yml': 'logging:\n  level: debug\nhosts: [z]\n',
      'config.local.yml': 'port: 8080\nsentry: null\n',
    })

    const { data } = loadYamlLayers(dir, 'dev')
    expect(data).toEqual({
      port: 8080,
      logging: { level: 'debug', file: 'app.log' },
      hosts: ['z'],
      sentry: null,
    })
  })

  test('lists only the files that exist, in load order', () => {
    const dir = root({
      'config.default.yml': 'port: 3000\n',
      'config.local.yml': 'port: 8080\n',
      'config.production.yml': 'port: 80\n',
    })

    const { files } = loadYamlLayers(dir, 'dev')
    expect(files).toEqual([join(dir, 'config.default.yml'), join(dir, 'config.local.yml')])
  })

  test('no files at all gives an empty document and no files', () => {
    const dir = root({})
    expect(loadYamlLayers(dir, 'dev')).toEqual({ data: {}, files: [] })
  })

  test('a broken layer throws with its path', () => {
    const dir = root({ 'config.default.yml': 'a: [1, 2\n' })
    expect(() => loadYamlLayers(dir, 'dev')).toThrow(/config\.default\.yml/)
  })
})
