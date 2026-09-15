import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

// Formatting shown as formatting: headings larger, emphasis in type, links and code
// distinct, and the markdown marks themselves faded so the prose stands out.
const style = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.7em', fontWeight: '700' },
  { tag: t.heading2, fontSize: '1.45em', fontWeight: '700' },
  { tag: t.heading3, fontSize: '1.25em', fontWeight: '600' },
  { tag: [t.heading4, t.heading5, t.heading6], fontSize: '1.1em', fontWeight: '600' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent-text)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--text-muted)', textDecoration: 'none' },
  { tag: [t.labelName, t.string], color: 'var(--text-muted)', textDecoration: 'none' },
  {
    tag: t.monospace,
    fontFamily: 'var(--mono)',
    fontSize: '0.9em',
    background: 'var(--gray1)',
    borderRadius: '3px'
  },
  { tag: t.quote, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: t.comment, color: 'var(--gray4)' },
  { tag: t.contentSeparator, color: 'var(--gray4)' },
  { tag: t.processingInstruction, color: 'var(--gray4)', fontWeight: '400', textDecoration: 'none' }
])

const codeLine = Decoration.line({ class: 'cm-code-line' })

// Fenced code and raw HTML blocks keep a monospace font; nested language parsers
// replace the block's own token, so the lines are marked from the syntax tree instead.
const codeBlocks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = mark(view)
    }
    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = mark(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

function mark(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode' && node.name !== 'CodeBlock' && node.name !== 'HTMLBlock') {
          return undefined
        }
        for (let pos = node.from; pos <= node.to;) {
          const line = view.state.doc.lineAt(pos)
          builder.add(line.from, line.from, codeLine)
          pos = line.to + 1
        }
        return false
      }
    })
  }
  return builder.finish()
}

export const markdownStyle: Extension = [syntaxHighlighting(style), codeBlocks]
