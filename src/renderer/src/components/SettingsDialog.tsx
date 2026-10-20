import { useEffect } from 'react'
import type { ClaudeModel, Preferences } from '../../../shared/types'

interface Props {
  prefs: Preferences
  onChange: (prefs: Preferences) => void
  onClose: () => void
}

export default function SettingsDialog({ prefs, onChange, onClose }: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <label className="dialog-check">
          <input
            type="checkbox"
            checked={prefs.deleteMergedBranch}
            onChange={(e) => onChange({ ...prefs, deleteMergedBranch: e.target.checked })}
          />
          <span>
            Remove a merged branch from GitHub
            <small>You keep working on it here; your next push brings it back.</small>
          </span>
        </label>
        <label className="dialog-check">
          <input
            type="checkbox"
            checked={prefs.claude}
            onChange={(e) => onChange({ ...prefs, claude: e.target.checked })}
          />
          <span>
            Claude Code pane
            <small>Opens Claude Code in the checkout. Off, setup does not install it.</small>
          </span>
        </label>
        <label className="dialog-field">
          <span>Claude model</span>
          <select
            value={prefs.claudeModel}
            disabled={!prefs.claude}
            onChange={(e) => onChange({ ...prefs, claudeModel: e.target.value as ClaudeModel })}
          >
            <option value="opus">Opus, the most careful</option>
            <option value="sonnet">Sonnet, quicker</option>
            <option value="default">As set in Claude Code</option>
          </select>
          <small>Takes effect when Claude restarts.</small>
        </label>
        <div className="dialog-buttons">
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
