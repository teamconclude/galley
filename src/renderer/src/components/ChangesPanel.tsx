import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert
} from 'lucide-react'
import type {
  Change,
  CommitRange,
  GitStatus,
  Identity,
  OutsideEntry,
  ReleaseStep
} from '../../../shared/types'
import { ago } from '../lib/time'
import CommitList from './CommitList'
import FileIcon from './FileIcon'
import Tip from './Tip'

interface Props {
  status: GitStatus | null
  me: Identity | null
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
  onMove: () => void
  onOutside: (entry: OutsideEntry, action: 'reveal' | 'include' | 'trash') => void
  onRelease: (step: ReleaseStep) => void
  onPublish: (step: ReleaseStep) => void
  // Copies a review link for the branch and the open page; false when there is none.
  onCopyLink: () => Promise<boolean>
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

// A shared branch with the address it is built for, e.g. "staging (conclude.dev)".
const named = (branch: string, site: string | null): string =>
  site ? `${branch} (${site})` : branch

// GitHub's compare page for the current branch against the base branch.
function pullRequestUrl(status: GitStatus): string | null {
  const m = status.remoteUrl?.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/)
  if (!m || !status.branch || status.branch === status.base) return null
  return `https://github.com/${m[1]}/compare/${status.base}...${status.branch}?expand=1`
}

