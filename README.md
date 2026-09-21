# @lunarhue/config

Layered YAML and `.env` config for TypeScript apps. It finds your repo root, reads `config.default.yml`, `config.<mode>.yml` and `config.local.yml` plus the matching `.env` files, merges them with a fixed precedence order, validates everything once against any Standard Schema validator, and hands back a `server` object and a `client` object.

Why it exists. Non-secret settings belong in YAML you commit, so a diff shows what changed between environments. Secrets belong in `.env` files you gitignore. Both halves end up in one schema and one validation pass, so a bad value fails at startup with every problem listed, not on the first request that touches it. The server/client split is enforced at the import boundary: browser builds resolve a different entry point that has no filesystem access at all, so a server key cannot leak into a bundle because someone forgot a `PUBLIC_` prefix.

Runtime: Bun 1.2+ or Node 22+. One runtime dependency (`yaml`). `vite` is an optional peer.

## Install

```sh
bun add @lunarhue/config
```

```sh
npm i @lunarhue/config
```

## Quick start

Create these files at the repo root.

| File | Committed | Purpose |
| --- | --- | --- |
| `config.default.yml` | yes | Base values. Also the marker that identifies the repo root. |
| `config.<mode>.yml` | yes | Per-mode overrides, for example `config.production.yml`. |
| `config.local.yml` | no | Your machine's overrides. |
| `.env` | no | Secrets shared by every mode. |
| `.env.local` | no | Your machine's secrets. |
| `.env.<mode>` | no | Secrets for one mode. |
| `.env.<mode>.local` | no | Per-mode secrets. |

`config.default.yml`:

```yaml
app:
  name: Acme
logging:
  level: info
```

`src/config.ts`:

```ts
import { defineConfig, env, file } from '@lunarhue/config'
import { z } from 'zod'

export const config = defineConfig({
  server: {
    databaseUrl: env('DATABASE_URL', z.url()),
    sessionSecret: env('SESSION_SECRET', z.string().min(32)),
  },
  client: {
    appName: file('app.name', z.string()),
    logLevel: file('logging.level', z.enum(['debug', 'info', 'warn', 'error']).default('info')),
    apiUrl: env('PUBLIC_API_URL', z.url()),
  },
})
```

Read it anywhere:

```ts
import { config } from './config'

const db = connect(config.server.databaseUrl)
console.log(config.client.appName, config.client.logLevel)
```

`defineConfig` is lazy. Nothing is read from disk until the first access of `config.server` or `config.client`. The result is cached for the process. A failed load is not cached, so the next read retries and throws again.

## How loading works

**Root discovery.** The loader walks up from `process.cwd()` and stops at the first directory containing `config.default.yml`. That directory is the root, and every YAML and `.env` file is resolved against it. A script in `packages/db` gets the same config as the app at the root. If no marker is found and any declared key uses `file()`, the loader throws `RootNotFoundError`. If every key uses `env()`, it falls back to the cwd.

