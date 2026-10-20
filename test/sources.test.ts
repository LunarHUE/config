import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { deriveEnvName, env, field, file, locations } from '../src/sources'

describe('sources', () => {
  test('env records the var name and schema with no file side', () => {
    const schema = z.string()
    expect(env('DATABASE_URL', schema)).toEqual({ file: false, env: 'DATABASE_URL', schema })
  })

  test('file records the dotted path and schema with no env side', () => {
    const schema = z.number()
    expect(file('logging.level', schema)).toEqual({ file: 'logging.level', env: false, schema })
  })

  test('field defaults to a derived file side and no env side', () => {
    const schema = z.string()
    expect(field(schema)).toEqual({ file: true, env: false, schema })
    expect(field(schema, { env: 'X' })).toEqual({ file: true, env: 'X', schema })
    expect(field(schema, { env: true, file: 'a.b' })).toEqual({ file: 'a.b', env: true, schema })
  })

  test('field refuses to have both sides off', () => {
    expect(() => field(z.string(), { file: false })).toThrow(/both are off/)
  })
})

describe('locations', () => {
  const schema = z.string()

  test('a derived file side is the dotted key', () => {
    expect(locations(field(schema), 'paths.nixosDir')).toEqual({ file: 'paths.nixosDir' })
  })

  test('a derived env side is the upper snake case of the key behind the prefix', () => {
    expect(locations(field(schema, { env: true }), 'paths.nixosDir')).toEqual({
      file: 'paths.nixosDir',
      env: 'PATHS_NIXOS_DIR',
    })
    expect(locations(field(schema, { env: true }), 'paths.nixosDir', 'APP')).toEqual({
      file: 'paths.nixosDir',
      env: 'APP_PATHS_NIXOS_DIR',
    })
  })

  test('explicit sides pass through untouched', () => {
    expect(locations(env('DATABASE_URL', schema), 'database.url', 'APP')).toEqual({
      env: 'DATABASE_URL',
    })
    expect(locations(file('old.place', schema), 'database.url')).toEqual({ file: 'old.place' })
  })
})

describe('deriveEnvName', () => {
  test.each([
    ['port', 'PORT'],
    ['poolMax', 'POOL_MAX'],
    ['paths.nixosDir', 'PATHS_NIXOS_DIR'],
    ['apiURL', 'API_URL'],
    ['oauth.URLPath', 'OAUTH_URL_PATH'],
    ['oauthV2Url', 'OAUTH_V2_URL'],
    ['some-key', 'SOME_KEY'],
  ])('%s -> %s', (key, name) => {
    expect(deriveEnvName(key)).toBe(name)
  })
})
