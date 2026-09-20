import type { YamlValue } from './types.js'

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
