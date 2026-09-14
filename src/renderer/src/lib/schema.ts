import type { ComponentSchema, DataLists, InputHint } from '../../../shared/types'

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
  | { kind: 'objects'; item: Record<string, unknown>; fromBlueprint: boolean }
  | { kind: 'fields'; blueprint: Record<string, unknown> }

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// `[blocks]` allows any standalone component, `[blocks/name]` exactly one component.
function blockMarker(v: unknown): string | null {
  if (Array.isArray(v) && v.length === 1 && typeof v[0] === 'string') {
    if (v[0] === 'blocks' || v[0].startsWith('blocks/')) return v[0]
  }
  return null
}

const imageKey = /^image$|^image_path$|Img$|^logo$|^icon$|^thumbnail$/

export function resolveField(
  name: string,
  blueprintValue: unknown,
  inputs: Record<string, InputHint>,
  currentValue: unknown
): FieldSpec {
  const marker = blockMarker(blueprintValue)
  if (marker) {
    return {
      kind: 'blocks',
      allowed: marker === 'blocks' ? null : [marker.slice('blocks/'.length)]
    }
  }
  if (typeof blueprintValue === 'string' && blueprintValue.startsWith('block/')) {
    return { kind: 'block', component: blueprintValue.slice('block/'.length) }
  }
  const hint = inputs[name]
  switch (hint?.type) {
    case 'text':
    case 'url':
    case 'color':
      return { kind: 'string', multiline: false }
    case 'markdown':
      return { kind: 'string', multiline: true, markdown: true }
    case 'image':
      return { kind: 'image' }
    case 'checkbox':
    case 'switch':
      return { kind: 'boolean' }
    case 'number':
      return { kind: 'number' }
    case 'array':
      return { kind: 'list' }
    case 'select': {
      const options = hint.options ?? {}
      const choices = (options.values ?? []).map(String)
      return { kind: 'choice', choices: options.allow_empty ? ['', ...choices] : choices }
    }
  }
  const fromBlueprint = blueprintValue !== undefined
  const v = fromBlueprint ? blueprintValue : currentValue
  if (typeof v === 'boolean') return { kind: 'boolean' }
  if (typeof v === 'number') return { kind: 'number' }
  if (Array.isArray(v)) {
    const first: unknown = v[0]
    if (isRecord(first)) {
      if ('fieldGroup' in first) return { kind: 'blocks', allowed: null }
      return { kind: 'objects', item: first, fromBlueprint }
    }
    return { kind: 'list' }
  }
  if (isRecord(v)) {
    if (typeof v.fieldGroup === 'string') return { kind: 'block', component: v.fieldGroup }
    return { kind: 'fields', blueprint: v }
  }
  const s = typeof v === 'string' ? v : ''
  if (s.startsWith('/images/') || imageKey.test(name)) return { kind: 'image' }
  return { kind: 'string', multiline: s.includes('\n') || s.length > 80 }
}

// Top-level page fields have no blueprint; a few keys get pickers from the data files.
export function pageField(key: string, value: unknown, lists: DataLists): FieldSpec {
  if (key === 'content_blocks') return { kind: 'blocks', allowed: null }
  if (key === 'authors' || key === 'categories' || key === 'customercategories') {
    return { kind: 'choicelist', options: lists[key] }
  }
  if (key === 'description' || key === 'summary') return { kind: 'string', multiline: true }
  return resolveField(key, undefined, {}, value)
}

export function newBlock(schema: ComponentSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { fieldGroup: schema.name }
  for (const [key, value] of Object.entries(schema.blueprint)) {
    if (blockMarker(value)) out[key] = []
    else if (typeof value === 'string' && value.startsWith('block/')) continue
    else out[key] = structuredClone(value)
  }
  return out
}

// An empty copy of an item taken from page content rather than from a blueprint.
export function blankItem(item: unknown): unknown {
  if (Array.isArray(item)) return []
  if (isRecord(item)) {
    return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, blankItem(v)]))
  }
  if (typeof item === 'boolean') return false
  if (typeof item === 'number') return 0
  return ''
}

const summaryKeys = ['title', 'name', 'heading', 'question', 'header', 'text', 'subtitle']

export function summaryOf(obj: Record<string, unknown>): string {
  for (const key of summaryKeys) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'fieldGroup') continue
    if (typeof v === 'string' && v.trim() && !v.startsWith('/')) return v.trim()
  }
  return ''
}

export function humanize(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
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
