/**
 * Just enough of the `cloudflare:workers` module for the worker entry. Users
 * who want the full types install @cloudflare/workers-types.
 */
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>
}
