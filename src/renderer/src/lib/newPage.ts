import { Document, isMap, parseDocument } from 'yaml'
import { split } from './frontmatter'
import { isRecord } from './schema'
import { setValue } from './yamlEdit'

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
export function newPageText(template: string | null, title: string, date = new Date()): string {
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
  if ('date' in fields) fields.date = date.toISOString().slice(0, 16) + ':00Z'
  fields.draft = true
  const out = new Document(fields)
  return `---\n${out.toString({ singleQuote: true })}---\n\n`
}

// Settings from a pasted or imported page laid over a page's own: every value the other
// page fills in wins, empty ones are skipped. Null when either is not a YAML map.
export function mergeSettings(own: string, other: string): string | null {
  const pasted = parseDocument(other)
  if (pasted.errors.length > 0 || !isMap(pasted.contents)) return null
  const doc = parseDocument(own)
  if (doc.errors.length > 0) return null
  for (const [key, value] of Object.entries(pasted.toJS() as Record<string, unknown>)) {
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) continue
    setValue(doc, [key], value)
  }
  return doc.toString().trimEnd()
}

export interface DocumentParts {
  // Settings the document brings itself, when it is a Markdown page with front matter.
  frontmatter: string | null
  title: string
  // What comes before the headline: notes for whoever publishes, not page text.
  notes: string
  // An address the notes propose on a line of its own, e.g. /unified-communications/.
  slug: string | null
  body: string
}

// A document's headline becomes the page title and what follows it the text; anything
// above the headline is set apart as notes. The headline is the first top-level heading,
// or a short first paragraph in bold throughout, as a title set by hand in Word looks.
// The page's title is its only top-level heading, so when the text uses them for its
// sections, every heading moves down a level.
export function documentParts(markdown: string): DocumentParts {
  const { frontmatter, body: rest } = split(markdown)
  const fmTitle = frontmatter
    ? (parseDocument(frontmatter).get('title') as string | undefined)
    : undefined
  const first = rest.match(/^\s*\*\*([^*\n]{1,120})\*\*[ \t]*$/m)
  const firstIsTitle = first !== null && rest.slice(0, first.index).trim() === ''
  const heading = firstIsTitle ? first : rest.match(/^# +(.+?)\s*$/m)
  if (!heading) {
    return {
      frontmatter,
      title: fmTitle ?? '',
      notes: '',
      slug: null,
      body: demote(rest.trim()) + '\n'
    }
  }
  const at = heading.index!
  const notes = rest.slice(0, at).trim()
  const address = notes.match(/^\/?(?:[a-z0-9-]+\/)*([a-z0-9][a-z0-9-]*)\/?$/m)
  return {
    frontmatter,
    title: fmTitle ?? heading[1].replace(/\*\*|__/g, '').trim(),
    notes,
    slug: address ? address[1] : null,
    body: demote(rest.slice(at + heading[0].length).trim()) + '\n'
  }
}

const demote = (text: string): string =>
  /^# /m.test(text) ? text.replace(/^(#{1,5}) /gm, '#$1 ') : text
