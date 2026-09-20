const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Parse .env text into key/value pairs. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {}

  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim()
    if (line === '' || line.startsWith('#')) continue

    if (line.startsWith('export ')) line = line.slice('export '.length).trim()

    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    if (!KEY_RE.test(key)) continue

    out[key] = parseValue(line.slice(eq + 1).trim())
  }

  return out
}

const DOUBLE_QUOTED = /^"((?:\\.|[^"\\])*)"/
const SINGLE_QUOTED = /^'([^']*)'/

function parseValue(raw: string): string {
  if (raw.startsWith('"')) {
    const m = DOUBLE_QUOTED.exec(raw)
    if (m) return unescape(m[1]!)
  } else if (raw.startsWith("'")) {
    const m = SINGLE_QUOTED.exec(raw)
    if (m) return m[1]!
  }
  // Unquoted: everything from a whitespace-preceded # is a comment.
  return raw.replace(/\s+#.*$/, '').trim()
}

function unescape(value: string): string {
  return value.replace(/\\([nrt\\'"])/g, (_, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n'
      case 'r':
        return '\r'
      case 't':
        return '\t'
      default:
        return ch
    }
  })
}
