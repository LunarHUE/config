import type { ConfigDefinition, InferSection, LoadResult, Section } from './types'

/** Key that carries the definition back out of a `Config`, for the Vite plugin. */
export const DEFINITION: unique symbol = Symbol.for('@lunarhue/config.definition')

export interface Config<S extends Section = Section, C extends Section = Section> {
  readonly server: InferSection<S>
  readonly client: InferSection<C>
  readonly [DEFINITION]: ConfigDefinition<S, C>
}

export type InferConfig<T extends Config<any, any>> = {
  server: T['server']
  client: T['client']
}

/**
 * Wrap a definition in an object that loads on the first read of `server` or
 * `client` and caches the result for the process. Failures are not cached, so a
 * later read retries and throws again.
 */
export function createLazyConfig<S extends Section, C extends Section>(
  definition: ConfigDefinition<S, C>,
  load: (definition: ConfigDefinition<S, C>) => LoadResult<S, C>,
): Config<S, C> {
  let result: LoadResult<S, C> | undefined

  function resolve(): LoadResult<S, C> {
    if (result === undefined) result = load(definition)
    return result
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
  }
}
