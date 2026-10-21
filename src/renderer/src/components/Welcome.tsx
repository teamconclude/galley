import { useEffect, useState } from 'react'
import type { SetupStatus } from '../../../shared/types'
import { CloneDialog, NewSiteDialog } from './GitDialogs'
import SetupDialog from './SetupDialog'

export type SiteDialog = 'clone' | 'new' | null

interface Props {
  dialog: SiteDialog
  onDialog: (dialog: SiteDialog) => void
}

export default function Welcome({ dialog, onDialog: setDialog }: Props): React.JSX.Element {
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [showSetup, setShowSetup] = useState(true)
  const [recent, setRecent] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void window.api.setup.status().then(setSetup)
    void window.api.repo.recent().then(setRecent)
    return window.api.setup.onStatus(setSetup)
  }, [])
  const open = (path: string): void => {
    setError(null)
    window.api.repo.open(path).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e))
      void window.api.repo.recent().then(setRecent)
    })
  }
  return (
    <div className="welcome">
      <div className="titlebar" />
      <div className="welcome-body">
        <h1>Galley</h1>
        <p>
          Galley edits Hugo websites. Open a site checked out on this Mac, clone one from GitHub, or
          start a new one from the Galley template.
        </p>
        <div className="welcome-buttons">
          <button className="primary" onClick={() => void window.api.repo.choose()}>
            Open site checkout…
          </button>
          <button onClick={() => setDialog('clone')}>Clone a site…</button>
          <button onClick={() => setDialog('new')}>New site…</button>
          <button onClick={() => setShowSetup(true)}>Setup…</button>
        </div>
        {recent.length > 0 && (
          <div className="welcome-recent">
            <h2>Recent</h2>
            {recent.map((path) => (
              <button key={path} onClick={() => open(path)} title={path}>
                <span className="welcome-recent-name">{path.split('/').pop()}</span>
                <span className="welcome-recent-path">{path}</span>
              </button>
            ))}
          </div>
        )}
        {error && <p className="welcome-error">{error}</p>}
      </div>
      {dialog === 'clone' && <CloneDialog onCancel={() => setDialog(null)} />}
      {dialog === 'new' && <NewSiteDialog onCancel={() => setDialog(null)} />}
      {showSetup && setup && <SetupDialog status={setup} onClose={() => setShowSetup(false)} />}
    </div>
  )
}
