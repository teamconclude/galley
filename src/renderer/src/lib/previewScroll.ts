import { EditorView } from '@codemirror/view'
import type { PreviewScroll, PreviewTarget } from '../../../shared/types'

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

// The editor's text scrolls to the line the reader scrolled the preview to, found by its
// words as the preview finds the cursor's line; the cursor stays where it is, so the
// preview does not follow back.
export function followPreview(view: EditorView, scroll: PreviewScroll): void {
  if ('top' in scroll) {
    view.dispatch({ effects: EditorView.scrollIntoView(0, { y: 'start' }) })
    return
  }
  const doc = view.state.doc
  const half = scroll.text.slice(0, Math.max(20, Math.floor(scroll.text.length / 2)))
  let loose: number | null = null
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    if (scroll.heading && !/^#{1,6}\s/.test(line.text)) continue
    const text = plainText(line.text)
    if (!text) continue
    if (text.startsWith(scroll.text)) {
      loose = line.from
      break
    }
    if (loose === null && text.includes(half)) loose = line.from
  }
  if (loose === null) return
  view.dispatch({ effects: EditorView.scrollIntoView(loose, { y: 'start', yMargin: 24 }) })
}
