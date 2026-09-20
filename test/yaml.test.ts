import { describe, expect, test } from 'bun:test'
import { parseYamlDocument, yamlLayerFiles } from '../src/yaml.js'

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
