import path from 'node:path'

import { loadEnvLayers } from './dotenv'
import { RootNotFoundError } from './errors'
import { resolveMode } from './mode'
import { findRoot, hasRootMarker } from './root'
import { sources } from './sources'
import type { ConfigDefinition, LoadResult, Section, YamlValue } from './types'
import { validate } from './validate'
import { loadYamlLayers } from './yaml'

/** Read every layer, validate once, and return both sections. Eager and synchronous. */
export function loadConfig<S extends Section, C extends Section>(
  definition: ConfigDefinition<S, C>,
): LoadResult<S, C> {
  const mode = resolveMode(definition.mode)
  const cwd = process.cwd()
  const dir = definition.dir === undefined ? undefined : path.resolve(cwd, definition.dir)
  const found = findConfigRoot(definition.root, dir, cwd)

  if (found === undefined && needsYaml(definition)) throw new RootNotFoundError(dir ?? cwd)

  const root = found ?? dir ?? cwd
  const dirs = dir === undefined || dir === root ? [root] : [root, dir]
  const env = loadEnvLayers(dirs, mode)
  const yaml =
    found === undefined
      ? { data: {} as { [key: string]: YamlValue }, files: [] as string[] }
      : loadYamlLayers(dirs, mode)

  const { server, client } = validate(definition, env.env, yaml.data, {
    emptyStringAsUndefined: definition.emptyStringAsUndefined ?? true,
  })

  return {
    server,
    client,
    mode,
    root,
    dirs,
    files: [...env.files, ...yaml.files],
    envWritten: env.written,
  }
}

/**
 * Find the root. An explicit `root` option wins. With a `dir` we walk up from
 * its parent, so the package's own config.default.yml is not mistaken for the
 * root, and only then fall back to `dir` itself holding the marker.
 */
function findConfigRoot(
  option: string | undefined,
  dir: string | undefined,
  cwd: string,
): string | undefined {
  if (option !== undefined) return path.resolve(cwd, option)
  if (dir === undefined) return findRoot(cwd)
  return findRoot(path.dirname(dir)) ?? (hasRootMarker(dir) ? dir : undefined)
}

/** True when any declared key reads from a YAML file, which makes the root mandatory. */
function needsYaml(definition: ConfigDefinition): boolean {
  for (const section of [definition.server, definition.client]) {
    for (const [, source] of sources(section ?? {})) if (source.kind === 'file') return true
  }
  return false
}
