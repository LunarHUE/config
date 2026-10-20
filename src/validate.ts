import type { StandardSchemaV1 } from '@standard-schema/spec'
import { ConfigError, type ConfigIssue } from './errors'
import { getPath } from './merge'
import { parseScalar } from './scalar'
import { isSource, type Locations, locations } from './sources'
import type {
  ConfigDefinition,
  EnvValues,
  InferSection,
  Section,
  Source,
  SourceKind,
  YamlObject,
} from './types'

export interface ValidateOptions {
  emptyStringAsUndefined: boolean
  envPrefix?: string | undefined
}

type SectionName = 'server' | 'client'

/** The raw value for one key and which side it came from. */
interface Picked {
  value: unknown
  source: SourceKind | 'none'
  path: string
}

/**
 * Validate every declared key in both sections and collect the failures into a
 * single ConfigError. Runs once, after the env and YAML layers are merged.
 */
export function validate<S extends Section, C extends Section>(
  definition: ConfigDefinition<S, C>,
  env: EnvValues,
  yaml: YamlObject,
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
  env: EnvValues,
  yaml: YamlObject,
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

    const where = locations(source, key, options.envPrefix)
    const picked = pick(where, env, yaml, options)
    const result = runSchema(section, key, source, picked.value)

    if (result.issues) {
      issues.push(...schemaIssues(section, key, result.issues, picked.source, where))
      continue
    }

    out[name] = result.value
  }

  return out
}

/** Turn the issues one schema run produced into ConfigIssues for the key at `where`. */
export function schemaIssues(
  section: SectionName,
  key: string,
  issues: readonly StandardSchemaV1.Issue[],
  source: SourceKind | 'none',
  where: Locations,
): ConfigIssue[] {
  return issues.map((issue) => {
    const suffix = dottedPath(issue.path)
    const path = source === 'env' ? where.env! : source === 'file' ? where.file! + suffix : ''
    return {
      section,
      key: key + suffix,
      source,
      path,
      ...(where.file === undefined ? {} : { file: where.file + suffix }),
      ...(where.env === undefined ? {} : { env: where.env }),
      message: issue.message,
    }
  })
}

/**
 * Env wins when set. A string env value for a key that also lives in YAML is
 * read as a YAML scalar; a non-string binding passes through as it is.
 */
function pick(
  where: Locations,
  env: EnvValues,
  yaml: YamlObject,
  options: ValidateOptions,
): Picked {
  if (where.env !== undefined) {
    let value = env[where.env]
    if (options.emptyStringAsUndefined && value === '') value = undefined
    if (value !== undefined) {
      return {
        value: where.file !== undefined && typeof value === 'string' ? parseScalar(value) : value,
        source: 'env',
        path: where.env,
      }
    }
  }
  if (where.file !== undefined) {
    const value = getPath(yaml, where.file)
    if (value !== undefined) return { value, source: 'file', path: where.file }
  }
  return { value: undefined, source: 'none', path: '' }
}

export function runSchema(
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
