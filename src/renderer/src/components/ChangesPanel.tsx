import { useState } from 'react'
import type { Change, GitStatus } from '../../../shared/types'

interface Props {
  status: GitStatus | null
  selected: string | null
  onShowDiff: (change: Change) => void
  onDiscard: (change: Change) => void
  onCommit: (message: string, paths: string[]) => Promise<boolean>
  onPush: () => void
  onPull: () => void
  onUpdate: () => void
  onFetch: () => void
  onNewBranch: () => void
  onSwitchBranch: () => void
}

const kindMark: Record<Change['kind'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'N',
  conflict: '!'
}

function ago(time: number | null): string {
  if (!time) return 'not yet'
  const minutes = Math.round((Date.now() - time) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes === 1) return 'a minute ago'
  if (minutes < 60) return `${minutes} minutes ago`
  return `${Math.round(minutes / 60)} hours ago`
}

// GitHub's compare page for the current branch against the base branch.
function pullRequestUrl(status: GitStatus): string | null {
  const m = status.remoteUrl?.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/)
  if (!m || !status.branch || status.branch === status.base) return null
  return `https://github.com/${m[1]}/compare/${status.base}...${status.branch}?expand=1`
}

export default function ChangesPanel(props: Props): React.JSX.Element {
  const { status, selected, onShowDiff, onDiscard, onCommit } = props
  const { onPush, onPull, onUpdate, onFetch, onNewBranch, onSwitchBranch } = props
  const [message, setMessage] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [menuOpen, setMenuOpen] = useState(false)

  if (!status) return <div className="pane-empty">Reading the repository…</div>

  const changes = status.changes
  const included = changes.filter((c) => !excluded.has(c.path))
  const busy = status.busy !== null
  const prUrl = pullRequestUrl(status)

  const toggle = (path: string): void =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const commit = async (): Promise<void> => {
    const ok = await onCommit(
      message.trim(),
      included.map((c) => c.path)
    )
    if (ok) setMessage('')
  }

  return (
    <div className="changes">
      <div className="changes-branch">
        <span className="branch-icon">⎇</span>
        <span className="branch-name" title={status.branch || 'No branch'}>
          {status.branch || 'No branch'}
        </span>
        <button onClick={() => setMenuOpen(!menuOpen)} title="Branch actions">
          ⋯
        </button>
        {menuOpen && (
          <div className="branch-menu" onMouseLeave={() => setMenuOpen(false)}>
            <button
              onClick={() => {
                setMenuOpen(false)
                onNewBranch()
              }}
            >
              New branch…
            </button>
            <button
              onClick={() => {
                setMenuOpen(false)
                onSwitchBranch()
              }}
            >
              Switch branch…
            </button>
            <button
              onClick={() => {
                setMenuOpen(false)
                onFetch()
              }}
            >
              Check for updates now
            </button>
          </div>
        )}
      </div>

      <div className="changes-sync">
        {busy ? (
          <div className="sync-row">
            <span className="dot starting" />
            {status.busy}
          </div>
        ) : (
          <>
            {status.fetchError && (
              <div className="sync-row error" title={status.fetchError}>
                Could not reach GitHub. Checked {ago(status.lastFetch)}.
              </div>
            )}
            {status.protected && (
              <div className="sync-row warn">
                This is the shared {status.branch} branch. Work on your own branch instead.
                <button onClick={onNewBranch}>New branch</button>
              </div>
            )}
            {status.behind > 0 && (
              <div className="sync-row">
                {status.behind} new commit{status.behind === 1 ? '' : 's'} on this branch from
                others.
                <button onClick={onPull}>Pull</button>
              </div>
            )}
            {status.baseAhead > 0 && status.branch !== status.base && (
              <div className="sync-row">
                {status.baseAhead} change{status.baseAhead === 1 ? '' : 's'} on {status.base} not in
                this branch.
                <button onClick={onUpdate}>Update</button>
              </div>
            )}
            {status.ahead > 0 && (
              <div className="sync-row">
                {status.ahead} commit{status.ahead === 1 ? '' : 's'} to push.
                <button className="primary" onClick={onPush} disabled={status.protected}>
                  Push
                </button>
              </div>
            )}
            {!status.upstream && status.branch && !status.protected && status.ahead === 0 && (
              <div className="sync-row">
                This branch is not on GitHub yet.
                <button onClick={onPush}>Push</button>
              </div>
            )}
            {status.upstream && status.ahead === 0 && status.behind === 0 && (
              <div className="sync-row muted">
                In sync with GitHub. Checked {ago(status.lastFetch)}.
                {prUrl && changes.length === 0 && (
                  <button onClick={() => window.api.openExternal(prUrl)}>
                    Open pull request ↗
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="changes-head">
        <span>
          {changes.length === 0
            ? 'No changes'
            : `${changes.length} change${changes.length === 1 ? '' : 's'}`}
        </span>
        {changes.length > 1 && (
          <span className="changes-select">
            <button onClick={() => setExcluded(new Set())}>All</button>
            <button onClick={() => setExcluded(new Set(changes.map((c) => c.path)))}>None</button>
          </span>
        )}
      </div>
      <div className="changes-list">
        {changes.map((change) => (
          <div
            key={change.path}
            className={'change-row' + (selected === change.path ? ' selected' : '')}
          >
            <input
              type="checkbox"
              checked={!excluded.has(change.path)}
              onChange={() => toggle(change.path)}
              title="Include in the commit"
            />
            <span className={`change-mark ${change.kind}`} title={change.kind}>
              {kindMark[change.kind]}
            </span>
            <span className="change-path" title={change.path} onClick={() => onShowDiff(change)}>
              {change.path}
            </span>
            <button className="change-discard" title="Discard" onClick={() => onDiscard(change)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {changes.length > 0 && (
        <div className="commit-box">
          <textarea
            rows={3}
            placeholder="What did you change?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
          />
          {status.protected ? (
            <button className="primary" onClick={onNewBranch}>
              Create a branch to commit
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || message.trim() === '' || included.length === 0}
              onClick={() => void commit()}
            >
              Commit {included.length} file{included.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
