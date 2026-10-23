import { useSyncExternalStore } from 'react'
import { EditorView } from '@codemirror/view'
import { textKey } from '../../../shared/previewScript'
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

// The editor's text scrolls to where the reader scrolled the preview to: the line of the
// first piece of text in view that the text has, found by its words as the preview finds
// the cursor's line. The cursor stays where it is, so the preview does not follow back.
export function followPreview(view: EditorView, scroll: PreviewScroll): void {
  if (scroll.top) {
    view.dispatch({ effects: EditorView.scrollIntoView(0, { y: 'start' }) })
    return
  }
  const doc = view.state.doc
  const lines: { from: number; key: string; heading: boolean }[] = []
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const key = textKey(plainText(line.text))
    if (key) lines.push({ from: line.from, key, heading: /^#{1,6}\s/.test(line.text) })
  }
  let at: number | null = null
  for (const { text, heading } of scroll.texts) {
    const wanted = textKey(text)
    const found = lines.find((l) => (!heading || l.heading) && l.key.startsWith(wanted))
    if (found) {
      at = found.from
      break
    }
  }
  // A paragraph the page shows differently, e.g. split by a shortcode, may still hold
  // the start of the first piece.
  if (at === null && scroll.texts.length > 0) {
    const wanted = textKey(scroll.texts[0].text)
    const half = wanted.slice(0, Math.max(20, Math.floor(wanted.length / 2)))
    at = lines.find((l) => l.key.includes(half))?.from ?? null
  }
  if (at === null) return
  view.dispatch({ effects: EditorView.scrollIntoView(at, { y: 'start', yMargin: 24 }) })
}

// The top-level block the reader scrolled the preview to, which the page's blocks mark.
let blockInView: number | null = null
const blockListeners = new Set<() => void>()

export function setBlockInView(index: number | null): void {
  if (index === blockInView) return
  blockInView = index
  for (const l of blockListeners) l()
}

export const useBlockInView = (): number | null =>
  useSyncExternalStore(
    (cb) => {
      blockListeners.add(cb)
      return () => blockListeners.delete(cb)
    },
    () => blockInView
  )
