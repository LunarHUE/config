import { env as bindings } from 'cloudflare:workers'

import { type BakedConfig, createBakedConfig, readBakedYaml } from './baked'
import type { ConfigDefinition, EnvValues, Section } from './types'

export { APP_CONFIG_YAML_GLOBAL } from './baked'
export { env, field, file } from './sources'
export { BoundaryError, ConfigError, RootNotFoundError } from './errors'
export type { BakedConfig } from './baked'
export type { ConfigIssue } from './errors'
export type { FieldOptions } from './sources'
export type { ConfigDefinition, ConfigOptions, InferSection, Source } from './types'

/**
 * Cloudflare Workers half of `defineConfig`. YAML comes from the global the
 * Vite plugin baked in; env sides resolve against the Worker's bindings, read
 * through `cloudflare:workers` so nothing has to be threaded in from `fetch`.
 */
export function defineConfig<S extends Section, C extends Section>(
  definition: ConfigDefinition<S, C>,
): BakedConfig<S, C> {
  return createBakedConfig(definition, {
    yaml: readBakedYaml,
    env: () => bindings as EnvValues,
  })
}
