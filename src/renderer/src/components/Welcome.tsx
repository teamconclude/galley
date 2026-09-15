import { useEffect, useState } from 'react'
import type { SetupStatus } from '../../../shared/types'
import { CloneDialog } from './GitDialogs'
import SetupDialog from './SetupDialog'

export default function Welcome(): React.JSX.Element {
  const [cloning, setCloning] = useState(false)
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [showSetup, setShowSetup] = useState(true)
  useEffect(() => {
    void window.api.setup.status().then(setSetup)
    return window.api.setup.onStatus(setSetup)
  }, [])
  return (
    <div className="welcome">
      <div className="titlebar" />
      <div className="welcome-body">
        <h1>Galley</h1>
        <p>
          Galley edits the conclude.io website. Open the folder where the site is checked out, or
          clone it from GitHub if this Mac has no checkout yet.
        </p>
        <div className="welcome-buttons">
          <button className="primary" onClick={() => void window.api.repo.choose()}>
            Open site checkout…
          </button>
          <button onClick={() => setCloning(true)}>Clone the site…</button>
          <button onClick={() => setShowSetup(true)}>Setup…</button>
        </div>
      </div>
      {cloning && <CloneDialog onCancel={() => setCloning(false)} />}
      {showSetup && setup && <SetupDialog status={setup} onClose={() => setShowSetup(false)} />}
    </div>
  )
}
