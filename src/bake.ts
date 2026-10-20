import { ConfigError, type ConfigIssue } from './errors'
import { resolveLayers } from './load'
import { getPath, pickPaths } from './merge'
import { locations, sources } from './sources'
import type { ConfigDefinition, YamlObject } from './types'
import { runSchema, schemaIssues } from './validate'
import { loadYamlLayers } from './yaml'

export interface BakeResult {
  /** The merged YAML trimmed to the paths the definition reads. */
  yaml: YamlObject
  mode: string
  root: string
  dirs: string[]
  /** Every YAML file read, in load order. */
  files: string[]
}

/**
 * Read the YAML layers and keep only the subtrees the definition's file sides
 * point at, for baking into a build that has no filesystem. Values that are
 * present are validated now so a bad committed value fails the build. A key
 * with no YAML value is left for runtime, since its env side may supply it.
 */
export function bakeYaml(definition: ConfigDefinition): BakeResult {
  const { mode, root, dirs, found } = resolveLayers(definition)
  const loaded = found ? loadYamlLayers(dirs, mode) : { data: {}, files: [] }

  const paths: string[] = []
  const issues: ConfigIssue[] = []
  for (const sectionName of ['server', 'client'] as const) {
    for (const [key, source] of sources(definition[sectionName] ?? {})) {
      const where = locations(source, key, definition.envPrefix)
      if (where.file === undefined) continue
      paths.push(where.file)

      const value = getPath(loaded.data, where.file)
      if (value === undefined) continue
      const result = runSchema(sectionName, key, source, value)
      if (result.issues) {
        issues.push(...schemaIssues(sectionName, key, result.issues, 'file', where))
      }
    }
  }
  if (issues.length > 0) throw new ConfigError(issues)

  return { yaml: pickPaths(loaded.data, paths), mode, root, dirs, files: loaded.files }
}
