import type { BlockKey, ListKey, ComponentSchema, DataLists, FieldDef } from '../../../shared/types'
import { inferField, isRecord } from '../../../shared/fields'

export { humanize, isRecord } from '../../../shared/fields'

export type FieldSpec =
  | { kind: 'blocks'; allowed: string[] | null }
  | { kind: 'block'; component: string }
  | { kind: 'string'; multiline: boolean; markdown?: boolean }
  | { kind: 'image' }
  | { kind: 'boolean' }
  | { kind: 'number' }
  | { kind: 'choice'; choices: string[] }
  | { kind: 'choicelist'; options: string[] }
  | { kind: 'list' }
  | { kind: 'objects'; fields: FieldDef[] }
  | { kind: 'fields'; fields: FieldDef[] }

let blockKey: BlockKey = 'component'
let listKey: ListKey = 'blocks'
let imagesUrl = '/images'

export function setKeys(block: BlockKey, list: ListKey): void {
  blockKey = block
  listKey = list
}

export function setImagesUrl(url: string): void {
  imagesUrl = url
}

export const currentBlockKey = (): BlockKey => blockKey
export const currentListKey = (): ListKey => listKey

// The component a block names, or null when the value is not a block.
export function blockName(v: unknown): string | null {
  if (!isRecord(v)) return null
  const name = v[blockKey]
  return typeof name === 'string' ? name : null
}

export function specFor(def: FieldDef): FieldSpec {
  switch (def.type) {
    case 'blocks':
      return { kind: 'blocks', allowed: def.components ?? null }
    case 'block':
      return { kind: 'block', component: def.component ?? '' }
    case 'text':
    case 'url':
      return { kind: 'string', multiline: false }
    case 'textarea':
      return { kind: 'string', multiline: true }
    case 'markdown':
      return { kind: 'string', multiline: true, markdown: true }
    case 'image':
      return { kind: 'image' }
    case 'boolean':
      return { kind: 'boolean' }
    case 'number':
      return { kind: 'number' }
    case 'select': {
      const options = def.options ?? []
      return { kind: 'choice', choices: def.required ? options : ['', ...options] }
    }
    case 'list':
      return def.fields ? { kind: 'objects', fields: def.fields } : { kind: 'list' }
    case 'object':
      return { kind: 'fields', fields: def.fields ?? [] }
  }
}

// The declared fields in schema order, then anything else the object sets, guessed from
// its value.
export function fieldsFor(declared: FieldDef[], obj: Record<string, unknown>): FieldDef[] {
  const known = new Set(declared.map((f) => f.key))
  const extra = Object.keys(obj)
    .filter((k) => !known.has(k) && k !== blockKey)
    .map((k) => inferField(k, obj[k], blockKey, imagesUrl))
  return [...declared, ...extra]
}

// Top-level page fields have no schema; a few keys get pickers from the data files.
export function pageField(key: string, value: unknown, lists: DataLists): FieldSpec {
  if (key === listKey) return { kind: 'blocks', allowed: null }
  if (key in lists) return { kind: 'choicelist', options: lists[key] }
  if (key === 'description' || key === 'summary') return { kind: 'string', multiline: true }
  return specFor(inferField(key, value, blockKey, imagesUrl))
}

// The value a new field starts with: its default, else empty for its type. A nested
// block is left out until the user adds it.
export function blankValue(def: FieldDef): unknown {
  if (def.default !== undefined) return structuredClone(def.default)
  switch (def.type) {
    case 'boolean':
      return false
    case 'number':
      return 0
    case 'select':
      return def.required ? (def.options?.[0] ?? '') : ''
    case 'list':
    case 'blocks':
      return []
    case 'object':
      return blankObject(def.fields ?? [])
    case 'block':
      return undefined
    default:
      return ''
  }
}

export function blankObject(fields: FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = blankValue(f)
    if (v !== undefined) out[f.key] = v
  }
  return out
}

export function newBlock(schema: ComponentSchema): Record<string, unknown> {
  return { [blockKey]: schema.name, ...blankObject(schema.fields) }
}

const summaryKeys = ['title', 'name', 'heading', 'question', 'header', 'text', 'subtitle']

export function summaryOf(obj: Record<string, unknown>): string {
  for (const key of summaryKeys) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === blockKey) continue
    if (typeof v === 'string' && v.trim() && !v.startsWith('/')) return v.trim()
  }
  return ''
}

// Two components share a label in the site today, so tell them apart in pickers.
export function labelsFor(schemas: ComponentSchema[]): Map<string, string> {
  const counts = new Map<string, number>()
  for (const s of schemas) counts.set(s.label, (counts.get(s.label) ?? 0) + 1)
  return new Map(
    schemas.map((s) => [
      s.name,
      (counts.get(s.label) ?? 0) > 1 ? `${s.label} (${s.name})` : s.label
    ])
  )
}
