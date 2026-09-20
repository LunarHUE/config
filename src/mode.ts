import type { EnvMap } from './types.js'

export const DEFAULT_MODE = 'development'

/** Resolve the mode: explicit option, then APP_ENV, then NODE_ENV, then 'development'. */
export function resolveMode(option: string | undefined, env: EnvMap = process.env): string {
  return clean(option) ?? clean(env.APP_ENV) ?? clean(env.NODE_ENV) ?? DEFAULT_MODE
}

/** Trim and treat an empty value as unset, so `APP_ENV=""` falls through. */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
