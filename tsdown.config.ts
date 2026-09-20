import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts'],
  format: ['esm'],
  dts: true,
  platform: 'neutral',
  // `external` is deprecated in tsdown 0.23 and removed in a later release.
  deps: { neverBundle: ['yaml', 'vite', /^node:/] },
  clean: true,
  outDir: 'dist',
})
