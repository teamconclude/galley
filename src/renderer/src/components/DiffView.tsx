import type { Change } from '../../../shared/types'

interface Props {
  change: Change
  diff: string | null
  onOpen: () => void
  onDiscard: () => void
}

function lineClass(line: string): string {
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+++') || line.startsWith('---')) return 'meta'
  if (line.startsWith('diff ') || line.startsWith('index ')) return 'meta'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return ''
}

const kindLabel: Record<Change['kind'], string> = {
  modified: 'Changed',
  added: 'Added',
  deleted: 'Deleted',
  renamed: 'Renamed',
  untracked: 'New',
  conflict: 'Conflict'
}

export default function DiffView({ change, diff, onOpen, onDiscard }: Props): React.JSX.Element {
  const lines = diff?.replace(/\n$/, '').split('\n') ?? []
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
      ) : lines.length === 0 || diff.trim() === '' ? (
        <div className="pane-empty">No differences to show.</div>
      ) : (
        <pre className="diff">
          {lines.map((line, i) => (
            <span key={i} className={`diff-line ${lineClass(line)}`}>
              {line || ' '}
            </span>
          ))}
        </pre>
      )}
    </div>
  )
}
