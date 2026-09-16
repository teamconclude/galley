// Links and images as markdown, read back for editing and written out again.

export interface LinkValues {
  text: string
  url: string
  // The site's render hook opens links titled "NewTab" in a new tab.
  newTab: boolean
}

export interface ImageValues {
  path: string
  alt: string
}

const link = /^\[([^\]]*)\]\(\s*(<[^>]*>|[^\s)]*)(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)$/
const image = /^!\[([^\]]*)\]\(\s*(<[^>]*>|[^\s)]*)(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)$/

export function parseLink(markdown: string): LinkValues | null {
  const m = markdown.match(link)
  if (!m) return null
  const title = m[3] ?? m[4] ?? ''
  return { text: m[1], url: m[2].replace(/^<|>$/g, ''), newTab: /^NewTab(:|$)/.test(title) }
}

export function linkMarkdown({ text, url, newTab }: LinkValues): string {
  return `[${text}](${url}${newTab ? ' "NewTab"' : ''})`
}

export function parseImage(markdown: string): ImageValues | null {
  const m = markdown.match(image)
  return m ? { path: m[2].replace(/^<|>$/g, ''), alt: m[1] } : null
}

export const imageMarkdown = ({ path, alt }: ImageValues): string => `![${alt}](${path})`
