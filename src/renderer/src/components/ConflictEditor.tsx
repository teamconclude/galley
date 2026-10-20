import { useMemo, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { RebaseState } from '../../../shared/types'
import { conflictAt, conflictBlocks, conflictEditing, jumpToConflict } from '../lib/conflicts'
import Editor from './Editor'
import Tip from './Tip'

interface Props {
  path: string
  text: string
  state: RebaseState
  onChange: (text: string) => void
  onSave: () => void
  onContinue: () => void
  // Absent while the Claude pane is turned off.
  onAskClaude?: () => void
}

// A file git left with conflict markers, as plain text: page settings and body together,
// since the markers may sit in either. Each conflict can be settled with a click or by
// editing; Continue in the bar carries on once none are left. It opens at the first
// conflict, and the arrows in the bar go from one to the next.
export default function ConflictEditor(props: Props): React.JSX.Element {
  const { path, text, state, onChange, onSave, onContinue, onAskClaude } = props
  const left = conflictBlocks(text).length
  const theirs = state.from === 'GitHub' ? "GitHub's version" : `${state.from}'s version`
  const yours = state.edits ? 'your edit' : 'your version'
  const view = useRef<EditorView | null>(null)
  const [at, setAt] = useState(-1)
  const extensions = useMemo(
    () => [
      conflictEditing({ theirs, yours }),
      EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) setAt(conflictAt(update.state))
      })
    ],
    // The editor takes its extensions once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const onView = (v: EditorView | null): void => {
    if (v && !view.current) jumpToConflict(v, 'first')
    view.current = v
  }
  const jump = (direction: 'next' | 'previous'): void => {
    if (view.current) jumpToConflict(view.current, direction)
  }
  return (
    <div className="conflict-editor">
      <div className="pane-bar">
        <span className="change-kind conflict">Conflict</span>
        <span className="pane-title">{path}</span>
        {left > 0 && (
          <span className="conflict-nav">
            {at >= 0 ? `Conflict ${at + 1} of ${left}` : `${left} left`}
            <Tip text="Previous conflict (⌥↑)">
              <button aria-label="Previous conflict" onClick={() => jump('previous')}>
                <ChevronUp size={14} />
              </button>
            </Tip>
            <Tip text="Next conflict (⌥↓)">
              <button aria-label="Next conflict" onClick={() => jump('next')}>
                <ChevronDown size={14} />
              </button>
            </Tip>
          </span>
        )}
        {onAskClaude && left > 0 && (
          <button className="primary" onClick={onAskClaude}>
            Ask Claude to resolve
          </button>
        )}
        <button className={left === 0 ? 'primary' : ''} onClick={onContinue}>
          Continue
        </button>
      </div>
      <div className="conflict-note">
        {left === 0
          ? 'No conflicts left in this file. Check the text, then click Continue.'
          : `${left === 1 ? 'One place' : `${left} places`} where ${theirs} (blue) and ${yours} (green) differ. Keep one, both, or edit the text until it reads right.`}
      </div>
      <Editor
        key={path}
        filename={path}
        value={text}
        onChange={onChange}
        onSave={onSave}
        extensions={extensions}
        onView={onView}
        plain
      />
    </div>
  )
}
