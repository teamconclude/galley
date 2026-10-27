import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Change, Commit, CommitRange, Identity } from '../../../shared/types'
import { ago } from '../lib/time'
import { DiffBody } from './DiffView'

interface Props {
  range: CommitRange
  // How many commits the range holds, when known; the list stops at the first hundred.
  total?: number
  me: Identity | null
  // Reloads the list when it changes, e.g. after a fetch.
  version?: string
  // Names the people besides the user whose work is in the list, before a merge.
  summary?: boolean
  // Shows a file a commit changed beside the list, e.g. where the editor is; without it,
  // the changes open in the list itself.
  onShowFile?: (commit: Commit, change: Change) => void
  // The file shown that way, as its commit's hash and its path.
  shown?: { hash: string; path: string } | null
}

const kindMark: Partial<Record<Change['kind'], string>> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R'
}

const shownFiles = 4

const mine = (c: Commit, me: Identity | null): boolean =>
  me !== null && (c.email.toLowerCase() === me.email.toLowerCase() || c.author === me.name)

function names(list: string[]): string {
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
}

// Each commit opens into the files it changed, and each file into its changes.
export default function CommitList(props: Props): React.JSX.Element {
  const { range, total = 0, me, version, summary, onShowFile, shown } = props
  const [commits, setCommits] = useState<Commit[] | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (hash: string): void =>
    setOpen((was) => {
      const next = new Set(was)
      if (!next.delete(hash)) next.add(hash)
      return next
    })
  const key = JSON.stringify(range)
  useEffect(() => {
    let live = true
    window.api.git
      .log(JSON.parse(key) as CommitRange)
      .then((list) => live && setCommits(list))
      .catch(() => live && setCommits([]))
    return () => {
      live = false
    }
  }, [key, version])

  if (commits === null) return <div className="commit-list-note">Loading…</div>
  const others = [...new Set(commits.filter((c) => !mine(c, me)).map((c) => c.author))]
  return (
    <div className="commit-list">
      {summary && (
        <p className={'commit-list-note' + (others.length > 0 ? ' others' : '')}>
          {others.length > 0 ? `Includes work by ${names(others)}.` : 'All of it is your work.'}
        </p>
      )}
      <ul>
        {commits.map((c) => (
          <li key={c.hash} className="commit">
            <button
              type="button"
              className="commit-head"
              aria-expanded={open.has(c.hash)}
              title={open.has(c.hash) ? 'Hide the changes' : 'Show the changes'}
              onClick={() => toggle(c.hash)}
            >
              <span className={`tree-arrow${open.has(c.hash) ? ' open' : ''}`}>
                <ChevronRight size={12} />
              </span>
              <span className="commit-subject">{c.subject}</span>
            </button>
            <div className="commit-meta">
              <span className={mine(c, me) ? '' : 'commit-author'}>
                {mine(c, me) ? 'You' : c.author}
              </span>{' '}
              · {ago(c.date)}
            </div>
            {open.has(c.hash) ? (
              <CommitFiles commit={c} onShowFile={onShowFile} shown={shown} />
            ) : (
              c.files.length > 0 && (
                <div className="commit-files" title={c.files.join('\n')}>
                  {c.files
                    .slice(0, shownFiles)
                    .map((f) => f.split('/').pop())
                    .join(', ')}
                  {c.files.length > shownFiles && ` and ${c.files.length - shownFiles} more`}
                </div>
              )
            )}
          </li>
        ))}
      </ul>
      {total > commits.length && (
        <div className="commit-list-note">and {total - commits.length} older</div>
      )}
    </div>
  )
}

function CommitFiles(props: {
  commit: Commit
  onShowFile?: (commit: Commit, change: Change) => void
  shown?: { hash: string; path: string } | null
}): React.JSX.Element {
  const { commit, onShowFile, shown } = props
  const [files, setFiles] = useState<Change[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [inline, setInline] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    window.api.git
      .commitFiles(commit.hash)
      .then((list) => live && setFiles(list))
      .catch((e: unknown) => live && setFailed(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [commit.hash])

  if (failed) return <div className="commit-list-note">{failed}</div>
  if (files === null) return <div className="commit-list-note">Loading…</div>
  if (files.length === 0) return <div className="commit-list-note">No files changed.</div>
  return (
    <ul className="commit-changes">
      {files.map((f) => {
        const slash = f.path.lastIndexOf('/')
        const on = onShowFile
          ? shown?.hash === commit.hash && shown.path === f.path
          : inline === f.path
        return (
          <li key={f.path}>
            <button
              type="button"
              className={'commit-file' + (on ? ' selected' : '')}
              title={f.from ? `${f.from} → ${f.path}` : f.path}
              onClick={() => (onShowFile ? onShowFile(commit, f) : setInline(on ? null : f.path))}
            >
              <span className={`change-mark ${f.kind}`}>{kindMark[f.kind]}</span>
              <span className="commit-file-name">{f.path.slice(slash + 1)}</span>
              <span className="commit-file-dir">{f.path.slice(0, slash + 1)}</span>
            </button>
            {on && !onShowFile && <InlineDiff commit={commit.hash} change={f} />}
          </li>
        )
      })}
    </ul>
  )
}

function InlineDiff({ commit, change }: { commit: string; change: Change }): React.JSX.Element {
  const [diff, setDiff] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    window.api.git
      .commitDiff(commit, change)
      .then((text) => live && setDiff(text))
      .catch(() => live && setDiff(''))
    return () => {
      live = false
    }
  }, [commit, change])
  return (
    <div className="commit-diff">
      <DiffBody change={change} diff={diff} commit={commit} />
    </div>
  )
}
