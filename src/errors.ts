import type { SourceKind } from './types'

export interface ConfigIssue {
  section: 'server' | 'client'
  key: string
  /** The side that supplied the value, or `none` when neither side had one. */
  source: SourceKind | 'none'
  /** The env var name or YAML path that supplied the value. Empty for `none`. */
  path: string
  /** The YAML path the key reads from, after derivation, when it has a file side. */
  file?: string
  /** The env var the key reads from, after derivation, when it has an env side. */
  env?: string
  message: string
}

/** Thrown when one or more declared values fail validation. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError'
  constructor(readonly issues: ConfigIssue[]) {
    super(formatIssues(issues))
  }
}

/** Thrown when root discovery finds no `config.default.yml`. */
export class RootNotFoundError extends Error {
  override readonly name = 'RootNotFoundError'
  constructor(readonly cwd: string) {
    super(`No config.default.yml found in ${cwd} or any parent directory`)
  }
}

/** Thrown when browser code reads a server value. */
export class BoundaryError extends Error {
  override readonly name = 'BoundaryError'
  constructor(readonly key: string) {
    super(`config.server.${key} is not available in the browser`)
  }
}

/** `(env DATABASE_URL)` for a supplied value; every declared side when nothing supplied one. */
function describeSource(issue: ConfigIssue): string {
  if (issue.source !== 'none') return `(${issue.source} ${issue.path})`
  const sides: string[] = []
  if (issue.file !== undefined) sides.push(`file ${issue.file}`)
  if (issue.env !== undefined) sides.push(`env ${issue.env}`)
  return `(${sides.join(', ')})`
}

function formatIssues(issues: ConfigIssue[]): string {
  const rows = issues.map((i) => [`${i.section}.${i.key}`, describeSource(i), i.message])
  const w0 = Math.max(...rows.map((r) => r[0]!.length))
  const w1 = Math.max(...rows.map((r) => r[1]!.length))
  const lines = rows.map((r) => `  ${r[0]!.padEnd(w0)}  ${r[1]!.padEnd(w1)}  ${r[2]}`)
  return ['Invalid config', ...lines].join('\n')
}
