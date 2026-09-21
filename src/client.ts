import { BoundaryError } from './errors'
import type { ConfigDefinition, InferSection, Section } from './types'

export { env, file } from './sources'
export { BoundaryError, ConfigError, RootNotFoundError } from './errors'
export type { ConfigDefinition, ConfigOptions, InferSection, Source } from './types'

/** Name of the global the Vite plugin defines and `serializeClient` writes. */
export const APP_CONFIG_GLOBAL = '__APP_CONFIG__'

export interface ClientConfig<S extends Section, C extends Section> {
  /** Typed like the server half so shared modules compile, but every read throws. */
  readonly server: InferSection<S>
  readonly client: InferSection<C>
  /** There is no cache to drop in the browser. Present so shared code can call it. */
  readonly reload: () => void
}

/**
 * Browser half of `defineConfig`. The client values come from the global at read
 * time, and the server half is a trap that reports which key crossed the boundary.
 */
export function defineConfig<S extends Section, C extends Section>(
  _definition: ConfigDefinition<S, C>,
): ClientConfig<S, C> {
  const server = serverTrap<S>()
  return {
    get server() {
      return server
    },
    get client() {
      return readGlobal<C>()
    },
    reload: () => {},
  }
}

function readGlobal<C extends Section>(): InferSection<C> {
  const value = (globalThis as Record<string, unknown>)[APP_CONFIG_GLOBAL]
  if (value === undefined) throw new Error(missingGlobalMessage())
  return value as InferSection<C>
}

function missingGlobalMessage(): string {
  return [
    `The client config global ${APP_CONFIG_GLOBAL} is missing.`,
    'Add the @lunarhue/config/vite plugin to your Vite config,',
    'or render the script tag from serializeClient before your app bundle runs.',
  ].join(' ')
}

function serverTrap<S extends Section>(): InferSection<S> {
  return new Proxy(
    {},
    {
      get(_target, key) {
        throw new BoundaryError(String(key))
      },
      has: () => false,
      ownKeys: () => [],
    },
  ) as InferSection<S>
}
