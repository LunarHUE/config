import fs from 'node:fs'
import path from 'node:path'

import { envLayerFiles } from './dotenv'
import { type Config, RESULT } from './proxy'
import { yamlLayerFiles } from './yaml'

export interface WatchOptions {
  /** Called after a reload has been triggered by a file change. Receives the changed path. */
  onChange?: (file: string) => void
  /** Called when the reload's next load throws, for example a validation failure. Default: rethrow on the next read as usual, log nothing. */
  onError?: (error: unknown) => void
  /** Debounce window in milliseconds. Default 50. */
  debounce?: number
}

/** Watch every directory the config reads from and call `config.reload()` when a config or .env file changes. Returns a function that stops watching. */
export function watchConfig(config: Config, options: WatchOptions = {}): () => void {
  const wait = options.debounce ?? 50

  // Force a load so the directories and the mode are known.
  void config.server
  const result = config[RESULT]
  if (result === undefined) return () => {}

  const names = new Set([...envLayerFiles(result.mode), ...yamlLayerFiles(result.mode)])
  const watchers: fs.FSWatcher[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  function reload(file: string): void {
    if (stopped) return
    config.reload()
    try {
      // Load now so a broken config reaches onError instead of the next reader.
      void config.server
    } catch (error) {
      options.onError?.(error)
      return
    }
    options.onChange?.(file)
  }

  function schedule(file: string): void {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      reload(file)
    }, wait)
    timer.unref?.()
  }

  for (const dir of result.dirs) {
    let watcher: fs.FSWatcher
    try {
      // Watching the directory rather than the files catches a layer that does not exist yet.
      watcher = fs.watch(dir, { persistent: false })
    } catch {
      continue
    }
    watcher.unref?.()
    watcher.on('error', () => {})
    watcher.on('change', (_event, filename) => {
      if (stopped || filename === null) return
      const name = path.basename(String(filename))
      if (names.has(name)) schedule(path.join(dir, name))
    })
    watchers.push(watcher)
  }

  return () => {
    stopped = true
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    for (const watcher of watchers) watcher.close()
  }
}
