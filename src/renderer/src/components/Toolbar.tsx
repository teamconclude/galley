import type { EditorView } from '@codemirror/view'
import { useActiveEditor } from '../lib/activeEditor'

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

// Replaces any existing marker of the same family and removes it when already applied.
function toggleLine(view: EditorView, prefix: string, family: RegExp): void {
  const line = view.state.doc.lineAt(view.state.selection.main.from)
  const current = line.text.match(family)?.[0] ?? ''
  const insert = current === prefix ? '' : prefix
  view.dispatch({ changes: { from: line.from, to: line.from + current.length, insert } })
  view.focus()
}

const heading = /^#{1,6} /
const bullet = /^[-*] /
const quote = /^> /

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
export default function Toolbar(): React.JSX.Element {
  const view = useActiveEditor()
  const keepFocus = (e: React.MouseEvent): void => e.preventDefault()
  const action = (
    title: string,
    label: React.ReactNode,
    fn: (v: EditorView) => void
  ): React.JSX.Element => (
    <button title={title} disabled={!view} onMouseDown={keepFocus} onClick={() => view && fn(view)}>
      {label}
    </button>
  )
  return (
    <div className="toolbar">
      {action('Bold', <b>B</b>, (v) => wrap(v, '**'))}
      {action('Italic', <i>I</i>, (v) => wrap(v, '_'))}
      {action('Heading', 'H2', (v) => toggleLine(v, '## ', heading))}
      {action('Subheading', 'H3', (v) => toggleLine(v, '### ', heading))}
      <span className="toolbar-gap" />
      {action('Link', 'Link', (v) => wrap(v, '[', '](https://)'))}
      {action('Image', 'Image', (v) => insert(v, '![Description](/images/…)'))}
      {action('Code', 'Code', (v) => wrap(v, '`'))}
      <span className="toolbar-gap" />
      {action('Bullet list', 'List', (v) => toggleLine(v, '- ', bullet))}
      {action('Quote block', 'Quote', (v) => toggleLine(v, '> ', quote))}
      <select
        value=""
        title="Insert a shortcode"
        disabled={!view}
        onChange={(e) => {
          const text = snippets[e.target.value]
          if (text && view) insert(view, text)
        }}
      >
        <option value="">Insert…</option>
        <option value="screenshot">Screenshot</option>
        <option value="youtube">YouTube video</option>
        <option value="quote">Customer quote</option>
        <option value="tooltip">Tooltip</option>
      </select>
      {!view && <span className="toolbar-hint">Click into a text to format it</span>}
    </div>
  )
}
