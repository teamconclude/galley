import type {
  BlockKey,
  ListKey,
  ComponentSchema,
  DataLists,
  InputHint
} from '../../../shared/types'

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

let blockKey: BlockKey = 'component'
let listKey: ListKey = 'blocks'

export function setKeys(block: BlockKey, list: ListKey): void {
  blockKey = block
  listKey = list
}

export const currentBlockKey = (): BlockKey => blockKey
export const currentListKey = (): ListKey => listKey

// The component a block names, or null when the value is not a block.
export function blockName(v: unknown): string | null {
  if (!isRecord(v)) return null
  const name = v[blockKey]
  return typeof name === 'string' ? name : null
}

// `[blocks]` allows any standalone component, `[blocks/a, blocks/b]` only those; other
// values are not block lists at all.
function blockAllowed(v: unknown): string[] | null | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined
  const names: string[] = []
  for (const item of v) {
    if (item === 'blocks') return null
    if (typeof item !== 'string' || !item.startsWith('blocks/')) return undefined
    names.push(item.slice('blocks/'.length))
  }
  return names
}

const imageKey = /^image$|^image_path$|Img$|^logo$|^icon$|^thumbnail$/

export function resolveField(
  name: string,
  blueprintValue: unknown,
  inputs: Record<string, InputHint>,
  currentValue: unknown
): FieldSpec {
  const allowed = blockAllowed(blueprintValue)
  if (allowed !== undefined) return { kind: 'blocks', allowed }
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
      if (blockName(first) !== null) return { kind: 'blocks', allowed: null }
      return { kind: 'objects', item: first, fromBlueprint }
    }
    return { kind: 'list' }
  }
  if (isRecord(v)) {
    const component = blockName(v)
    if (component !== null) return { kind: 'block', component }
    return { kind: 'fields', blueprint: v }
  }
  const s = typeof v === 'string' ? v : ''
  if (s.startsWith('/images/') || imageKey.test(name)) return { kind: 'image' }
  return { kind: 'string', multiline: s.includes('\n') || s.length > 80 }
}

// Top-level page fields have no blueprint; a few keys get pickers from the data files.
export function pageField(key: string, value: unknown, lists: DataLists): FieldSpec {
  if (key === listKey) return { kind: 'blocks', allowed: null }
  if (key === 'authors' || key === 'categories' || key === 'customercategories') {
    return { kind: 'choicelist', options: lists[key] }
  }
  if (key === 'description' || key === 'summary') return { kind: 'string', multiline: true }
  return resolveField(key, undefined, {}, value)
}

export function newBlock(schema: ComponentSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { [blockKey]: schema.name }
  for (const [key, value] of Object.entries(schema.blueprint)) {
    if (blockAllowed(value) !== undefined) out[key] = []
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
    if (k === blockKey) continue
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
