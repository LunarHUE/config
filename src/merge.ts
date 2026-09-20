import type { YamlValue } from './types'

type YamlObject = { [key: string]: YamlValue }

function isObject(value: YamlValue): value is YamlObject {
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
