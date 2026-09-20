import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { envLayerFiles, loadEnvLayers, parseDotenv } from '../src/dotenv'
import type { EnvMap } from '../src/types'

describe('parseDotenv', () => {
  test('reads one pair per line', () => {
    expect(parseDotenv('A=1\nB=two')).toEqual({ A: '1', B: 'two' })
  })

  test('skips comments and blank lines', () => {
    const text = '# leading comment\n\nA=1\n   # indented comment\n\nB=2\n'
    expect(parseDotenv(text)).toEqual({ A: '1', B: '2' })
  })

  test('strips single quotes without unescaping', () => {
    expect(parseDotenv("A='hello world'\nB='a\\nb'")).toEqual({
      A: 'hello world',
      B: 'a\\nb',
    })
  })

  test('strips double quotes and unescapes', () => {
    expect(parseDotenv('A="line1\\nline2"\nB="tab\\there"\nC="say \\"hi\\""')).toEqual({
      A: 'line1\nline2',
      B: 'tab\there',
      C: 'say "hi"',
    })
  })

  test('drops an export prefix', () => {
    expect(parseDotenv('export A=1\n  export B="2"')).toEqual({ A: '1', B: '2' })
  })

  test('empty value is the empty string', () => {
    expect(parseDotenv('A=\nB=""\nC=\n')).toEqual({ A: '', B: '', C: '' })
  })

  test('handles CRLF line endings', () => {
    expect(parseDotenv('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' })
  })

  test('strips an inline comment from an unquoted value', () => {
    expect(parseDotenv('A=value # trailing\nB=has#hash\nC="quoted" # trailing')).toEqual({
      A: 'value',
      B: 'has#hash',
      C: 'quoted',
    })
  })

  test('keeps = inside a value', () => {
    expect(parseDotenv('A=b=c')).toEqual({ A: 'b=c' })
  })

  test('trims whitespace around key and value', () => {
    expect(parseDotenv('  A  =  1  \n\tB\t=\tx y\t')).toEqual({ A: '1', B: 'x y' })
  })

  test('later duplicate keys win', () => {
    expect(parseDotenv('A=1\nA=2\nA=3')).toEqual({ A: '3' })
  })

  test('ignores lines without = and invalid keys', () => {
    expect(parseDotenv('JUST_A_WORD\n1BAD=x\nBAD-KEY=x\nA B=x\nOK=1')).toEqual({ OK: '1' })
  })
})

describe('envLayerFiles', () => {
  test('lists the four file names lowest precedence first', () => {
    expect(envLayerFiles('test')).toEqual(['.env', '.env.local', '.env.test', '.env.test.local'])
  })
})

describe('loadEnvLayers', () => {
  const roots: string[] = []

  function makeRoot(files: Record<string, string>): string {
    const root = mkdtempSync(path.join(tmpdir(), 'lunarhue-env-'))
    roots.push(root)
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(path.join(root, name), text)
    }
    return root
  }

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true })
  })

  test('later layers win, and each layer keeps what the ones above it leave out', () => {
    const root = makeRoot({
      '.env': 'LEVEL=env\nA=env\nB=env\nC=env\nD=env\n',
      '.env.local': 'LEVEL=local\nB=local\nC=local\nD=local\n',
      '.env.test': 'LEVEL=mode\nC=mode\nD=mode\n',
      '.env.test.local': 'LEVEL=modelocal\nD=modelocal\n',
    })
    const env: EnvMap = {}
    const result = loadEnvLayers(root, 'test', env)

    expect(result.env.LEVEL).toBe('modelocal')
    expect(result.env.A).toBe('env')
    expect(result.env.B).toBe('local')
    expect(result.env.C).toBe('mode')
    expect(result.env.D).toBe('modelocal')
    expect(result.files).toHaveLength(4)
  })

  test('a preset processEnv key beats .env.<mode>.local', () => {
    const root = makeRoot({
      '.env': 'TOKEN=from-env\n',
      '.env.test.local': 'TOKEN=from-mode-local\n',
    })
    const env: EnvMap = { TOKEN: 'from-ci' }
    const result = loadEnvLayers(root, 'test', env)

    expect(result.env.TOKEN).toBe('from-ci')
    expect(env.TOKEN).toBe('from-ci')
  })

  test('writes file-only keys into the passed processEnv and returns that object', () => {
    const root = makeRoot({ '.env': 'ONLY_IN_FILE=yes\nBLANK=\n' })
    const env: EnvMap = { PRESET: 'kept' }
    const result = loadEnvLayers(root, 'test', env)

    expect(env.ONLY_IN_FILE).toBe('yes')
    expect(env.BLANK).toBe('')
    expect(result.env).toBe(env)
    expect(result.env.PRESET).toBe('kept')
  })

  test('files lists only the files that exist, in load order', () => {
    const root = makeRoot({ '.env': 'A=1\n', '.env.test': 'A=2\n' })
    const result = loadEnvLayers(root, 'test', {})

    expect(result.files).toEqual([path.join(root, '.env'), path.join(root, '.env.test')])
  })

  test('a missing root returns just processEnv and no files', () => {
    const env: EnvMap = { KEEP: 'yes' }
    const result = loadEnvLayers(path.join(tmpdir(), 'lunarhue-no-such-dir'), 'test', env)

    expect(result.files).toEqual([])
    expect(result.env).toEqual({ KEEP: 'yes' })
  })
})
