import path from 'node:path'

import type { Plugin } from 'vite'

import { envLayerFiles } from './dotenv'
import { loadConfig } from './load'
import { type Config, DEFINITION } from './proxy'
import type { ConfigDefinition, LoadResult, Section } from './types'
import { yamlLayerFiles } from './yaml'

/** Name of the global the browser half reads. Kept in step with the one in client.ts. */
export const APP_CONFIG_GLOBAL = '__APP_CONFIG__'

/** Either half of the public API: a lazy `Config` or the definition it wraps. */
export type ConfigInput<S extends Section = Section, C extends Section = Section> =
  Config<S, C> | ConfigDefinition<S, C>

/**
 * JavaScript that assigns the client section to the global. Safe to inline in a
 * `<script>` tag, so a server that renders its own HTML can skip the plugin.
 */
export function serializeClient<S extends Section, C extends Section>(
  config: ConfigInput<S, C>,
): string {
  const { client } = loadConfig(toDefinition(config))
  return `globalThis.${APP_CONFIG_GLOBAL}=${escapeForScript(JSON.stringify(client))};`
}

export interface AppConfigOptions {
  /** Restart the dev server when a config or .env file changes. Default `true`. */
  watch?: boolean
}

/**
 * Vite plugin that bakes the client section into the bundle. The load happens in
 * the `config` hook, so errors surface while Vite resolves its config, and the
 * result is cached so a second call to the hook does not read the files again.
 * In dev the plugin restarts the server when a layer changes, which runs the
 * `config` hook again and bakes in the new values.
 */
export default function appConfig<S extends Section, C extends Section>(
  config: ConfigInput<S, C>,
  options: AppConfigOptions = {},
): Plugin {
  const watch = options.watch ?? true
  let result: LoadResult<S, C> | undefined

  function load(): LoadResult<S, C> {
    if (result === undefined) result = loadConfig(toDefinition(config))
    return result
  }

  return {
    name: 'lunarhue-config',
    config() {
      const { client } = load()
      return { define: { [`globalThis.${APP_CONFIG_GLOBAL}`]: JSON.stringify(client) } }
    },
    configureServer(server) {
      if (!watch) return
      const loaded = load()
      const isLayer = layerTest(loaded)
      server.watcher.add(loaded.files)

      const changed = (file: string): void => {
        if (!isLayer(file)) return
        // Drop the cache so the config hook reloads after the restart.
        result = undefined
        void server.restart()
      }

      for (const event of ['change', 'add', 'unlink'] as const) server.watcher.on(event, changed)
    },
  }
}

/**
 * True for a file the load read, and for any layer file name inside one of the
 * directories it read from, so a layer created later counts too.
 */
function layerTest(result: LoadResult<Section, Section>): (file: string) => boolean {
  const files = new Set(result.files)
  const dirs = new Set(result.dirs)
  const names = new Set([...envLayerFiles(result.mode), ...yamlLayerFiles(result.mode)])

  return (file) =>
    files.has(file) || (dirs.has(path.dirname(file)) && names.has(path.basename(file)))
}

function toDefinition<S extends Section, C extends Section>(
  config: ConfigInput<S, C>,
): ConfigDefinition<S, C> {
  return DEFINITION in config ? config[DEFINITION] : config
}

const UNSAFE = /[<>&\u2028\u2029]/g

const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

/** Keep a value containing `</script>` from ending the tag it is inlined in. */
function escapeForScript(json: string): string {
  return json.replace(UNSAFE, (char) => ESCAPES[char] ?? char)
}
