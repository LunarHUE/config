import { describe, expect, test } from 'vitest'
import { parseScalar } from '../src/scalar'

describe('parseScalar', () => {
  test.each<[string, unknown]>([
    ['8080', 8080],
    ['-3', -3],
    ['+7', 7],
    ['0.5', 0.5],
    ['.5', 0.5],
    ['1e3', 1000],
    ['0x1f', 31],
    ['0o17', 15],
    ['true', true],
    ['False', false],
    ['null', null],
    ['~', null],
    ['.inf', Infinity],
    ['-.inf', -Infinity],
    ['api', 'api'],
    ['postgres://localhost/app', 'postgres://localhost/app'],
    ['yes', 'yes'],
    ['2024-01-01', '2024-01-01'],
    ['"8080"', '8080'],
    ["'true'", 'true'],
    ['"a', '"a'],
    ['1_000', '1_000'],
  ])('%s', (text, value) => {
    expect(parseScalar(text)).toEqual(value)
  })

  test('.nan is NaN', () => {
    expect(parseScalar('.nan')).toBeNaN()
  })
})
