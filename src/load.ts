import path from 'node:path'

import { loadEnvLayers } from './dotenv'
import { RootNotFoundError } from './errors'
import { resolveMode } from './mode'
import { findRoot, hasRootMarker } from './root'
import { sources } from './sources'
import type { ConfigDefinition, LoadResult, Section } from './types'
import { validate } from './validate'
import { loadYamlLayers } from './yaml'

/** Read every layer, validate once, and return both sections. Eager and synchronous. */
export function loadConfig<S extends Section, C extends Section>(
  definition: ConfigDefinition<S, C>,
): LoadResult<S, C> {
  const { mode, root, dirs, found } = resolveLayers(definition)
  const env = loadEnvLayers(dirs)
  const yaml = found ? loadYamlLayers(dirs, mode) : { data: {}, files: [] }

  const { server, client } = validate(definition, env.env, yaml.data, {
    emptyStringAsUndefined: definition.emptyStringAsUndefined ?? true,
    envPrefix: definition.envPrefix,
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

export interface Layers {
  mode: string
  root: string
  /** Lowest precedence first: the root, then `dir` when it is a different directory. */
  dirs: string[]
  /** False when no root marker exists and the definition needs none. */
  found: boolean
}

/**
 * Work out the mode and the directories the layers come from. Shared by the
 * loader and the baker so both read the same files.
 */
export function resolveLayers(definition: ConfigDefinition): Layers {
  const mode = resolveMode(definition.mode)
  const cwd = process.cwd()
  const dir = definition.dir === undefined ? undefined : path.resolve(cwd, definition.dir)
  const found = findConfigRoot(definition.root, dir, cwd)

  if (found === undefined && needsYaml(definition)) throw new RootNotFoundError(dir ?? cwd)

  const root = found ?? dir ?? cwd
  const dirs = dir === undefined || dir === root ? [root] : [root, dir]
  return { mode, root, dirs, found: found !== undefined }
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
    for (const [, source] of sources(section ?? {})) if (source.file !== false) return true
  }
  return false
}
