// Hugo takes YAML between --- fences, TOML between +++ fences, or a JSON object.
export type FrontmatterFormat = 'yaml' | 'toml' | 'json'

export interface Split {
  frontmatter: string | null
  body: string
  format: FrontmatterFormat
}

const fences: [FrontmatterFormat, RegExp][] = [
  ['yaml', /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/],
  ['toml', /^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+\r?\n?/]
]

export function split(text: string): Split {
  for (const [format, fence] of fences) {
    const m = text.match(fence)
    if (m) return { frontmatter: m[1], body: text.slice(m[0].length), format }
  }
  if (text.startsWith('{')) {
    const end = jsonEnd(text)
    if (end > 0) {
      const rest = text.slice(end)
      return { frontmatter: text.slice(0, end), body: rest.replace(/^\r?\n/, ''), format: 'json' }
    }
  }
  return { frontmatter: null, body: text, format: 'yaml' }
}

export function join(
  frontmatter: string | null,
  body: string,
  format: FrontmatterFormat = 'yaml'
): string {
  if (frontmatter === null) return body
  if (format === 'json') return `${frontmatter}\n${body}`
  const fence = format === 'toml' ? '+++' : '---'
  return `${fence}\n${frontmatter}\n${fence}\n${body}`
}

// The offset just past the JSON object that opens the text, or -1 when it never closes.
function jsonEnd(text: string): number {
  let depth = 0
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i + 1
  }
  return -1
}
