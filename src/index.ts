import { loadConfig } from './load'
import { type Config, createLazyConfig } from './proxy'
import type { ConfigDefinition, Section } from './types'

export { loadConfig } from './load'
export { bakeYaml } from './bake'
export type { BakeResult } from './bake'
export { env, field, file } from './sources'
export { BoundaryError, ConfigError, RootNotFoundError } from './errors'
export { DEFINITION, RESULT } from './proxy'
export { watchConfig } from './watch'
export type { Config, InferConfig } from './proxy'
export type { ConfigIssue } from './errors'
export type { WatchOptions } from './watch'
export type { FieldOptions } from './sources'
export type {
  ConfigDefinition,
  ConfigOptions,
  EnvValues,
  InferSection,
  LoadResult,
  Source,
  YamlObject,
  YamlValue,
} from './types'

/** Declare the config. Nothing is read until `server` or `client` is first accessed. */
export function defineConfig<S extends Section, C extends Section>(
  definition: ConfigDefinition<S, C>,
): Config<S, C> {
  return createLazyConfig(definition, loadConfig)
}
