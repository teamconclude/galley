import { EditorState, Prec, StateField, type Extension, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from '@codemirror/view'

// One conflict git left in a file, by line number: the <<<<<<< line, the ======= line
// and the >>>>>>> line. Above ======= is the version that came in, below it the editor's.
export interface ConflictBlock {
  start: number
  middle: number
  end: number
}

export function conflictBlocks(text: string): ConflictBlock[] {
  const blocks: ConflictBlock[] = []
  let start: number | null = null
  let middle: number | null = null
  text.split('\n').forEach((line, i) => {
    const n = i + 1
    if (/^<{7}( |$)/.test(line)) {
      start = n
      middle = null
    } else if (start !== null && middle === null && /^={7}$/.test(line)) {
      middle = n
    } else if (start !== null && middle !== null && /^>{7}( |$)/.test(line)) {
      blocks.push({ start, middle, end: n })
      start = middle = null
    }
  })
  return blocks
}

// The conflict the cursor is in, counted from 0; -1 when it is in none.
export function conflictAt(state: EditorState): number {
  const line = state.doc.lineAt(state.selection.main.head).number
  return conflictBlocks(state.doc.toString()).findIndex((b) => b.start <= line && line <= b.end)
}

// Moves the cursor to the start of the next or previous conflict, round to the other end
// of the file, or to the first one; false when there are none.
export function jumpToConflict(
  view: EditorView,
  direction: 'next' | 'previous' | 'first'
): boolean {
  const { doc } = view.state
  const blocks = conflictBlocks(doc.toString())
  if (blocks.length === 0) return false
  const line = doc.lineAt(view.state.selection.main.head).number
  const target =
    direction === 'first'
      ? blocks[0]
      : direction === 'next'
        ? (blocks.find((b) => b.start > line) ?? blocks[0])
        : (blocks.findLast((b) => b.end < line) ?? blocks[blocks.length - 1])
  const at = doc.line(target.start).from
  view.dispatch({
    selection: { anchor: at },
    effects: EditorView.scrollIntoView(at, { y: 'center' })
  })
  view.focus()
  return true
}

type Choice = 'theirs' | 'yours' | 'both'

// What the buttons call the two versions, e.g. "develop's version" and "your version".
export interface ConflictLabels {
  theirs: string
  yours: string
}

// Replaces the conflict that starts on the given line with the chosen version.
function settle(view: EditorView, start: number, choice: Choice): void {
  const { doc } = view.state
  const block = conflictBlocks(doc.toString()).find((b) => b.start === start)
  if (!block) return
  const lines = (from: number, to: number): string[] =>
    Array.from({ length: to - from }, (_, i) => doc.line(from + i).text)
  const theirs = lines(block.start + 1, block.middle)
  const yours = lines(block.middle + 1, block.end)
  const kept = choice === 'theirs' ? theirs : choice === 'yours' ? yours : [...theirs, ...yours]
  const last = block.end === doc.lines
  const from = doc.line(block.start).from
  const to = last ? doc.line(block.end).to : doc.line(block.end + 1).from
  const insert = kept.length === 0 ? '' : kept.join('\n') + (last ? '' : '\n')
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from } })
  view.focus()
}

class ActionsWidget extends WidgetType {
  constructor(
    readonly start: number,
    readonly labels: ConflictLabels
  ) {
    super()
  }

  eq(other: ActionsWidget): boolean {
    return other.start === this.start && other.labels === this.labels
  }

  toDOM(view: EditorView): HTMLElement {
    const bar = document.createElement('div')
    bar.className = 'cm-conflict-actions'
    const add = (text: string, choice: Choice): void => {
      const button = document.createElement('button')
      button.textContent = text
      button.onmousedown = (e) => e.preventDefault()
      button.onclick = () => settle(view, this.start, choice)
      bar.append(button)
    }
    add(`Keep ${this.labels.theirs}`, 'theirs')
    add(`Keep ${this.labels.yours}`, 'yours')
    add('Keep both', 'both')
    return bar
  }
}

function decorations(state: EditorState, labels: ConflictLabels): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const line = (n: number, cls: string): void => {
    ranges.push(Decoration.line({ class: cls }).range(state.doc.line(n).from))
  }
  for (const block of conflictBlocks(state.doc.toString())) {
    const at = state.doc.line(block.start).from
    ranges.push(
      Decoration.widget({
        widget: new ActionsWidget(block.start, labels),
        block: true,
        side: -1
      }).range(at)
    )
    line(block.start, 'cm-conflict-marker')
    for (let n = block.start + 1; n < block.middle; n++) line(n, 'cm-conflict-theirs')
    line(block.middle, 'cm-conflict-marker')
    for (let n = block.middle + 1; n < block.end; n++) line(n, 'cm-conflict-yours')
    line(block.end, 'cm-conflict-marker')
  }
  return Decoration.set(ranges, true)
}

// Colours the two versions in each conflict and puts buttons above it to keep one, the
// other, or both. Editing by hand works as anywhere else. Option-up and -down go from
// conflict to conflict, ahead of moving lines, which they do elsewhere.
export function conflictEditing(labels: ConflictLabels): Extension {
  return [
    // Block widgets have to come from a state field rather than a view plugin.
    StateField.define<DecorationSet>({
      create: (state) => decorations(state, labels),
      update: (value, tr) => (tr.docChanged ? decorations(tr.state, labels) : value),
      provide: (field) => EditorView.decorations.from(field)
    }),
    Prec.high(
      keymap.of([
        { key: 'Alt-ArrowDown', run: (view) => jumpToConflict(view, 'next') },
        { key: 'Alt-ArrowUp', run: (view) => jumpToConflict(view, 'previous') }
      ])
    )
  ]
}
