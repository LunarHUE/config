import { loadConfig } from './load'
import { type Config, DEFINITION } from './proxy'
import type { ConfigDefinition, Section } from './types'

/** Name of the global the browser half reads. Kept in step with the one in client.ts. */
export const APP_CONFIG_GLOBAL = '__APP_CONFIG__'

/** Either half of the public API: a lazy `Config` or the definition it wraps. */
export type ConfigInput<S extends Section = Section, C extends Section = Section> =
  | Config<S, C>
  | ConfigDefinition<S, C>

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
