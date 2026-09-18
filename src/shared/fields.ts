import type { FieldDef, FieldType } from './types'

export const fieldTypes: ReadonlySet<FieldType> = new Set<FieldType>([
  'text',
  'textarea',
  'markdown',
  'url',
  'image',
  'boolean',
  'number',
  'select',
  'list',
  'object',
  'block',
  'blocks'
])

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function humanize(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
}

const imageKey = /^image$|^image_path$|Img$|^logo$|^icon$|^thumbnail$/

// A field guessed from a value, for keys no schema declares.
export function inferField(key: string, value: unknown, blockKey: string): FieldDef {
  const base = { key, label: humanize(key) }
  if (typeof value === 'boolean') return { ...base, type: 'boolean' }
  if (typeof value === 'number') return { ...base, type: 'number' }
  if (Array.isArray(value)) {
    const first: unknown = value[0]
    if (isRecord(first)) {
      if (typeof first[blockKey] === 'string') return { ...base, type: 'blocks' }
      return { ...base, type: 'list', fields: inferFields(first, blockKey) }
    }
    return { ...base, type: 'list' }
  }
  if (isRecord(value)) {
    const name = value[blockKey]
    if (typeof name === 'string') return { ...base, type: 'block', component: name }
    return { ...base, type: 'object', fields: inferFields(value, blockKey) }
  }
  const s = typeof value === 'string' ? value : ''
  if (s.startsWith('/images/') || imageKey.test(key)) return { ...base, type: 'image' }
  return { ...base, type: s.includes('\n') || s.length > 80 ? 'textarea' : 'text' }
}

export function inferFields(obj: Record<string, unknown>, blockKey: string): FieldDef[] {
  return Object.entries(obj)
    .filter(([k]) => k !== blockKey)
    .map(([k, v]) => inferField(k, v, blockKey))
}