**Per-package layers.** Pass `dir` and the package's own files load after the root's, so an app or package can override shared values. Discovery then starts at the parent of `dir`, which keeps a `config.default.yml` inside the package from being taken for the repo root. If `dir` holds the only marker, `dir` is the root and there is one layer set, not two. See [Per-package layers](#per-package-layers).

**Mode.** `APP_ENV`, then `NODE_ENV`, then `development`. An empty or whitespace-only value counts as unset and falls through. The `mode` option overrides all three.

**Env precedence**, lowest first. Without `dir`, only the root block applies:

1. root `.env`
2. root `.env.local`
3. root `.env.<mode>`
4. root `.env.<mode>.local`
5. `dir/.env`
6. `dir/.env.local`
7. `dir/.env.<mode>`
8. `dir/.env.<mode>.local`
9. `process.env`

Closer wins. Every file in `dir` beats every file at the root, so `dir/.env` overrides the root's `.env.<mode>.local`.

A variable already present in `process.env` beats every file, so a value exported by your shell or injected by CI always wins. After merging, the loader writes file values into `process.env` for keys it does not already have. SDKs that read `process.env.AWS_REGION` directly see them without any extra wiring.

**YAML precedence**, lowest first. Without `dir`, only the root block applies:

1. root `config.default.yml`
2. root `config.<mode>.yml`
3. root `config.local.yml`
4. `dir/config.default.yml`
5. `dir/config.<mode>.yml`
6. `dir/config.local.yml`

Closer wins here too. `dir/config.default.yml` overrides the root's `config.local.yml`.

Merge rules:

- Objects merge key by key, recursively.
- Arrays replace the whole array. There is no element-wise merge.
- An explicit `null` overrides the value below it.
- A key missing from a higher layer keeps the value from the lower layer.

Parsing uses the YAML core schema, so `yes`, `no`, `on`, `off` and dates stay strings. Merge keys (`<<`) are off; layering is the only thing that combines mappings. An empty file is `{}`. A non-mapping at the top level throws with the file path in the message.

**`.env` format:**

- `KEY=value`, one per line.
- Blank lines and lines starting with `#` are skipped.
- A leading `export ` is stripped.
- Keys must match `[A-Za-z_][A-Za-z0-9_]*`. Other lines are skipped.
- Values may be double quoted, single quoted or bare. Double quotes interpret `\n`, `\r`, `\t`, `\\`, `\'` and `\"`. Single quotes are literal.
- In a bare value, whitespace followed by `#` starts a comment.
- No `${VAR}` interpolation.

## API reference

### `defineConfig(definition)`

Takes `{ server?, client?, root?, dir?, mode?, emptyStringAsUndefined? }` and returns a lazy `Config`. Both sections are optional. Key names are yours; the `env()` name or `file()` path is what maps to a source.

### `loadConfig(definition)`

The eager, synchronous version. Same definition, but it reads and validates immediately and returns the full result:

```ts
import { env, file, loadConfig } from '@lunarhue/config'
import { z } from 'zod'

const result = loadConfig({
  server: { databaseUrl: env('DATABASE_URL', z.url()) },
  client: { appName: file('app.name', z.string()) },
})

result.server.databaseUrl // string
result.client.appName // string
result.mode // 'development'
result.root // '/home/you/repo'
result.dirs // ['/home/you/repo'], or [root, dir] when `dir` is set
result.files // every file that existed and was read, in load order
```

Use it when you want `mode`, `root`, `dirs` or `files`, for example to log what got loaded.

### `env(name, schema)`

Declares a value read from the merged env layers by variable name.

### `file(path, schema)`

Declares a value read from the merged YAML by dotted path, for example `logging.level`. The path may point at an object, and the schema validates the whole subtree.

### Options

- `root`: skip discovery and use this directory. Relative paths resolve against the cwd.
- `dir`: directory of the package that owns this definition, usually `import.meta.dirname`. Its config and `.env` files load after the root's. Relative paths resolve against the cwd.
- `mode`: override `APP_ENV` and `NODE_ENV`.
- `emptyStringAsUndefined`: default `true`. An env var set to `""` becomes `undefined` before validation, so `.default()` and `.optional()` behave the way you expect. Empty values read from YAML are left alone.

### Types

- `Config<S, C>`: what `defineConfig` returns. Has `server` and `client` getters.
- `InferConfig<T>`: the `{ server, client }` value types from a `Config`. Useful for passing config into a function.
- `ConfigIssue`: `{ section, key, source, path, message }`.
- Also exported: `ConfigDefinition`, `ConfigOptions`, `InferSection`, `LoadResult`, `Source`.

```ts
import type { InferConfig } from '@lunarhue/config'
import { config } from './config'

type AppConfig = InferConfig<typeof config>

function render(client: AppConfig['client']) {
  return client.appName
}
```

### Errors

`ConfigError` carries an `issues` array with every failure from both sections, and formats all of them into the message:

```
Invalid config
  server.databaseUrl  (env DATABASE_URL)    Invalid URL
  client.logLevel     (file logging.level)  Invalid option: expected one of "debug"|"info"|"warn"|"error"
```

Nested schema failures append the inner path to both the key and the source path, so an object at `auth` missing `signInPath` reports `client.auth.signInPath  (file auth.signInPath)`.

`RootNotFoundError` has a `cwd` property and is thrown when no `config.default.yml` exists in the cwd or any parent, and at least one key reads from a file.

`BoundaryError` has a `key` property and is thrown in the browser when code reads `config.server.anything`.

Async schemas are rejected. If a validator returns a Promise, the loader throws and names the offending key.

## Browser and Vite

The package ships two entries for `@lunarhue/config`. Bundlers that honor the `browser` export condition get a build that never imports `node:fs`. Its `defineConfig` ignores the definition body, reads `client` from `globalThis.__APP_CONFIG__`, and backs `server` with a proxy that throws `BoundaryError` on any property read. The types are identical in both entries, so a module shared by server and client code compiles either way, and a stray server read fails in the browser instead of shipping a secret.

Something has to put that global in place.

With Vite, use the plugin:

```ts
// vite.config.ts
import appConfig from '@lunarhue/config/vite'
import { defineConfig } from 'vite'
import { config } from './src/config'

export default defineConfig({
  plugins: [appConfig(config)],
})
```

The plugin calls `loadConfig` once during config resolution and adds a `define` for `globalThis.__APP_CONFIG__` holding the client section only. Values are baked in at build time, so changing a YAML file while the dev server is running needs a restart.

Without Vite, render the script from your server:

```ts
import { serializeClient } from '@lunarhue/config/vite'
import { config } from './config'

const script = serializeClient(config)

const html = `<!doctype html>
<html>
  <head><script>${script}</script></head>
  <body><div id="root"></div><script type="module" src="/app.js"></script></body>
</html>`
```

`serializeClient` returns JavaScript that assigns the client section to the global. It escapes `</script>` so a config value cannot close the tag. Put it before the bundle that reads the config.

## Scripts

Tools that run from a subdirectory work without extra configuration, because root discovery walks up. A drizzle config in `packages/db` needs no `dotenv` import and no path to the root:

```ts
// packages/db/drizzle.config.ts
import { defineConfig } from 'drizzle-kit'
import { config } from '../../src/config'

export default defineConfig({
  schema: './src/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url: config.server.databaseUrl },
})
```

Running `bunx drizzle-kit push` from `packages/db` finds the root, loads `.env` and `.env.local` from there, and validates `DATABASE_URL` with the same schema the app uses.

## Per-package layers

In a monorepo the root holds the config every package shares, and each app or package keeps the parts only it cares about. Pass `dir` to say which package a definition belongs to:

```ts
// apps/api/config.ts
import { defineConfig, env, file } from '@lunarhue/config'
import { z } from 'zod'

export const config = defineConfig({
  dir: import.meta.dirname,
  server: { databaseUrl: env('DATABASE_URL', z.url()) },
  client: { appName: file('app.name', z.string()) },
})
```

With a tree like this:

```
config.default.yml            app.name: Acme, app.support: help@acme.test
.env                          DATABASE_URL, SENTRY_DSN
apps/api/config.default.yml   app.name: Acme API
apps/api/.env                 DATABASE_URL
packages/db/.env              DATABASE_URL
```

`apps/api` gets its own `app.name` and `DATABASE_URL`, still sees `app.support` and `SENTRY_DSN` from the root, and never sees the URL that `packages/db` uses. Nothing depends on the cwd, so the same values come back whether you run from the repo root or from inside the package.

`import.meta.dirname` needs an ESM module on Node 22+ or Bun. In CommonJS use `__dirname`. Anywhere else, pass an absolute path.

## Using other validators

Any Standard Schema validator works. Arktype:

```ts
import { defineConfig, env } from '@lunarhue/config'
import { type } from 'arktype'

export const config = defineConfig({
  server: { port: env('PORT', type('string.numeric.parse')) },
  client: { apiUrl: env('PUBLIC_API_URL', type('string.url')) },
})
```

Valibot:

```ts
import { defineConfig, env } from '@lunarhue/config'
import * as v from 'valibot'

export const config = defineConfig({
  server: { port: env('PORT', v.pipe(v.string(), v.transform(Number), v.number())) },
  client: { apiUrl: env('PUBLIC_API_URL', v.pipe(v.string(), v.url())) },
})
```

You can mix validators across keys in one definition. Issues are collected the same way whichever library produced them.

## Non-goals in v1

- No rc-file discovery. The file names are fixed.
- No `extends` and no remote config sources.
- No hot reload. Config loads once per process.
- No `${VAR}` interpolation in `.env` or YAML values.
- No writing config. The library only reads.
