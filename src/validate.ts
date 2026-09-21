import type { StandardSchemaV1 } from '@standard-schema/spec'
import { ConfigError, type ConfigIssue } from './errors'
import { getPath } from './merge'
import { isSource } from './sources'
import type { ConfigDefinition, EnvMap, InferSection, Section, Source, YamlValue } from './types'

export interface ValidateOptions {
  emptyStringAsUndefined: boolean
}

type SectionName = 'server' | 'client'

/**
 * Validate every declared key in both sections and collect the failures into a
 * single ConfigError. Runs once, after the env and YAML layers are merged.
 */
export function validate<S extends Section, C extends Section>(
  definition: ConfigDefinition<S, C>,
  env: EnvMap,
  yaml: { [key: string]: YamlValue },
  options: ValidateOptions,
): { server: InferSection<S>; client: InferSection<C> } {
  const issues: ConfigIssue[] = []
  const server = validateSection('server', definition.server, env, yaml, options, issues)
  const client = validateSection('client', definition.client, env, yaml, options, issues)

  if (issues.length > 0) throw new ConfigError(issues)

  return { server: server as InferSection<S>, client: client as InferSection<C> }
}

function validateSection(
  section: SectionName,
  keys: Section | undefined,
  env: EnvMap,
  yaml: { [key: string]: YamlValue },
  options: ValidateOptions,
  issues: ConfigIssue[],
  prefix = '',
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!keys) return out

  for (const [name, source] of Object.entries(keys)) {
    const key = prefix + name
    if (!isSource(source)) {
      out[name] = validateSection(section, source, env, yaml, options, issues, key + '.')
      continue
    }

    const result = runSchema(section, key, source, pick(source, env, yaml, options))

    if (result.issues) {
      for (const issue of result.issues) {
        const suffix = dottedPath(issue.path)
        issues.push({
          section,
          key: key + suffix,
          source: source.kind,
          path: source.path + suffix,
          message: issue.message,
        })
      }
      continue
    }

    out[name] = result.value
  }

  return out
}

function pick(
  source: Source,
  env: EnvMap,
  yaml: { [key: string]: YamlValue },
  options: ValidateOptions,
): unknown {
  if (source.kind === 'env') {
    const value = env[source.path]
    return options.emptyStringAsUndefined && value === '' ? undefined : value
  }
  return getPath(yaml, source.path)
}

function runSchema(
  section: SectionName,
  key: string,
  source: Source,
  value: unknown,
): StandardSchemaV1.Result<unknown> {
  const result = source.schema['~standard'].validate(value)
  if (result instanceof Promise) {
    throw new Error(
      `Async schemas are not supported: ${section}.${key} returned a Promise from validate()`,
    )
  }
  return result
}

/** Turn a Standard Schema issue path into a dotted suffix such as `.auth.signInPath`. */
function dottedPath(path: StandardSchemaV1.Issue['path']): string {
  if (!path || path.length === 0) return ''
  const segments = path.map((segment) =>
    String(typeof segment === 'object' && segment !== null ? segment.key : segment),
  )
  return `.${segments.join('.')}`
}
