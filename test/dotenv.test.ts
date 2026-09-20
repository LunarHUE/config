import { describe, expect, test } from 'bun:test'
import { parseDotenv } from '../src/dotenv.js'

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
