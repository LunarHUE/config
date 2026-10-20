/**
 * Read an env value the way the YAML core schema reads a plain scalar, so a
 * field that also lives in YAML gets the same type from either side: `8080`
 * is a number, `true` a boolean, `null` null, anything else a string. Wrapping
 * the whole value in matching quotes keeps it a string, so `PORT='"8080"'` in
 * a .env file yields the string `8080`.
 */
export function parseScalar(text: string): string | number | boolean | null {
  const quoted = /^(["'])(.*)\1$/s.exec(text)
  if (quoted) return quoted[2]!

  if (/^(null|Null|NULL|~)$/.test(text)) return null
  if (/^(true|True|TRUE)$/.test(text)) return true
  if (/^(false|False|FALSE)$/.test(text)) return false
  if (/^[-+]?[0-9]+$/.test(text)) return Number(text)
  if (/^0o[0-7]+$/.test(text)) return parseInt(text.slice(2), 8)
  if (/^0x[0-9a-fA-F]+$/.test(text)) return parseInt(text.slice(2), 16)
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(text)) return Number(text)
  if (/^[-+]?(\.inf|\.Inf|\.INF)$/.test(text)) return text.startsWith('-') ? -Infinity : Infinity
  if (/^(\.nan|\.NaN|\.NAN)$/.test(text)) return NaN

  return text
}
