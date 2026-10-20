import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  test('is just .env; mode belongs to the yaml layers', () => {
    expect(envLayerFiles()).toEqual(['.env'])
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

  /** A subdirectory of `root` holding its own .env layers. */
  function makeSub(root: string, name: string, files: Record<string, string>): string {
    const dir = path.join(root, name)
    mkdirSync(dir, { recursive: true })
    for (const [file, text] of Object.entries(files)) writeFileSync(path.join(dir, file), text)
    return dir
  }

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true })
  })

  test('mode and local variants of .env are ignored', () => {
    const root = makeRoot({
      '.env': 'LEVEL=env\nA=env\n',
      '.env.local': 'LEVEL=local\nB=local\n',
      '.env.test': 'LEVEL=mode\nC=mode\n',
      '.env.test.local': 'LEVEL=modelocal\nD=modelocal\n',
    })
    const env: EnvMap = {}
    const result = loadEnvLayers([root], env)

    expect(result.env).toEqual({ LEVEL: 'env', A: 'env' })
    expect(result.files).toEqual([path.join(root, '.env')])
  })

  test('a preset processEnv key beats .env', () => {
    const root = makeRoot({ '.env': 'TOKEN=from-env\n' })
    const env: EnvMap = { TOKEN: 'from-ci' }
    const result = loadEnvLayers([root], env)

    expect(result.env.TOKEN).toBe('from-ci')
    expect(env.TOKEN).toBe('from-ci')
  })

  test('writes file-only keys into the passed processEnv and returns that object', () => {
    const root = makeRoot({ '.env': 'ONLY_IN_FILE=yes\nBLANK=\n' })
    const env: EnvMap = { PRESET: 'kept' }
    const result = loadEnvLayers([root], env)

    expect(env.ONLY_IN_FILE).toBe('yes')
    expect(env.BLANK).toBe('')
    expect(result.env).toBe(env)
    expect(result.env.PRESET).toBe('kept')
  })

  test('written lists the keys it set and leaves out preset ones', () => {
    const root = makeRoot({ '.env': 'FROM_FILE=yes\nALSO_FILE=yes\nPRESET=ignored\n' })
    const env: EnvMap = { PRESET: 'kept' }
    const result = loadEnvLayers([root], env)

    expect(result.written.sort()).toEqual(['ALSO_FILE', 'FROM_FILE'])
    expect(env.PRESET).toBe('kept')
  })

  test('written is empty when no file exists', () => {
    const result = loadEnvLayers([path.join(tmpdir(), 'lunarhue-no-such-dir')], {})

    expect(result.written).toEqual([])
  })

  test('files lists only the files that exist, in load order', () => {
    const root = makeRoot({ '.env': 'A=1\n' })
    const empty = makeSub(root, 'apps/empty', {})
    const pkg = makeSub(root, 'apps/api', { '.env': 'A=2\n' })
    const result = loadEnvLayers([root, empty, pkg], {})

    expect(result.files).toEqual([path.join(root, '.env'), path.join(pkg, '.env')])
  })

  test('a missing root returns just processEnv and no files', () => {
    const env: EnvMap = { KEEP: 'yes' }
    const result = loadEnvLayers([path.join(tmpdir(), 'lunarhue-no-such-dir')], env)

    expect(result.files).toEqual([])
    expect(result.env).toEqual({ KEEP: 'yes' })
  })

  test('a later directory wins and keys only in the first survive', () => {
    const root = makeRoot({ '.env': 'SHARED=root\nROOT_ONLY=root\n' })
    const pkg = makeSub(root, 'apps/api', { '.env': 'SHARED=pkg\nPKG_ONLY=pkg\n' })
    const env: EnvMap = {}
    const result = loadEnvLayers([root, pkg], env)

    expect(result.env.SHARED).toBe('pkg')
    expect(result.env.ROOT_ONLY).toBe('root')
    expect(result.env.PKG_ONLY).toBe('pkg')
  })

  test('a preset processEnv key beats .env in every directory', () => {
    const root = makeRoot({ '.env': 'TOKEN=root\n' })
    const pkg = makeSub(root, 'apps/api', { '.env': 'TOKEN=pkg\n' })
    const result = loadEnvLayers([root, pkg], { TOKEN: 'from-ci' })

    expect(result.env.TOKEN).toBe('from-ci')
  })
})
