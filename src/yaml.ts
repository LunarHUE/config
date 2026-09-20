import { parse } from 'yaml'
import type { YamlValue } from './types.js'

// The core schema keeps `yes`/`no`/`on`/`off` and dates as strings, unlike YAML 1.1.
// Merge keys (`<<`) stay off, so layering is the only thing that combines mappings.
const parseOptions = { schema: 'core', merge: false } as const

/** Parse one YAML document. An empty file is `{}`. A non-object top level throws with the file path in the message. */
export function parseYamlDocument(text: string, file: string): { [key: string]: YamlValue } {
  let parsed: unknown
  try {
    parsed = parse(text, parseOptions)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`Failed to parse ${file}: ${message}`, { cause })
  }

  if (parsed === null || parsed === undefined) return {}
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected a mapping at the top level of ${file}, got ${describe(parsed)}`)
  }
  return parsed as { [key: string]: YamlValue }
}

/** File names for a mode, lowest precedence first. */
export function yamlLayerFiles(mode: string): string[] {
  const names = ['config.default.yml', `config.${mode}.yml`, 'config.local.yml']
  // A mode of `default` or `local` would otherwise name the same file twice.
  return [...new Set(names)]
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return 'a sequence'
  return `a ${typeof value}`
}
