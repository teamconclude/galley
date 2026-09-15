import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/types'

// Shows a new release in the title bar and walks through download and restart.
export function UpdateButton(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => {
    void window.api.update.status().then(setStatus)
    return window.api.update.onStatus(setStatus)
  }, [])
  switch (status.state) {
    case 'available':
      return (
        <button className="update" onClick={() => void window.api.update.download()}>
          Update to {status.version}
        </button>
      )
    case 'downloading':
      return <span className="update-progress">Downloading {status.percent}%</span>
    case 'ready':
      return (
        <button className="update primary" onClick={() => window.api.update.install()}>
          Restart to update
        </button>
      )
    case 'manual':
      return (
        <button
          className="update"
          title={`${status.problem}. Opens the download page instead.`}
          onClick={() => window.api.openExternal(status.url)}
        >
          Download {status.version}
        </button>
      )
    case 'error':
      return (
        <span className="update-error" title={status.message}>
          Update failed
        </span>
      )
    default:
      return null
  }
}
