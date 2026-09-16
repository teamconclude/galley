import { createRoot, type Root } from 'react-dom/client'
import type { EditorState } from '@codemirror/state'
import type { EditorView, Panel, ViewUpdate } from '@codemirror/view'
import { getSearchQuery, openSearchPanel, SearchQuery, setSearchQuery } from '@codemirror/search'
import FindWidget from '../components/FindWidget'

const panels = new WeakMap<EditorView, FindPanel>()
const maxCount = 10_000

// Where the selection stands among the hits: "2 of 11".
export function tally(state: EditorState, query: SearchQuery): { count: number; current: number } {
  if (!query.valid) return { count: 0, current: 0 }
  const sel = state.selection.main
  let count = 0
  let current = 0
  const cursor = query.getCursor(state)
  for (let r = cursor.next(); !r.done && count < maxCount; r = cursor.next()) {
    count++
    if (r.value.from === sel.from && r.value.to === sel.to) current = count
  }
  return { count, current }
}

// CodeMirror's find panel, drawn by React in the corner of the editor.
export class FindPanel implements Panel {
  dom = document.createElement('div')
  top = true
  private root: Root
  private replace = false

  constructor(private view: EditorView) {
    this.dom.className = 'find-panel'
    this.root = createRoot(this.dom)
    panels.set(view, this)
    this.render()
  }

  update(update: ViewUpdate): void {
    const queryChanged = update.transactions.some((tr) =>
      tr.effects.some((e) => e.is(setSearchQuery))
    )
    if (update.docChanged || update.selectionSet || queryChanged) this.render()
  }

  destroy(): void {
    panels.delete(this.view)
    // The close button's click is a React event; unmounting waits for it to finish.
    setTimeout(() => this.root.unmount())
  }

  showReplace(show: boolean): void {
    this.replace = show
    this.render()
  }

  private render(): void {
    const query = getSearchQuery(this.view.state)
    const { count, current } = tally(this.view.state, query)
    this.root.render(
      <FindWidget
        view={this.view}
        query={query}
        count={count}
        current={current}
        replace={this.replace}
        onToggleReplace={() => this.showReplace(!this.replace)}
      />
    )
  }
}

// Opens the panel, seeded with the selection; with replace, the replace row is shown too.
export function openFind(view: EditorView, replace: boolean): void {
  openSearchPanel(view)
  if (replace) panels.get(view)?.showReplace(true)
}
