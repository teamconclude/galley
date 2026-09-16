import { useState } from 'react'
import { CodeXml } from 'lucide-react'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import type { EditorView } from '@codemirror/view'
import { useActiveEditorState } from '../lib/activeEditor'
import {
  type ImageValues,
  imageMarkdown,
  type LinkValues,
  linkMarkdown,
  parseImage,
  parseLink
} from '../lib/inline'
import { ImageDialog, LinkDialog } from './InsertDialogs'

// Wrapping a selection that is already wrapped unwraps it, so the buttons toggle.
function wrap(view: EditorView, before: string, after = before): void {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  const outerFrom = from - before.length
  const outerTo = to + after.length
  const wrapped =
    outerFrom >= 0 &&
    outerTo <= view.state.doc.length &&
    view.state.sliceDoc(outerFrom, from) === before &&
    view.state.sliceDoc(to, outerTo) === after
  if (wrapped) {
    view.dispatch({
      changes: { from: outerFrom, to: outerTo, insert: selected },
      selection: { anchor: outerFrom, head: outerFrom + selected.length }
    })
  } else {
    view.dispatch({
      changes: { from, to, insert: before + selected + after },
      selection: { anchor: from + before.length, head: from + before.length + selected.length }
    })
  }
  view.focus()
}

// How a line is set: a paragraph, a heading, a list item, a quote or code.
type Block = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'ul' | 'ol' | 'quote' | 'code'

const blockMarker = /^(?:#{1,6} |[-*] |\d+\. |> )/
const blockNames: [Block, string][] = [
  ['p', 'Paragraph'],
  ['h1', 'Heading 1'],
  ['h2', 'Heading 2'],
  ['h3', 'Heading 3'],
  ['h4', 'Heading 4'],
  ['ul', 'Bullet list'],
  ['ol', 'Numbered list'],
  ['quote', 'Quote'],
  ['code', 'Code block']
]

function blockOf(text: string): Block {
  const marker = text.match(blockMarker)?.[0] ?? ''
  if (marker.startsWith('#')) {
    const level = marker.length - 1
    return level <= 4 ? (`h${level}` as Block) : 'p'
  }
  if (/^[-*] /.test(marker)) return 'ul'
  if (/^\d/.test(marker)) return 'ol'
  return marker === '> ' ? 'quote' : 'p'
}

const markerFor = (block: Block, n: number): string =>
  block === 'p'
    ? ''
    : block === 'ul'
      ? '- '
      : block === 'ol'
        ? `${n}. `
        : block === 'quote'
          ? '> '
          : '#'.repeat(Number(block[1])) + ' '

// The fenced code block around a position, if any.
function fenceAt(view: EditorView, pos: number): SyntaxNode | null {
  for (let n: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name === 'FencedCode') return n
  }
  return null
}

function blockAt(view: EditorView): Block {
  const pos = view.state.selection.main.head
  return fenceAt(view, pos) ? 'code' : blockOf(view.state.doc.lineAt(pos).text)
}

// Sets every line the selection touches; list items are numbered in order, blank lines
// in a selection stay blank. A code block is fenced as a whole and unfenced again.
function setBlock(view: EditorView, block: Block): void {
  const { doc } = view.state
  const { from, to } = view.state.selection.main
  const fence = fenceAt(view, from)
  // Markers inserted at the cursor land before it, so the cursor is moved past them.
  const apply = (): void => {
    const set = view.state.changes(changes)
    const { anchor, head } = view.state.selection.main
    view.dispatch({
      changes: set,
      selection: { anchor: set.mapPos(anchor, 1), head: set.mapPos(head, 1) }
    })
    view.focus()
  }
  let first = doc.lineAt(from).number
  let last = doc.lineAt(to).number
  const changes: { from: number; to: number; insert: string }[] = []
  if (fence) {
    const open = doc.lineAt(fence.from)
    const close = doc.lineAt(fence.to)
    const closed = close.number > open.number && /^\s*(`{3,}|~{3,})\s*$/.test(close.text)
    changes.push({ from: open.from, to: Math.min(open.to + 1, doc.length), insert: '' })
    if (closed) changes.push({ from: close.from - 1, to: close.to, insert: '' })
    first = open.number + 1
    last = closed ? close.number - 1 : close.number
    if (block === 'code' || last < first) {
      apply()
      return
    }
  } else if (block === 'code') {
    changes.push({ from: doc.line(first).from, to: doc.line(first).from, insert: '```\n' })
    changes.push({ from: doc.line(last).to, to: doc.line(last).to, insert: '\n```' })
    // The selection stays on the fenced lines, shifted past the opening fence.
    const { anchor, head } = view.state.selection.main
    view.dispatch({ changes, selection: { anchor: anchor + 4, head: head + 4 } })
    view.focus()
    return
  }
  let item = 0
  for (let n = first; n <= last; n++) {
    const line = doc.line(n)
    const current = line.text.match(blockMarker)?.[0] ?? ''
    const blank = line.text.slice(current.length).trim() === '' && first !== last
    const insert = blank ? '' : markerFor(block, ++item)
    if (current !== insert)
      changes.push({ from: line.from, to: line.from + current.length, insert })
  }
  apply()
}

function insert(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
  view.focus()
}

const snippets: Record<string, string> = {
  screenshot: '{{< screenshot "/images/…" "Description of the picture" >}}',
  youtube: '{{< youtube VIDEO_ID >}}',
  quote: '{{< quote "What the customer said." "Name, Title" >}}',
  tooltip: '{{< tooltip "Explanation shown on hover" >}}term{{< /tooltip >}}'
}

// Acts on whichever markdown editor has focus: the page body or a markdown field.
const inlineStyles: Record<string, string> = {
  StrongEmphasis: 'bold',
  Emphasis: 'italic',
  Strikethrough: 'strike',
  InlineCode: 'code',
  Link: 'link',
  Image: 'image'
}

// The link or image at the cursor, as the range of its markdown, so it can be edited.
function inlineAt(view: EditorView, name: 'Link' | 'Image'): { from: number; to: number } | null {
  const pos = view.state.selection.main.head
  for (let n: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name === name) return { from: n.from, to: n.to }
  }
  return null
}

