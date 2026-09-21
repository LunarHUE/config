import type { StandardSchemaV1 } from '@standard-schema/spec'

export type SourceKind = 'env' | 'file'

/** One declared value: where it comes from and how to validate it. */
export interface Source<T = unknown> {
  readonly kind: SourceKind
  /** Env var name for `env`, dotted YAML path for `file`. */
  readonly path: string
  readonly schema: StandardSchemaV1<unknown, T>
}

export type Section = Record<string, Source>

export interface ConfigOptions {
  /** Skip root discovery and use this directory. */
  root?: string
  /**
   * Directory of the package that owns this definition, usually
   * `import.meta.dirname`. Its config and .env files load after the root's.
   * Relative paths resolve against the cwd.
   */
  dir?: string
  /** Override `APP_ENV` and `NODE_ENV`. */
  mode?: string
  /** Treat empty env values as `undefined` before validation. Default `true`. */
  emptyStringAsUndefined?: boolean
}

export interface ConfigDefinition<
  S extends Section = Section,
  C extends Section = Section,
> extends ConfigOptions {
  server?: S
  client?: C
}

export type InferSection<S extends Section> = {
  [K in keyof S]: S[K] extends Source<infer T> ? T : never
}

export interface LoadResult<S extends Section = Section, C extends Section = Section> {
  server: InferSection<S>
  client: InferSection<C>
  mode: string
  root: string
  /** The directories the loader read from, lowest precedence first. */
  dirs: string[]
  /** Every file the loader read, in load order. */
  files: string[]
}

/** Env vars after merging every `.env` layer with `process.env`. */
export type EnvMap = Record<string, string | undefined>

/** A parsed YAML document. Layers are merged into one of these. */
export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [key: string]: YamlValue }
