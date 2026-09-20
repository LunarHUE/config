import type { SourceKind } from './types.js'

export interface ConfigIssue {
  section: 'server' | 'client'
  key: string
  source: SourceKind
  path: string
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

function formatIssues(issues: ConfigIssue[]): string {
  const rows = issues.map((i) => [`${i.section}.${i.key}`, `(${i.source} ${i.path})`, i.message])
  const w0 = Math.max(...rows.map((r) => r[0]!.length))
  const w1 = Math.max(...rows.map((r) => r[1]!.length))
  const lines = rows.map((r) => `  ${r[0]!.padEnd(w0)}  ${r[1]!.padEnd(w1)}  ${r[2]}`)
  return ['Invalid config', ...lines].join('\n')
}