export default function ChangesPanel(props: Props): React.JSX.Element {
  const { status, me, selected, onShowDiff, onDiscard, onDiscardAll, onCommit } = props
  const { onPush, onPull, onUpdate, onFetch, onNewBranch, onSwitchBranch } = props
  const { onMerge, onMove, onOutside, onRelease, onPublish, onCopyLink } = props
  const [copied, setCopied] = useState(false)
  const copyLink = async (): Promise<void> => {
    if (!(await onCopyLink())) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }
  const [message, setMessage] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [menuOpen, setMenuOpen] = useState(false)

  // A new file that looks out of place starts left out of the commit, once; ticking it
  // afterwards is the editor's choice.
  const [warned, setWarned] = useState<Set<string>>(() => new Set())
  const misplaced = (status?.changes ?? []).filter((c) => c.warning && !warned.has(c.path))
  if (misplaced.length > 0) {
    const paths = misplaced.map((c) => c.path)
    setWarned(new Set([...warned, ...paths]))
    setExcluded((prev) => new Set([...prev, ...paths]))
  }

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

  // Lists reload when GitHub was checked or a count moved.
  const version = [
    status.lastFetch,
    status.ahead,
    status.behind,
    status.baseAhead,
    status.aheadOfBase,
    ...status.releases.map((r) => r.count)
  ].join(':')
  const countRow = (
    range: CommitRange,
    total: number,
    text: string,
    action?: React.ReactNode
  ): React.JSX.Element => (
    <CountRow range={range} total={total} text={text} me={me} version={version}>
      {action}
    </CountRow>
  )

  const commit = async (): Promise<void> => {
    const doubtful = included.filter((c) => c.warning)
    if (doubtful.length > 0) {
      const list = doubtful.map((c) => `• ${c.warning}`).join('\n')
      const files = doubtful.length === 1 ? 'This file looks' : 'These files look'
      if (!window.confirm(`${files} out of place:\n\n${list}\n\nCommit anyway?`)) return
    }
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
            {!status.protected && (
              <button
                disabled={!status.upstream}
                title={
                  status.upstream
                    ? 'A link that opens this branch, and the open page, in a colleague’s Galley'
                    : 'Push the branch first'
                }
                onClick={() => {
                  setMenuOpen(false)
                  void copyLink()
                }}
              >
                Copy review link
              </button>
            )}
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
            {status.protected &&
              status.ahead > 0 &&
              countRow(
                { kind: 'outgoing' },
                status.ahead,
                `${plural(status.ahead, 'commit')} here cannot go to GitHub from ${status.branch}.`,
                <button className="primary" onClick={onMove}>
                  Move to a new branch…
                </button>
              )}
            {status.behind > 0 &&
              !status.rebased &&
              !(status.protected && status.ahead > 0) &&
              countRow(
                { kind: 'incoming' },
                status.behind,
                status.protected
                  ? `${plural(status.behind, 'new commit')} on GitHub.`
                  : `${plural(status.behind, 'new commit')} on this branch from others.`,
                <button onClick={onPull}>Pull</button>
              )}
            {status.rebased && (
              <div className="sync-row">
                Updated from {status.base}; GitHub still has the old version of this branch.
                <button className="primary" onClick={onPush}>
                  Push
                </button>
              </div>
            )}
            {!status.protected &&
              status.baseAhead > 0 &&
              status.branch !== status.base &&
              countRow(
                { kind: 'base' },
                status.baseAhead,
                `${plural(status.baseAhead, 'change')} on ${status.base} not in this branch.`,
                <button onClick={onUpdate}>Update</button>
              )}
            {!status.protected &&
              status.ahead > 0 &&
              !status.rebased &&
              countRow(
                { kind: 'outgoing' },
                status.ahead,
                `${plural(status.ahead, 'commit')} to push.`,
                <PushButton onPush={onPush} />
              )}
            {!status.upstream &&
              status.branch &&
              !status.protected &&
              (status.aheadOfBase > 0 ? (
                countRow(
                  { kind: 'outgoing' },
                  status.aheadOfBase,
                  `${plural(status.aheadOfBase, 'commit')} not on GitHub yet.`,
                  <PushButton onPush={onPush} />
                )
              ) : (
                <div className="sync-row muted">Everything on this branch is in {status.base}.</div>
              ))}
            {status.upstream && status.ahead === 0 && status.behind === 0 && (
              <div className="sync-row muted">
                In sync with GitHub. Checked {ago(status.lastFetch)}.
                {prUrl && changes.length === 0 && (
                  <button onClick={() => window.api.openExternal(prUrl)}>
                    Open pull request ↗
                  </button>
                )}
                {!status.protected && status.aheadOfBase > 0 && (
                  <button
                    title="A link that opens this branch, and the open page, in a colleague’s Galley"
                    onClick={() => void copyLink()}
                  >
                    {copied ? 'Copied ✓' : 'Copy review link'}
                  </button>
                )}
              </div>
            )}
            {canMerge &&
              countRow(
                { kind: 'branch' },
                status.aheadOfBase,
                `${plural(status.aheadOfBase, 'commit')} ready for ${named(status.base, status.baseSite)}.`,
                <button className="primary" onClick={onMerge}>
                  Merge into {status.base}…
                </button>
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
        {status.outside.length > 0 && (
          <div className="outside">
            <div className="changes-head">
              <span>Not part of the site</span>
            </div>
            <p className="outside-note">
              Files the site does not use, so they are not committed. Move them somewhere else, or
              add them if they belong to the site.
            </p>
            {status.outside.map((entry) => (
              <div key={entry.path} className="tree-item change-row">
                {entry.isDir ? (
                  <Folder
                    className="file-icon"
                    size={16}
                    strokeWidth={1.75}
                    color="#6d8086"
                    aria-hidden
                  />
                ) : (
                  <FileIcon name={entry.path} />
                )}
                <span className="tree-name" title={entry.path}>
                  {entry.path}
                  {entry.isDir && (
                    <span className="outside-count"> {plural(entry.files, 'file')}</span>
                  )}
                </span>
                <Tip text="Show in Finder">
                  <button
                    className="change-discard"
                    aria-label="Show in Finder"
                    onClick={() => onOutside(entry, 'reveal')}
                  >
                    <FolderOpen size={14} />
                  </button>
                </Tip>
                <Tip text="Add to the site…">
                  <button
                    className="change-discard"
                    aria-label="Add to the site"
                    onClick={() => onOutside(entry, 'include')}
                  >
                    <Plus size={14} />
                  </button>
                </Tip>
                <Tip text="Move to Trash…">
                  <button
                    className="change-discard"
                    aria-label="Move to Trash"
                    onClick={() => onOutside(entry, 'trash')}
                  >
                    <Trash2 size={14} />
                  </button>
                </Tip>
              </div>
            ))}
          </div>
        )}
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
                  {named(step.to, step.site)} has everything from {step.from}.
                </div>
              ) : (
                <CountRow
                  key={step.to}
                  range={{ kind: 'release', from: step.from, to: step.to }}
                  total={step.count}
                  text={`${plural(step.count, 'change')} on ${step.from} not yet on ${named(step.to, step.site)}.`}
                  me={me}
                  version={version}
                >
                  <Tip
                    text={
                      step.to === 'production'
                        ? `Puts ${step.from} live on ${step.site ?? step.to} through a pull request`
                        : `Merges ${step.from} into ${step.to}; ${step.site ?? 'the site'} follows in minutes`
                    }
                  >
                    <button
                      disabled={busy}
                      onClick={() => (step.to === 'production' ? onPublish(step) : onRelease(step))}
                    >
                      {step.to === 'production' ? 'Publish…' : `Merge into ${step.to}…`}
                    </button>
                  </Tip>
                </CountRow>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Pushing only uploads; saying so keeps it apart from publishing.
function PushButton({ onPush }: { onPush: () => void }): React.JSX.Element {
  return (
    <Tip text="Uploads your commits to your branch on GitHub. Nothing goes live.">
      <button className="primary" onClick={onPush}>
        Push
      </button>
    </Tip>
  )
}

// A count that opens into the commits behind it.
function CountRow(props: {
  range: CommitRange
  total: number
  text: string
  me: Identity | null
  version: string
  children?: React.ReactNode
}): React.JSX.Element {
  const { range, total, text, me, version, children } = props
  const [open, setOpen] = useState(false)
  return (
    <div className="count-row">
      <div className="sync-row">
        <button
          className="count-toggle"
          aria-expanded={open}
          title={open ? 'Hide the commits' : 'Show the commits'}
          onClick={() => setOpen(!open)}
        >
          <span className={`tree-arrow${open ? ' open' : ''}`}>
            <ChevronRight size={14} />
          </span>
          {text}
        </button>
        {children}
      </div>
      {open && <CommitList range={range} total={total} me={me} version={version} />}
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
        {change.warning && (
          <Tip text={change.warning}>
            <span className="change-warning" aria-label={change.warning}>
              <TriangleAlert size={14} />
            </span>
          </Tip>
        )}
        <span className={`change-mark ${change.kind}`} title={change.kind}>
          {kindMark[change.kind]}
        </span>
        <Tip
          text={
            change.kind === 'untracked' || change.kind === 'added'
              ? 'Move to Trash'
              : 'Discard changes'
          }
        >
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