// What the dialogs edit: an existing link or image, else the selection as the text.
interface Pending {
  kind: 'link' | 'image'
  view: EditorView
  from: number
  to: number
  link: LinkValues
  image: ImageValues
}

function pendingFor(view: EditorView, kind: Pending['kind']): Pending {
  const existing = inlineAt(view, kind === 'link' ? 'Link' : 'Image')
  const range = existing ?? view.state.selection.main
  const source = view.state.sliceDoc(range.from, range.to)
  const parsedLink = existing ? parseLink(source) : null
  const parsedImage = existing ? parseImage(source) : null
  return {
    kind,
    view,
    from: range.from,
    to: range.to,
    link: parsedLink ?? { text: existing ? '' : source, url: '', newTab: false },
    image: parsedImage ?? { path: '', alt: existing ? '' : source }
  }
}

function replaceRange(pending: Pending, text: string): void {
  const { view, from, to } = pending
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
  view.focus()
}

interface Props {
  // The editor the buttons act on; null renders the toolbar disabled.
  view: EditorView | null
  compact?: boolean
}

// Markdown has no underline; the site allows raw HTML, so <u> does the job.
function underlined(view: EditorView, pos: number): boolean {
  const line = view.state.doc.lineAt(pos)
  const before = line.text.slice(0, pos - line.from)
  const open = before.lastIndexOf('<u>')
  return open >= 0 && !before.slice(open).includes('</u>')
}

// Styles in effect at the cursor: line markers from the text, inline ones from the tree.
function activeStyles(view: EditorView): Set<string> {
  const styles = new Set<string>()
  const pos = view.state.selection.main.head
  if (underlined(view, pos)) styles.add('underline')
  for (let node = syntaxTree(view.state).resolveInner(pos, -1); node.parent; node = node.parent) {
    const style = inlineStyles[node.name]
    if (style) styles.add(style)
  }
  return styles
}

export default function Toolbar({ view, compact }: Props): React.JSX.Element {
  // Selection and document changes in the active editor re-render the styles in effect.
  useActiveEditorState()
  const [pending, setPending] = useState<Pending | null>(null)
  const styles = view ? activeStyles(view) : new Set<string>()
  const block = view ? blockAt(view) : 'p'
  const keepFocus = (e: React.MouseEvent): void => e.preventDefault()
  const action = (
    key: string,
    title: string,
    label: React.ReactNode,
    fn: (v: EditorView) => void
  ): React.JSX.Element => (
    <button
      title={title}
      className={styles.has(key) ? 'on' : ''}
      disabled={!view}
      onMouseDown={keepFocus}
      onClick={() => view && fn(view)}
    >
      {label}
    </button>
  )
  return (
    <div className={compact ? 'toolbar compact' : 'toolbar'}>
      <select
        className="toolbar-block"
        title="Paragraph style"
        value={block}
        disabled={!view}
        onChange={(e) => view && setBlock(view, e.target.value as Block)}
      >
        {blockNames.map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
      <span className="toolbar-gap" />
      {action('bold', 'Bold', <b>B</b>, (v) => wrap(v, '**'))}
      {action('italic', 'Italic', <i>I</i>, (v) => wrap(v, '_'))}
      {action('underline', 'Underline', <u>U</u>, (v) => wrap(v, '<u>', '</u>'))}
      {action('strike', 'Strikethrough', <s>S</s>, (v) => wrap(v, '~~'))}
      {action('code', 'Code', <CodeXml size={15} />, (v) => wrap(v, '`'))}
      <span className="toolbar-gap" />
      <select
        className="toolbar-insert"
        value=""
        title="Insert a link, an image or a shortcode"
        disabled={!view}
        onChange={(e) => {
          if (!view) return
          const choice = e.target.value
          if (choice === 'link' || choice === 'image') setPending(pendingFor(view, choice))
          else if (snippets[choice]) insert(view, snippets[choice])
        }}
      >
        <option value="">Insert…</option>
        <option value="link">{styles.has('link') ? 'Edit link…' : 'Link…'}</option>
        <option value="image">{styles.has('image') ? 'Edit image…' : 'Image…'}</option>
        <option disabled>──────</option>
        <option value="screenshot">Screenshot</option>
        <option value="youtube">YouTube video</option>
        <option value="quote">Customer quote</option>
        <option value="tooltip">Tooltip</option>
      </select>
      {pending?.kind === 'link' && (
        <LinkDialog
          initial={pending.link}
          onCancel={() => setPending(null)}
          onSubmit={(values) => {
            setPending(null)
            replaceRange(pending, linkMarkdown(values))
          }}
        />
      )}
      {pending?.kind === 'image' && (
        <ImageDialog
          initial={pending.image}
          onCancel={() => setPending(null)}
          onSubmit={(values) => {
            setPending(null)
            replaceRange(pending, imageMarkdown(values))
          }}
        />
      )}
    </div>
  )
}
