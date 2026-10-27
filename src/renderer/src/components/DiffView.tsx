import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { Change, Commit } from '../../../shared/types'
import { splitDiff } from '../../../shared/diff'
import { wordDiff, type Segment } from '../lib/wordDiff'
import Tip from './Tip'

interface Props {
  change: Change
  diff: string | null
  // A change a commit made, shown as it is: no discarding or reverting.
  commit?: Commit
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
  conflict: 'Conflict',
  resolved: 'Resolved'
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

const imageFile = /\.(png|jpe?g|gif|webp|svg|ico|avif)$/i

// An image as committed next to the one in the checkout, whichever of them exist; for a
// commit's change, as it was before the commit and after.
function ImageDiff({ change, commit }: { change: Change; commit?: string }): React.JSX.Element {
  const [before, setBefore] = useState<string | null>(null)
  const [after, setAfter] = useState<string | null>(null)
  // The query keeps the browser from showing an earlier load of the same file.
  const [loaded] = useState(() => Date.now())
  const hadBefore = change.kind !== 'untracked' && change.kind !== 'added'
  useEffect(() => {
    if (!hadBefore) return
    let live = true
    const was = change.from ?? change.path
    void (
      commit ? window.api.git.commitImage(commit, was, true) : window.api.git.committedImage(was)
    ).then((url) => live && setBefore(url))
    return () => {
      live = false
    }
  }, [change.path, change.from, hadBefore, commit])
  useEffect(() => {
    if (!commit || change.kind === 'deleted') return
    let live = true
    void window.api.git.commitImage(commit, change.path, false).then((url) => live && setAfter(url))
    return () => {
      live = false
    }
  }, [change.path, change.kind, commit])
  const now = commit ? after : `galley://repo/${change.path}?v=${loaded}`
  return (
    <div className="image-diff">
      {hadBefore && (
        <figure>
          {before && <img src={before} alt="" />}
          <figcaption>Before</figcaption>
        </figure>
      )}
      {change.kind !== 'deleted' && (
        <figure>
          {now && <img src={now} alt="" />}
          <figcaption>
            {commit ? (hadBefore ? 'After' : 'New') : hadBefore ? 'Now' : 'New'}
          </figcaption>
        </figure>
      )}
    </div>
  )
}

// "@@ -23,7 +23,9 @@ context" becomes "Lines 23 to 31" of the current file.
function hunkLabel(header: string): string {
  const m = header.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
  if (!m) return header
  const start = Number(m[1])
  const count = m[2] === undefined ? 1 : Number(m[2])
  return count > 1 ? `Lines ${start} to ${start + count - 1}` : `Line ${start}`
}

// The changed lines, hunk by hunk, or a picture before and after.
export function DiffBody(props: {
  change: Change
  diff: string | null
  commit?: string
  onRevertHunk?: (index: number) => void
}): React.JSX.Element {
  const { change, diff, commit, onRevertHunk } = props
  const hunks = diff ? splitDiff(diff).hunks : []
  const canRevert = !!onRevertHunk && (change.kind === 'modified' || change.kind === 'renamed')
  if (imageFile.test(change.path)) {
    return <ImageDiff key={`${commit}:${change.path}`} change={change} commit={commit} />
  }
  if (diff === null) return <div className="pane-empty">Loading…</div>
  if (hunks.length === 0) return <div className="pane-empty">No differences to show.</div>
  return (
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
  )
}

export default function DiffView(props: Props): React.JSX.Element {
  const { change, diff, commit, onOpen, onDiscard, onRevertHunk } = props
  return (
    <div className="diff-view">
      <div className="pane-bar">
        <span className={`change-kind ${change.kind}`}>{kindLabel[change.kind]}</span>
        <span className="pane-title">
          {change.path}
          {commit && (
            <span className="diff-commit" title={`${commit.author}, ${commit.hash.slice(0, 8)}`}>
              {' '}
              in “{commit.subject}”
            </span>
          )}
        </span>
        {change.kind !== 'deleted' && !change.gone && (
          <button onClick={onOpen}>Edit this file</button>
        )}
        {!commit && <button onClick={onDiscard}>Discard changes</button>}
      </div>
      <DiffBody
        change={change}
        diff={diff}
        commit={commit?.hash}
        onRevertHunk={commit ? undefined : onRevertHunk}
      />
    </div>
  )
}
