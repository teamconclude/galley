export interface Split {
  frontmatter: string | null
  body: string
}

const fence = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function split(text: string): Split {
  const m = text.match(fence)
  if (!m) return { frontmatter: null, body: text }
  return { frontmatter: m[1], body: text.slice(m[0].length) }
}

export function join(frontmatter: string | null, body: string): string {
  return frontmatter === null ? body : `---\n${frontmatter}\n---\n${body}`
}
