import type { StandardSchemaV1 } from '@standard-schema/spec'

export type SourceKind = 'env' | 'file'

/**
 * One declared value: where it comes from and how to validate it. Each side is
 * a location, `true` to derive the location from the key's position in its
 * section, or `false` when the value never comes from that side. When both
 * sides are set the env side wins over every YAML layer.
 */
export interface Source<T = unknown> {
  /** Dotted YAML path such as `logging.level`, `true` for the key's own dotted position, or `false`. */
  readonly file: string | boolean
  /** Env var name, `true` for the upper snake case of the dotted key behind `envPrefix`, or `false`. */
  readonly env: string | boolean
  readonly schema: StandardSchemaV1<unknown, T>
}

/** Sources keyed by name. A value may be another section, which nests the result. */
export interface Section {
  [key: string]: Source | Section
}

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
  /** Prefix for derived env names, so `paths.nixosDir` with `envPrefix: 'APP'` reads `APP_PATHS_NIXOS_DIR`. */
  envPrefix?: string
}

export interface ConfigDefinition<
  S extends Section = Section,
  C extends Section = Section,
> extends ConfigOptions {
  server?: S
  client?: C
}

export type InferSection<S extends Section> = {
  [K in keyof S]: S[K] extends Source<infer T>
    ? T
    : S[K] extends Section
      ? InferSection<S[K]>
      : never
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
  /**
   * Env keys the loader set in process.env because no value was present. A
   * reload removes them first so a changed or deleted file value is picked up.
   */
  envWritten: string[]
}

/** Env vars after merging every `.env` layer with `process.env`. */
export type EnvMap = Record<string, string | undefined>

/** A parsed YAML document. Layers are merged into one of these. */
export type YamlValue =
  string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue }
