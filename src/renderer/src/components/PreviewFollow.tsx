import { useEffect, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { type Document, isSeq } from 'yaml'
import { useActiveEditorState } from '../lib/activeEditor'
import { plainText, showBlock, showInPreview } from '../lib/previewScroll'

const settle = 300

// The preview follows the cursor through the body: the line it stands on is looked up
// in the page by its words, once the cursor has rested a moment.
export function BodyFollower({ view }: { view: EditorView | null }): React.JSX.Element | null {
  const active = useActiveEditorState()
  const head = active.view === view && view ? view.state.selection.main.head : null
  const line = head === null || !view ? '' : view.state.doc.lineAt(head).text
  const snippet = plainText(line).slice(0, 80)
  const heading = /^#{1,6}\s/.test(line)
  useEffect(() => {
    if (!snippet) return
    const show = (): void => showInPreview({ kind: 'text', snippet, heading })
    const timer = window.setTimeout(show, settle)
    return () => window.clearTimeout(timer)
  }, [snippet, heading])
  return null
}

interface YamlProps {
  view: EditorView | null
  doc: Document
}

// In the YAML view of the page settings, the block whose lines hold the cursor.
export function YamlFollower({ view, doc }: YamlProps): React.JSX.Element | null {
  const active = useActiveEditorState()
  const head = active.view === view && view ? view.state.selection.main.head : null
  const [index, setIndex] = useState<number | null>(null)
  const found = head === null ? null : blockAt(doc, head)
  if (found !== index) setIndex(found)
  useEffect(() => {
    if (index === null) return
    const timer = window.setTimeout(() => showBlock(index), settle)
    return () => window.clearTimeout(timer)
  }, [index])
  return null
}

function blockAt(doc: Document, pos: number): number | null {
  const blocks = doc.get('content_blocks', true)
  if (!isSeq(blocks)) return null
  const starts = blocks.items.map((item) =>
    item && typeof item === 'object' && 'range' in item && item.range ? item.range[0] : null
  )
  let found: number | null = null
  starts.forEach((start, i) => {
    if (start !== null && pos >= start) found = i
  })
  return found
}
