import { useState } from 'react'
import { CloneDialog } from './GitDialogs'

export default function Welcome(): React.JSX.Element {
  const [cloning, setCloning] = useState(false)
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
        </div>
      </div>
      {cloning && <CloneDialog onCancel={() => setCloning(false)} />}
    </div>
  )
}
