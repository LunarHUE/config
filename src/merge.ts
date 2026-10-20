import type { YamlObject, YamlValue } from './types'

function isObject(value: YamlValue | undefined): value is YamlObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clone(value: YamlValue): YamlValue {
  if (Array.isArray(value)) return value.map(clone)
  if (isObject(value)) {
    const out: YamlObject = {}
    for (const [key, child] of Object.entries(value)) out[key] = clone(child)
    return out
  }
  return value
}

/** Deep merge `override` into `base` following the layer rules. Returns a new value; never mutates inputs. */
export function merge(base: YamlValue, override: YamlValue): YamlValue {
  if (!isObject(base) || !isObject(override)) return clone(override)

  const out: YamlObject = {}
  for (const [key, value] of Object.entries(base)) out[key] = clone(value)
  for (const [key, value] of Object.entries(override)) {
    const lower = out[key]
    out[key] = lower === undefined ? clone(value) : merge(lower, value)
  }
  return out
}

/** Read a dotted path such as `logging.level` from a merged document. Returns undefined when any segment is missing. */
export function getPath(doc: YamlValue, path: string): YamlValue | undefined {
  if (path === '') return doc

  let current: YamlValue = doc
  for (const segment of path.split('.')) {
    if (!isObject(current)) return undefined
    const next = current[segment]
    if (next === undefined) return undefined
    current = next
  }
  return current
}

/** Write `value` at a dotted path, creating objects along the way. Mutates `doc`. */
export function setPath(doc: YamlObject, path: string, value: YamlValue): void {
  const segments = path.split('.')
  let current: YamlObject = doc
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment]
    if (!isObject(next)) {
      const created: YamlObject = {}
      current[segment] = created
      current = created
    } else {
      current = next
    }
  }
  current[segments[segments.length - 1]!] = value
}

/** A copy of `doc` holding only the subtrees at `paths`. Paths with no value are left out. */
export function pickPaths(doc: YamlObject, paths: Iterable<string>): YamlObject {
  const out: YamlObject = {}
  for (const path of paths) {
    const value = getPath(doc, path)
    if (value !== undefined) setPath(out, path, clone(value))
  }
  return out
}
