import { useEffect } from 'react'
import type { Preferences } from '../../../shared/types'

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
            checked={prefs.pushOnCommit}
            onChange={(e) => onChange({ ...prefs, pushOnCommit: e.target.checked })}
          />
          <span>
            Push every commit to GitHub
            <small>Your branch on GitHub always matches this Mac.</small>
          </span>
        </label>
        <label className="dialog-check">
          <input
            type="checkbox"
            checked={prefs.deleteMergedBranch}
            onChange={(e) => onChange({ ...prefs, deleteMergedBranch: e.target.checked })}
          />
          <span>
            Remove a branch once it is merged
            <small>After merging you continue on the shared branch.</small>
          </span>
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
