import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Section, Source } from './types'

/** Read one key from the merged env layers. */
export function env<T>(name: string, schema: StandardSchemaV1<unknown, T>): Source<T> {
  return { kind: 'env', path: name, schema }
}

/** Read a dotted path such as `logging.level` from the merged YAML layers. */
export function file<T>(path: string, schema: StandardSchemaV1<unknown, T>): Source<T> {
  return { kind: 'file', path, schema }
}

/** True for a leaf made by `env` or `file`, false for a nested section. */
export function isSource(value: Source | Section): value is Source {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'schema' in value &&
    '~standard' in value.schema
  )
}

/** Every source in a section, depth first, with its dotted key. */
export function* sources(section: Section, prefix = ''): Generator<[key: string, source: Source]> {
  for (const [name, value] of Object.entries(section)) {
    const key = prefix + name
    if (isSource(value)) yield [key, value]
    else yield* sources(value, key + '.')
  }
}
