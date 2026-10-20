import { useEffect, useState } from 'react'
import { Share } from 'lucide-react'
import type { GitStatus } from '../../../shared/types'

interface Props {
  status: GitStatus | null
  // The open page, which the link opens too.
  page: string | null
  // Copies the link and returns it, or null when there is nothing to share.
  onShare: () => Promise<string | null>
}

// Copies a review link to the branch and the open page, for a colleague's Galley, and
// shows what it copied. A branch only GitHub can hand on, so it needs pushing first.
export default function ShareButton({ status, page, onShare }: Props): React.JSX.Element {
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(null), 6000)
    const close = (): void => setCopied(null)
    window.addEventListener('mousedown', close)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousedown', close)
    }
  }, [copied])

  const branch = status?.branch ?? ''
  const ready = !!branch && !!status?.upstream
  const tip = !branch
    ? 'Nothing to share outside a branch'
    : ready
      ? `Copy a review link to ${branch}${page ? ' and this page' : ''}`
      : `Push ${branch} to GitHub to share it`

  return (
    <span className="share">
      <button
        className="icon-button"
        aria-label="Share"
        title={tip}
        disabled={!ready}
        onClick={() => void onShare().then(setCopied)}
      >
        <Share size={15} />
      </button>
      {copied && (
        <div className="share-popover" onMouseDown={(e) => e.stopPropagation()}>
          <strong>Review link copied</strong>
          <code>{copied}</code>
          <span>
            Paste it in Slack or a pull request. It opens {branch}
            {page ? ' and this page' : ''} in a colleague’s Galley.
          </span>
        </div>
      )}
    </span>
  )
}
