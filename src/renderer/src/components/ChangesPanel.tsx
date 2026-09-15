import { useEffect, useRef, useState } from 'react'
import { ChevronRight, RotateCcw } from 'lucide-react'
import type { Change, GitStatus, ReleaseStep } from '../../../shared/types'
import FileIcon from './FileIcon'
import Tip from './Tip'

interface Props {
  status: GitStatus | null
  selected: string | null
  onShowDiff: (change: Change) => void
  onDiscard: (change: Change) => void
  onDiscardAll: (changes: Change[]) => void
  onCommit: (message: string, paths: string[]) => Promise<boolean>
  onPush: () => void
  onPull: () => void
  onUpdate: () => void
  onFetch: () => void
  onNewBranch: () => void
  onSwitchBranch: () => void
  onMerge: () => void
  onRelease: (step: ReleaseStep) => void
  onPublish: (step: ReleaseStep) => void
}

const kindMark: Record<Change['kind'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'N',
  conflict: '!'
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

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
  const { status, selected, onShowDiff, onDiscard, onDiscardAll, onCommit } = props
  const { onPush, onPull, onUpdate, onFetch, onNewBranch, onSwitchBranch } = props
  const { onMerge, onRelease, onPublish } = props
  const [message, setMessage] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [menuOpen, setMenuOpen] = useState(false)

  if (!status) return <div className="pane-empty">Reading the repository…</div>

  const changes = status.changes
  const included = changes.filter((c) => !excluded.has(c.path))
  const busy = status.busy !== null
  const prUrl = pullRequestUrl(status)
  const ownBranch = status.branch !== '' && !status.protected && status.branch !== status.base
  const canMerge =
    ownBranch &&
    changes.length === 0 &&
    status.aheadOfBase > 0 &&
    status.baseAhead === 0 &&
    status.behind === 0

  const setIncluded = (paths: string[], include: boolean): void =>
    setExcluded((prev) => {
      const next = new Set(prev)
      for (const p of paths)
        if (include) next.delete(p)
        else next.add(p)
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
            {status.behind > 0 && !status.rebased && (
              <div className="sync-row">
                {plural(status.behind, 'new commit')} on this branch from others.
                <button onClick={onPull}>Pull</button>
              </div>
            )}
            {status.rebased && (
              <div className="sync-row">
                Updated from {status.base}; GitHub still has the old version of this branch.
                <button className="primary" onClick={onPush}>
                  Push
                </button>
              </div>
            )}
            {status.baseAhead > 0 && status.branch !== status.base && (
              <div className="sync-row">
                {plural(status.baseAhead, 'change')} on {status.base} not in this branch.
                <button onClick={onUpdate}>Update</button>
              </div>
            )}
            {status.ahead > 0 && !status.rebased && (
              <div className="sync-row">
                {plural(status.ahead, 'commit')} to push.
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
            {canMerge && (
              <div className="sync-row">
                {plural(status.aheadOfBase, 'commit')} ready for {status.base}.
                <button className="primary" onClick={onMerge}>
                  Merge into {status.base}…
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="changes-head">
        <span>{changes.length === 0 ? 'No changes' : plural(changes.length, 'change')}</span>
        {changes.length > 0 && (
          <span className="changes-select">
            {changes.length > 1 && (
              <>
                <button onClick={() => setExcluded(new Set())}>All</button>
                <button onClick={() => setExcluded(new Set(changes.map((c) => c.path)))}>
                  None
                </button>
              </>
            )}
            <button className="danger" onClick={() => onDiscardAll(changes)} disabled={busy}>
              Discard all
            </button>
          </span>
        )}
      </div>
      <div className="changes-list">
        <ChangeTree
          changes={changes}
          excluded={excluded}
          setIncluded={setIncluded}
          selected={selected}
          onShowDiff={onShowDiff}
          onDiscard={onDiscard}
        />
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
              Commit {plural(included.length, 'file')}
            </button>
          )}
        </div>
      )}

      {status.releases.length > 0 && (
        <div className="releases">
          <div className="changes-head">
            <span>Publishing</span>
          </div>
          <div className="changes-sync">
            {status.releases.map((step) =>
              step.count === 0 ? (
                <div key={step.to} className="sync-row muted">
                  {step.to} has everything from {step.from}.
                </div>
              ) : (
                <div key={step.to} className="sync-row">
                  {plural(step.count, 'change')} on {step.from} not yet on {step.to}.
                  <button
                    disabled={busy}
                    onClick={() => (step.to === 'production' ? onPublish(step) : onRelease(step))}
                  >
                    {step.to === 'production' ? 'Publish…' : `Merge into ${step.to}…`}
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// The changed files as a tree like the file list; folders holding only one subfolder
// collapse into a single row, so content/blog/post.md needs two rows, not three.
interface Node {
  name: string
  path: string
  dirs: Node[]
  files: Change[]
}

function buildTree(changes: Change[]): Node {
  const root: Node = { name: '', path: '', dirs: [], files: [] }
  for (const change of changes) {
    const parts = change.path.split('/')
    let node = root
    for (const part of parts.slice(0, -1)) {
      let next = node.dirs.find((d) => d.name === part)
      if (!next) {
        next = { name: part, path: node.path ? `${node.path}/${part}` : part, dirs: [], files: [] }
        node.dirs.push(next)
      }
      node = next
    }
    node.files.push(change)
  }
  return compact(root)
}

function compact(node: Node): Node {
  const dirs = node.dirs.map(compact).sort((a, b) => a.name.localeCompare(b.name))
  if (node.path && node.files.length === 0 && dirs.length === 1) {
    return { ...dirs[0], name: `${node.name}/${dirs[0].name}` }
  }
  return { ...node, dirs }
}

const filesUnder = (node: Node): Change[] => [...node.files, ...node.dirs.flatMap(filesUnder)]

const indent = 12
const rowStart = 6

interface TreeProps {
  changes: Change[]
  excluded: Set<string>
  setIncluded: (paths: string[], include: boolean) => void
  selected: string | null
  onShowDiff: (change: Change) => void
  onDiscard: (change: Change) => void
}

function ChangeTree(props: TreeProps): React.JSX.Element {
  const { changes, excluded, setIncluded, selected, onShowDiff, onDiscard } = props
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const root = buildTree(changes)

  const toggleCollapsed = (path: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const guides = (depth: number): React.JSX.Element[] =>
    Array.from({ length: depth }, (_, i) => (
      <span key={i} className="tree-guide" style={{ left: rowStart + i * indent + 7 }} />
    ))

  const renderDir = (node: Node, depth: number): React.JSX.Element => {
    const open = !collapsed.has(node.path)
    const files = filesUnder(node)
    const includedCount = files.filter((f) => !excluded.has(f.path)).length
    const state = includedCount === 0 ? 'none' : includedCount === files.length ? 'all' : 'some'
    return (
      <div key={node.path}>
        <div
          className="tree-item change-row"
          style={{ paddingLeft: rowStart + depth * indent }}
          onClick={() => toggleCollapsed(node.path)}
        >
          {guides(depth)}
          <TriCheckbox
            state={state}
            onChange={() =>
              setIncluded(
                files.map((f) => f.path),
                state !== 'all'
              )
            }
          />
          <span className={`tree-arrow${open ? ' open' : ''}`}>
            <ChevronRight size={16} />
          </span>
          <span className="tree-name">{node.name}</span>
        </div>
        {open && renderChildren(node, depth + 1)}
      </div>
    )
  }

  const renderFile = (change: Change, depth: number): React.JSX.Element => {
    const name = change.path.split('/').pop() ?? change.path
    return (
      <div
        key={change.path}
        className={'tree-item change-row' + (selected === change.path ? ' selected' : '')}
        style={{ paddingLeft: rowStart + depth * indent }}
        onClick={() => onShowDiff(change)}
      >
        {guides(depth)}
        <input
          type="checkbox"
          checked={!excluded.has(change.path)}
          onChange={() => setIncluded([change.path], excluded.has(change.path))}
          onClick={(e) => e.stopPropagation()}
          title="Include in the commit"
        />
        <FileIcon name={name} />
        <span className="tree-name" title={change.path}>
          {name}
        </span>
        <span className={`change-mark ${change.kind}`} title={change.kind}>
          {kindMark[change.kind]}
        </span>
        <Tip text={change.kind === 'untracked' ? 'Move to Trash' : 'Discard changes'}>
          <button
            className="change-discard"
            aria-label="Discard"
            onClick={(e) => {
              e.stopPropagation()
              onDiscard(change)
            }}
          >
            <RotateCcw size={14} />
          </button>
        </Tip>
      </div>
    )
  }

  const renderChildren = (node: Node, depth: number): React.JSX.Element => (
    <>
      {node.dirs.map((d) => renderDir(d, depth))}
      {node.files
        .slice()
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((f) => renderFile(f, depth))}
    </>
  )

  return renderChildren(root, 0)
}

function TriCheckbox(props: {
  state: 'all' | 'none' | 'some'
  onChange: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = props.state === 'some'
  }, [props.state])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={props.state === 'all'}
      onChange={props.onChange}
      onClick={(e) => e.stopPropagation()}
      title="Include these files in the commit"
    />
  )
}
