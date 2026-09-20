import path from 'node:path'

import { loadEnvLayers } from './dotenv.js'
import { RootNotFoundError } from './errors.js'
import { resolveMode } from './mode.js'
import { findRoot } from './root.js'
import type { ConfigDefinition, LoadResult, Section, YamlValue } from './types.js'
import { validate } from './validate.js'
import { loadYamlLayers } from './yaml.js'

/** Read every layer, validate once, and return both sections. Eager and synchronous. */
export function loadConfig<S extends Section, C extends Section>(
  definition: ConfigDefinition<S, C>,
): LoadResult<S, C> {
  const mode = resolveMode(definition.mode)
  const cwd = process.cwd()
  const found = definition.root === undefined ? findRoot(cwd) : path.resolve(cwd, definition.root)

  if (found === undefined && needsYaml(definition)) throw new RootNotFoundError(cwd)

  const root = found ?? cwd
  const env = loadEnvLayers(root, mode)
  const yaml =
    found === undefined
      ? { data: {} as { [key: string]: YamlValue }, files: [] as string[] }
      : loadYamlLayers(root, mode)

  const { server, client } = validate(definition, env.env, yaml.data, {
    emptyStringAsUndefined: definition.emptyStringAsUndefined ?? true,
  })

  return { server, client, mode, root, files: [...env.files, ...yaml.files] }
}

/** True when any declared key reads from a YAML file, which makes the root mandatory. */
function needsYaml(definition: ConfigDefinition): boolean {
  const sources = [
    ...Object.values(definition.server ?? {}),
    ...Object.values(definition.client ?? {}),
  ]
  return sources.some((source) => source.kind === 'file')
}
