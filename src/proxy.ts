import type { ConfigDefinition, EnvMap, InferSection, LoadResult, Section } from './types'

/** Key that carries the definition back out of a `Config`, for the Vite plugin. */
export const DEFINITION: unique symbol = Symbol.for('@lunarhue/config.definition')

/** Key that hands the cached `LoadResult` to `watchConfig`. Undefined before the first load. */
export const RESULT: unique symbol = Symbol.for('@lunarhue/config.result')

export interface Config<S extends Section = Section, C extends Section = Section> {
  readonly server: InferSection<S>
  readonly client: InferSection<C>
  readonly [DEFINITION]: ConfigDefinition<S, C>
  readonly [RESULT]: LoadResult<S, C> | undefined
  /** Drop the cached result so the next read of `server` or `client` loads again. */
  readonly reload: () => void
}

export type InferConfig<T extends Config<any, any>> = {
  server: T['server']
  client: T['client']
}

/**
 * Wrap a definition in an object that loads on the first read of `server` or
 * `client` and caches the result for the process. Failures are not cached, so a
 * later read retries and throws again.
 *
 * `processEnv` is the object `reload` cleans up after. It must be the same one
 * `load` writes into.
 */
export function createLazyConfig<S extends Section, C extends Section>(
  definition: ConfigDefinition<S, C>,
  load: (definition: ConfigDefinition<S, C>) => LoadResult<S, C>,
  processEnv: EnvMap = process.env,
): Config<S, C> {
  let result: LoadResult<S, C> | undefined
  let written = new Map<string, string | undefined>()

  function resolve(): LoadResult<S, C> {
    if (result === undefined) {
      const loaded = load(definition)
      written = new Map(loaded.envWritten.map((key) => [key, processEnv[key]]))
      result = loaded
    }
    return result
  }

  function reload(): void {
    if (result === undefined) return
    // Anything the app or a shell changed since the load stays as it is.
    for (const [key, value] of written) {
      if (processEnv[key] === value) delete processEnv[key]
    }
    written = new Map()
    result = undefined
  }

  return {
    get server() {
      return resolve().server
    },
    get client() {
      return resolve().client
    },
    get [DEFINITION]() {
      return definition
    },
    get [RESULT]() {
      return result
    },
    reload,
  }
}
