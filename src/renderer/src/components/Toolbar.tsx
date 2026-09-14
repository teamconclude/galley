import type { EditorView } from '@codemirror/view'

interface Props {
  view: EditorView | null
}

function wrap(view: EditorView, before: string, after = before): void {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  view.dispatch({
    changes: { from, to, insert: before + selected + after },
    selection: { anchor: from + before.length, head: from + before.length + selected.length }
  })
  view.focus()
}

function prefixLine(view: EditorView, prefix: string): void {
  const line = view.state.doc.lineAt(view.state.selection.main.from)
  view.dispatch({ changes: { from: line.from, insert: prefix } })
  view.focus()
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

export default function Toolbar({ view }: Props): React.JSX.Element {
  const run = (fn: (v: EditorView) => void) => () => view && fn(view)
  return (
    <div className="toolbar">
      <button title="Bold" onClick={run((v) => wrap(v, '**'))}>
        <b>B</b>
      </button>
      <button title="Italic" onClick={run((v) => wrap(v, '_'))}>
        <i>I</i>
      </button>
      <button title="Heading" onClick={run((v) => prefixLine(v, '## '))}>
        H2
      </button>
      <button title="Subheading" onClick={run((v) => prefixLine(v, '### '))}>
        H3
      </button>
      <span className="toolbar-gap" />
      <button title="Link" onClick={run((v) => wrap(v, '[', '](https://)'))}>
        Link
      </button>
      <button title="Image" onClick={run((v) => insert(v, '![Description](/images/…)'))}>
        Image
      </button>
      <button title="Code" onClick={run((v) => wrap(v, '`'))}>
        Code
      </button>
      <span className="toolbar-gap" />
      <button title="Bullet list" onClick={run((v) => prefixLine(v, '- '))}>
        List
      </button>
      <button title="Quote block" onClick={run((v) => prefixLine(v, '> '))}>
        Quote
      </button>
      <select
        value=""
        title="Insert a shortcode"
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
    </div>
  )
}
