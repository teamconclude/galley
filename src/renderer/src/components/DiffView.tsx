import { RotateCcw } from 'lucide-react'
import type { Change } from '../../../shared/types'
import { splitDiff } from '../../../shared/diff'
import { wordDiff, type Segment } from '../lib/wordDiff'
import Tip from './Tip'

interface Props {
  change: Change
  diff: string | null
  onOpen: () => void
  onDiscard: () => void
  onRevertHunk: (index: number) => void
}

const kindLabel: Record<Change['kind'], string> = {
  modified: 'Changed',
  added: 'Added',
  deleted: 'Deleted',
  renamed: 'Renamed',
  untracked: 'New',
  conflict: 'Conflict'
}

interface Row {
  kind: 'add' | 'del' | 'context' | 'note'
  text: string
  segments?: Segment[]
}

// A run of removed lines directly followed by as many added lines is an edit of those
// lines; those pairs get word-level marks.
function rows(hunk: string): Row[] {
  const out: Row[] = hunk
    .split('\n')
    .slice(1)
    .map((line) => {
      if (line.startsWith('+')) return { kind: 'add', text: line.slice(1) }
      if (line.startsWith('-')) return { kind: 'del', text: line.slice(1) }
      if (line.startsWith('\\')) return { kind: 'note', text: line.slice(2) }
      return { kind: 'context', text: line.slice(1) }
    })
  for (let i = 0; i < out.length; i++) {
    if (out[i].kind !== 'del') continue
    let d = i
    while (d < out.length && out[d].kind === 'del') d++
    let a = d
    while (a < out.length && out[a].kind === 'add') a++
    if (d - i === a - d) {
      for (let k = 0; k < d - i; k++) {
        const pair = wordDiff(out[i + k].text, out[d + k].text)
        if (pair) [out[i + k].segments, out[d + k].segments] = pair
      }
    }
    i = a - 1
  }
  return out
}

// "@@ -23,7 +23,9 @@ context" becomes "Lines 23 to 31" of the current file.
function hunkLabel(header: string): string {
  const m = header.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
  if (!m) return header
  const start = Number(m[1])
  const count = m[2] === undefined ? 1 : Number(m[2])
  return count > 1 ? `Lines ${start} to ${start + count - 1}` : `Line ${start}`
}

export default function DiffView(props: Props): React.JSX.Element {
  const { change, diff, onOpen, onDiscard, onRevertHunk } = props
  const hunks = diff ? splitDiff(diff).hunks : []
  const canRevert = change.kind === 'modified' || change.kind === 'renamed'
  return (
    <div className="diff-view">
      <div className="pane-bar">
        <span className={`change-kind ${change.kind}`}>{kindLabel[change.kind]}</span>
        <span className="pane-title">{change.path}</span>
        {change.kind !== 'deleted' && <button onClick={onOpen}>Edit this file</button>}
        <button onClick={onDiscard}>Discard changes</button>
      </div>
      {diff === null ? (
        <div className="pane-empty">Loading…</div>
      ) : hunks.length === 0 ? (
        <div className="pane-empty">No differences to show.</div>
      ) : (
        <pre className="diff">
          {hunks.map((hunk, h) => (
            <div key={h} className="diff-hunk">
              <span className="diff-line hunk">
                <span>{hunkLabel(hunk.split('\n')[0])}</span>
                {canRevert && (
                  <Tip text="Revert this change">
                    <button aria-label="Revert this change" onClick={() => onRevertHunk(h)}>
                      <RotateCcw size={14} />
                    </button>
                  </Tip>
                )}
              </span>
              {rows(hunk).map((row, i) => (
                <span key={i} className={`diff-line ${row.kind}`}>
                  {row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '}
                  {row.segments
                    ? row.segments.map((s, k) =>
                        s.changed ? (
                          <mark key={k} className="diff-word">
                            {s.text}
                          </mark>
                        ) : (
                          s.text
                        )
                      )
                    : row.text || ' '}
                </span>
              ))}
            </div>
          ))}
        </pre>
      )}
    </div>
  )
}
