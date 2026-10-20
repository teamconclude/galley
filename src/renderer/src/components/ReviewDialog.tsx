import { useEffect, useState } from 'react'
import type { Commit, GitStatus, Identity, PageInfo } from '../../../shared/types'
import type { ReviewLink } from '../../../shared/reviewLink'
import CommitList from './CommitList'
import { Dialog } from './Dialogs'

interface Props {
  link: ReviewLink
  status: GitStatus | null
  me: Identity | null
  // The page the link names, when the site has it.
  page: PageInfo | null
  onOpen: () => Promise<void>
  onChooseRepo: () => void
  onCancel: () => void
}

type Check =
  | { state: 'checking' }
  | { state: 'ready'; commits: Commit[] }
  | { state: 'missing' }
  | { state: 'other-repo'; here: string }
  | { state: 'failed'; message: string }

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

function names(list: string[]): string {
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
}

// A review link shows what it would open, the branch's commits and who made them, before
// anything changes in the checkout. Uncommitted work is committed to the editor's own
// branch first; on a shared branch it has to move to a branch of its own.
export default function ReviewDialog(props: Props): React.JSX.Element {
  const { link, status, me, page, onOpen, onChooseRepo, onCancel } = props
  const [check, setCheck] = useState<Check>({ state: 'checking' })
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const here = await window.api.git.repoSlug()
        if (link.repo && here && link.repo.toLowerCase() !== here.toLowerCase()) {
          return live && setCheck({ state: 'other-repo', here })
        }
        if (!(await window.api.git.fetchBranch(link.branch))) {
          return live && setCheck({ state: 'missing' })
        }
        const commits = await window.api.git.log({ kind: 'review', branch: link.branch })
        if (live) setCheck({ state: 'ready', commits })
      } catch (e) {
        if (live) setCheck({ state: 'failed', message: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => {
      live = false
    }
  }, [link])

  const changes = (status?.changes ?? []).filter((c) => !c.warning)
  const here = status?.branch ?? ''
  const already = here === link.branch
  const blocked = changes.length > 0 && !!status?.protected && !already
  const authors = check.state === 'ready' ? [...new Set(check.commits.map((c) => c.author))] : []
  const what = page ? `“${page.title}”` : (link.page ?? link.url)

  const open = async (): Promise<void> => {
    setOpening(true)
    setError(null)
    try {
      await onOpen()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setOpening(false)
    }
  }

  return (
    <Dialog
      title={`Review ${link.branch}`}
      submitLabel={opening ? 'Opening…' : already ? 'Open page' : 'Open branch'}
      canSubmit={check.state === 'ready' && !blocked && !opening}
      onSubmit={() => void open()}
      onCancel={onCancel}
    >
      {check.state === 'checking' && (
        <p className="dialog-note">Getting {link.branch} from GitHub…</p>
      )}
      {check.state === 'missing' && (
        <p className="dialog-note error">
          GitHub has no branch {link.branch}. It may have been merged and removed, or the link has a
          typo.
        </p>
      )}
      {check.state === 'other-repo' && (
        <>
          <p className="dialog-note error">
            This link is for {link.repo}, but Galley has {check.here} open.
          </p>
          <button type="button" onClick={onChooseRepo}>
            Open another checkout…
          </button>
        </>
      )}
      {check.state === 'failed' && <p className="dialog-note error">{check.message}</p>}
      {check.state === 'ready' && (
        <>
          <p className="dialog-note">
            {check.commits.length === 0
              ? `${link.branch} has nothing that ${status?.base ?? 'the base'} does not have yet.`
              : `${plural(check.commits.length, 'commit')} by ${names(authors)} that ${status?.base ?? 'the base'} does not have yet.`}
            {what && ` Opens ${what}.`}
          </p>
          {check.commits.length > 0 && (
            <div className="review-commits">
              <CommitList
                range={{ kind: 'review', branch: link.branch }}
                total={check.commits.length}
                me={me}
              />
            </div>
          )}
          {!already && changes.length > 0 && (
            <p className={'dialog-note' + (blocked ? ' error' : '')}>
              {blocked
                ? `Your ${plural(changes.length, 'change')} on ${here}, a shared branch, would come along. Move ${changes.length === 1 ? 'it' : 'them'} to a branch of your own first with New branch.`
                : `Your ${plural(changes.length, 'change')} on ${here} ${changes.length === 1 ? 'is' : 'are'} committed there first, to wait for you on ${here}.`}
            </p>
          )}
          {!already && (
            <p className="dialog-note">
              Galley switches to {link.branch}. The bar at the top takes you back to {here}.
            </p>
          )}
        </>
      )}
      {error && <p className="dialog-note error">{error}</p>}
    </Dialog>
  )
}
