import fs from 'node:fs'
import path from 'node:path'

import type { EnvMap } from './types'

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Parse .env text into key/value pairs. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {}

  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim()
    if (line === '' || line.startsWith('#')) continue

    if (line.startsWith('export ')) line = line.slice('export '.length).trim()

    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    if (!KEY_RE.test(key)) continue

    out[key] = parseValue(line.slice(eq + 1).trim())
  }

  return out
}

const DOUBLE_QUOTED = /^"((?:\\.|[^"\\])*)"/
const SINGLE_QUOTED = /^'([^']*)'/

function parseValue(raw: string): string {
  if (raw.startsWith('"')) {
    const m = DOUBLE_QUOTED.exec(raw)
    if (m) return unescape(m[1]!)
  } else if (raw.startsWith("'")) {
    const m = SINGLE_QUOTED.exec(raw)
    if (m) return m[1]!
  }
  // Unquoted: everything from a whitespace-preceded # is a comment.
  return raw.replace(/\s+#.*$/, '').trim()
}

function unescape(value: string): string {
  return value.replace(/\\([nrt\\'"])/g, (_, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n'
      case 'r':
        return '\r'
      case 't':
        return '\t'
      default:
        return ch
    }
  })
}

/**
 * The env file names read in each directory. There is one: the mode lives in
 * the YAML layers, and on a server the environment itself holds the secrets.
 */
export function envLayerFiles(): string[] {
  return ['.env']
}

export interface EnvLayersResult {
  /** The merged env. Keys from `processEnv` win over every file. */
  env: EnvMap
  /** Absolute paths of the files that existed and were read, in load order. */
  files: string[]
  /** Keys this call set in `processEnv` because no value was present. */
  written: string[]
}

/**
 * Read the .env file in every directory of `dirs`, merge them (later directory
 * wins), then apply `processEnv` on top. `dirs` runs lowest precedence first.
 * Writes file values into `processEnv` for keys it does not already have, so
 * code that reads process.env directly sees them.
 *
 * The returned `env` is the `processEnv` object itself, after that mutation.
 */
export function loadEnvLayers(dirs: string[], processEnv: EnvMap = process.env): EnvLayersResult {
  const files: string[] = []
  const merged: Record<string, string> = {}
  const names = envLayerFiles()

  for (const dir of dirs) {
    for (const name of names) {
      const file = path.resolve(dir, name)
      let text: string
      try {
        text = fs.readFileSync(file, 'utf8')
      } catch {
        continue
      }
      files.push(file)
      Object.assign(merged, parseDotenv(text))
    }
  }

  const written: string[] = []
  for (const [key, value] of Object.entries(merged)) {
    if (key in processEnv) continue
    processEnv[key] = value
    written.push(key)
  }

  return { env: processEnv, files, written }
}
