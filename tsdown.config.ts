import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/worker.ts', 'src/vite.ts'],
  format: ['esm'],
  dts: true,
  platform: 'neutral',
  deps: { neverBundle: ['yaml', 'vite', /^node:/, /^cloudflare:/] },
  clean: true,
  outDir: 'dist',
})
