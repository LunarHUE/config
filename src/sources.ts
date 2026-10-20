import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Section, Source } from './types'

export interface FieldOptions {
  /**
   * Where in the merged YAML the value lives. Default `true`: the key's own
   * dotted position in its section, so `server.paths.nixosDir` reads
   * `paths.nixosDir`. A string overrides that path. `false` means YAML never
   * supplies the value.
   */
  file?: string | boolean
  /**
   * Env var that overrides the YAML value. Default `false`. A string names the
   * var. `true` derives it from the dotted key: upper snake case, behind
   * `envPrefix` when one is set, so `paths.nixosDir` reads `PATHS_NIXOS_DIR`.
   */
  env?: string | boolean
}

/**
 * Read a value from the YAML layers at the key's own position, with an optional
 * env override. `env()` and `file()` are the single-sided forms.
 */
export function field<T>(schema: StandardSchemaV1<unknown, T>, options: FieldOptions = {}): Source<T> {
  const source = { file: options.file ?? true, env: options.env ?? false, schema }
  if (source.file === false && source.env === false) {
    throw new Error('field() needs a file side or an env side; both are off')
  }
  return source
}

/** Read one key from the merged env layers. Never read from YAML. */
export function env<T>(name: string, schema: StandardSchemaV1<unknown, T>): Source<T> {
  return { file: false, env: name, schema }
}

/** Read a dotted path such as `logging.level` from the merged YAML layers. Never read from env. */
export function file<T>(path: string, schema: StandardSchemaV1<unknown, T>): Source<T> {
  return { file: path, env: false, schema }
}

/** True for a leaf made by `field`, `env` or `file`, false for a nested section. */
export function isSource(value: Source | Section): value is Source {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schema' in value &&
    // Arktype schemas are callable, so a function counts too.
    (typeof value.schema === 'object' || typeof value.schema === 'function') &&
    value.schema !== null &&
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

/** The concrete YAML path and env name a source reads from, after derivation. */
export interface Locations {
  file?: string
  env?: string
}

/** Resolve `true` sides against the dotted key the source sits at. */
export function locations(source: Source, key: string, envPrefix?: string): Locations {
  const out: Locations = {}
  if (source.file === true) out.file = key
  else if (source.file !== false) out.file = source.file
  if (source.env === true) out.env = deriveEnvName(key, envPrefix)
  else if (source.env !== false) out.env = source.env
  return out
}

/** `paths.nixosDir` becomes `PATHS_NIXOS_DIR`, or `APP_PATHS_NIXOS_DIR` with the prefix `APP`. */
export function deriveEnvName(key: string, prefix?: string): string {
  const name = key
    .split('.')
    .map((segment) =>
      segment
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .toUpperCase(),
    )
    .join('_')
  return prefix ? `${prefix}_${name}` : name
}
