import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Source } from './types'

/** Read one key from the merged env layers. */
export function env<T>(name: string, schema: StandardSchemaV1<unknown, T>): Source<T> {
  return { kind: 'env', path: name, schema }
}

/** Read a dotted path such as `logging.level` from the merged YAML layers. */
export function file<T>(path: string, schema: StandardSchemaV1<unknown, T>): Source<T> {
  return { kind: 'file', path, schema }
}
