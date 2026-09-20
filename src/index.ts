import { loadConfig } from './load'
import { type Config, createLazyConfig } from './proxy'
import type { ConfigDefinition, Section } from './types'

export { loadConfig } from './load'
export { env, file } from './sources'
export { BoundaryError, ConfigError, RootNotFoundError } from './errors'
export { DEFINITION } from './proxy'
export type { Config, InferConfig } from './proxy'
export type { ConfigIssue } from './errors'
export type {
  ConfigDefinition,
  ConfigOptions,
  InferSection,
  LoadResult,
  Source,
} from './types'

/** Declare the config. Nothing is read until `server` or `client` is first accessed. */
export function defineConfig<S extends Section, C extends Section>(
  definition: ConfigDefinition<S, C>,
): Config<S, C> {
  return createLazyConfig(definition, loadConfig)
}
