import { useEffect, useState } from 'react'
import { Share } from 'lucide-react'
import type { GitStatus } from '../../../shared/types'

export interface Shared {
  link: string
  // The branch, or commits on it, went to GitHub first.
  pushed: boolean
}

interface Props {
  status: GitStatus | null
  // The open page, which the link opens too.
  page: string | null
  // Copies the link, sending the branch to GitHub first where needed; null when nothing
  // was copied.
  onShare: () => Promise<Shared | null>
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

// Copies a review link to the current branch and the open page, for a colleague's
// Galley, and shows what it copied. Only GitHub can hand a branch on, so a branch or
// commits it lacks are sent there first.
export default function ShareButton({ status, page, onShare }: Props): React.JSX.Element {
  const [shared, setShared] = useState<Shared | null>(null)

  useEffect(() => {
    if (!shared) return
    const timer = window.setTimeout(() => setShared(null), 8000)
    const close = (): void => setShared(null)
    window.addEventListener('mousedown', close)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousedown', close)
    }
  }, [shared])

  const branch = status?.branch ?? ''
  const sends = !!status && !status.protected && (!status.upstream || status.ahead > 0)
  const open = (status?.changes ?? []).length
  const what = `${branch}${page ? ' and this page' : ''}`
  const tip = !branch
    ? 'Nothing to share outside a branch'
    : `Copy a review link to ${what}${sends ? `, after sending ${branch} to GitHub` : ''}`

  return (
    <span className="share">
      <button
        className="icon-button"
        aria-label="Share"
        title={tip}
        disabled={!branch}
        onClick={() => void onShare().then(setShared)}
      >
        <Share size={15} />
      </button>
      {shared && (
        <div className="share-popover" onMouseDown={(e) => e.stopPropagation()}>
          <strong>Review link copied</strong>
          <code>{shared.link}</code>
          <span>
            Paste it in Slack or a pull request. It opens {what} in a colleague’s Galley.
            {shared.pushed && ` Galley sent ${branch} to GitHub first.`}
          </span>
          {open > 0 && (
            <span className="share-warning">
              Your {plural(open, 'uncommitted change')} {open === 1 ? 'is' : 'are'} not in it;
              commit {open === 1 ? 'it' : 'them'} to include {open === 1 ? 'it' : 'them'}.
            </span>
          )}
        </div>
      )}
    </span>
  )
}
