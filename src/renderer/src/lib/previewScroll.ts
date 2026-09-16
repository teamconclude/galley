import type { PreviewTarget } from '../../../shared/types'

// Tells the preview, in the window or detached, where to scroll to.
const listeners = new Set<(target: PreviewTarget) => void>()
let last = ''

export function showInPreview(target: PreviewTarget): void {
  const key = JSON.stringify(target)
  if (key === last) return
  last = key
  for (const l of listeners) l(target)
  window.api.preview.show(target)
}

export const showBlock = (index: number): void => showInPreview({ kind: 'block', index })

// A new page starts over, so its first block gets scrolled to as well.
export function forgetTarget(): void {
  last = ''
}

export function onShow(listener: (target: PreviewTarget) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// The words of a markdown line as the page shows them, roughly: marks, links, tags and
// shortcodes removed, whitespace collapsed.
export function plainText(line: string): string {
  return line
    .replace(/\{\{[<%][\s\S]*?[>%]\}\}/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/, '')
    .replace(/[*_~`]+/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
