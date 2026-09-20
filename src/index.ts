import { loadConfig } from './load.js'
import { type Config, createLazyConfig } from './proxy.js'
import type { ConfigDefinition, Section } from './types.js'

export { loadConfig } from './load.js'
export { env, file } from './sources.js'
export { BoundaryError, ConfigError, RootNotFoundError } from './errors.js'
export { DEFINITION } from './proxy.js'
export type { Config, InferConfig } from './proxy.js'
export type { ConfigIssue } from './errors.js'
export type {
  ConfigDefinition,
  ConfigOptions,
  InferSection,
  LoadResult,
  Source,
} from './types.js'

/** Declare the config. Nothing is read until `server` or `client` is first accessed. */
export function defineConfig<S extends Section, C extends Section>(
  definition: ConfigDefinition<S, C>,
): Config<S, C> {
  return createLazyConfig(definition, loadConfig)
}
