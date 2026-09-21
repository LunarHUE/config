import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { merge } from './merge'
import type { YamlValue } from './types'

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

export interface YamlLayersResult {
  data: { [key: string]: YamlValue }
  /** Absolute paths of the files that existed and were read, in load order. */
  files: string[]
}

/**
 * Read and merge the YAML layers in every directory of `dirs`, lowest
 * precedence first. Missing files are skipped.
 */
export function loadYamlLayers(dirs: string[], mode: string): YamlLayersResult {
  let data: { [key: string]: YamlValue } = {}
  const files: string[] = []
  const names = yamlLayerFiles(mode)

  for (const dir of dirs) {
    for (const name of names) {
      const file = resolve(dir, name)
      const text = read(file)
      if (text === undefined) continue
      data = merge(data, parseYamlDocument(text, file)) as { [key: string]: YamlValue }
      files.push(file)
    }
  }

  return { data, files }
}

function read(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined
    throw error
  }
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return 'a sequence'
  return `a ${typeof value}`
}
