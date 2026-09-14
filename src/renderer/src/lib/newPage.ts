import { Document, isMap, parseDocument } from 'yaml'
import { split } from './frontmatter'
import { isRecord } from './schema'

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Page-specific keys that must not be copied from the template page.
const skipKeys = new Set(['url', 'aliases'])

function blank(value: unknown): unknown {
  if (Array.isArray(value)) return []
  if (isRecord(value))
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, blank(v)]))
  if (typeof value === 'boolean') return false
  if (typeof value === 'number') return value
  return ''
}

// A new page takes the frontmatter shape of the newest sibling, emptied out, so it fits
// its section; without a sibling it gets the basics.
export function newPageText(template: string | null, title: string): string {
  const fields: Record<string, unknown> = {}
  const frontmatter = template === null ? null : split(template).frontmatter
  const doc = frontmatter === null ? null : parseDocument(frontmatter)
  if (doc && doc.errors.length === 0 && isMap(doc.contents)) {
    for (const [key, value] of Object.entries(doc.toJS() as Record<string, unknown>)) {
      if (!skipKeys.has(key)) fields[key] = blank(value)
    }
  } else {
    Object.assign(fields, { title: '', date: '', draft: false, description: '' })
  }
  fields.title = title
  if ('date' in fields) fields.date = new Date().toISOString().slice(0, 13) + ':00:00Z'
  fields.draft = true
  const out = new Document(fields)
  return `---\n${out.toString({ singleQuote: true })}---\n\n`
}
