import fs from 'node:fs'
import path from 'node:path'

export const ROOT_MARKER = 'config.default.yml'

/** Walk up from `cwd` and return the first directory containing config.default.yml, or undefined. */
export function findRoot(cwd: string): string | undefined {
  let dir = path.resolve(cwd)
  for (;;) {
    const marker = fs.statSync(path.join(dir, ROOT_MARKER), { throwIfNoEntry: false })
    if (marker?.isFile()) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/** True when `dir` itself holds the root marker. */
export function hasRootMarker(dir: string): boolean {
  return fs.statSync(path.join(dir, ROOT_MARKER), { throwIfNoEntry: false })?.isFile() ?? false
}
