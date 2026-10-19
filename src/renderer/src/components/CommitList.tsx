import { useEffect, useState } from 'react'
import type { Commit, CommitRange, Identity } from '../../../shared/types'
import { ago } from '../lib/time'

interface Props {
  range: CommitRange
  // How many commits the range holds; the list stops at the first hundred.
  total: number
  me: Identity | null
  // Reloads the list when it changes, e.g. after a fetch.
  version?: string
  // Names the people besides the user whose work is in the list, before a merge.
  summary?: boolean
}

const shownFiles = 4

const mine = (c: Commit, me: Identity | null): boolean =>
  me !== null && (c.email.toLowerCase() === me.email.toLowerCase() || c.author === me.name)

function names(list: string[]): string {
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
}

export default function CommitList(props: Props): React.JSX.Element {
  const { range, total, me, version, summary } = props
  const [commits, setCommits] = useState<Commit[] | null>(null)
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
            <div className="commit-subject">{c.subject}</div>
            <div className="commit-meta">
              <span className={mine(c, me) ? '' : 'commit-author'}>
                {mine(c, me) ? 'You' : c.author}
              </span>{' '}
              · {ago(c.date)}
            </div>
            {c.files.length > 0 && (
              <div className="commit-files" title={c.files.join('\n')}>
                {c.files
                  .slice(0, shownFiles)
                  .map((f) => f.split('/').pop())
                  .join(', ')}
                {c.files.length > shownFiles && ` and ${c.files.length - shownFiles} more`}
              </div>
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
