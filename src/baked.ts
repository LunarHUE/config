import type { ConfigDefinition, EnvValues, InferSection, Section, YamlObject } from './types'
import { validate } from './validate'

/** Name of the global the Vite plugin defines in server environments with the baked YAML. */
export const APP_CONFIG_YAML_GLOBAL = '__APP_CONFIG_YAML__'

export interface BakedConfig<S extends Section = Section, C extends Section = Section> {
  readonly server: InferSection<S>
  readonly client: InferSection<C>
  /** There are no files to re-read, so this does nothing. Present so shared code can call it. */
  readonly reload: () => void
}

export interface BakedSources {
  /** The merged YAML the build baked in. */
  yaml: () => YamlObject
  /** The env the key's env sides resolve against, for example Worker bindings. */
  env: () => EnvValues
}

/**
 * A lazy config for a runtime without a filesystem. The first read of `server`
 * or `client` validates the baked YAML and the env together and caches the
 * result. A failed load is not cached, so the next read tries again.
 */
export function createBakedConfig<S extends Section, C extends Section>(
  definition: ConfigDefinition<S, C>,
  sources: BakedSources,
): BakedConfig<S, C> {
  let result: { server: InferSection<S>; client: InferSection<C> } | undefined

  function resolve() {
    if (result === undefined) {
      result = validate(definition, sources.env(), sources.yaml(), {
        emptyStringAsUndefined: definition.emptyStringAsUndefined ?? true,
        envPrefix: definition.envPrefix,
      })
    }
    return result
  }

  return {
    get server() {
      return resolve().server
    },
    get client() {
      return resolve().client
    },
    reload: () => {},
  }
}

/**
 * Read the baked YAML the Vite plugin defined, with a pointer at the plugin when
 * it is missing. The member expression is spelled out because `define` only
 * substitutes a literal `globalThis.__APP_CONFIG_YAML__`; an indexed read
 * through the constant would be left alone and always miss.
 */
export function readBakedYaml(): YamlObject {
  const value = (globalThis as { __APP_CONFIG_YAML__?: unknown }).__APP_CONFIG_YAML__
  if (value === undefined) {
    throw new Error(
      [
        `The baked config global ${APP_CONFIG_YAML_GLOBAL} is missing.`,
        'Add the @lunarhue/config/vite plugin to your Vite config so the build',
        'defines it for server environments such as a Cloudflare Worker.',
      ].join(' '),
    )
  }
  return value as YamlObject
}
