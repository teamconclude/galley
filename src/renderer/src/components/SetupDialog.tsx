import { Check, Circle, CircleAlert, LoaderCircle, Minus } from 'lucide-react'
import { useState } from 'react'
import type { SetupStatus, SetupStep } from '../../../shared/types'

interface Props {
  status: SetupStatus
  onClose: () => void
}

// Walks a fresh Mac through the downloads, the GitHub sign-in and the site checkout.
export default function SetupDialog({ status, onClose }: Props): React.JSX.Element {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const copied = copiedCode !== null && copiedCode === status.device?.code
  const copy = (): void => {
    if (!status.device) return
    void navigator.clipboard.writeText(status.device.code)
    setCopiedCode(status.device.code)
  }
  return (
    <div className="modal-backdrop">
      <div className="dialog setup">
        <h2>{status.complete ? 'Galley is ready' : 'Getting Galley ready'}</h2>
        <ul className="setup-steps">
          {status.steps.map((step) => (
            <li key={step.id} className={`setup-step ${step.state}`}>
              <StateIcon step={step} />
              <div className="setup-text">
                <div className="setup-label">
                  {step.label}
                  {step.percent !== undefined && (
                    <span className="setup-percent"> {step.percent}%</span>
                  )}
                </div>
                {step.detail && <div className="setup-detail">{step.detail}</div>}
                {step.id === 'github' && status.device && (
                  <div className="setup-device">
                    <code>{status.device.code}</code>
                    <button onClick={copy}>{copied ? 'Copied' : 'Copy code'}</button>
                    <button onClick={() => window.api.openExternal(status.device!.url)}>
                      Open github.com
                    </button>
                  </div>
                )}
              </div>
              <div className="setup-actions">
                {step.id === 'github' && step.state === 'action' && !status.device && (
                  <>
                    <button className="primary" onClick={() => void window.api.setup.signIn()}>
                      Sign in to GitHub
                    </button>
                    <button onClick={() => window.api.setup.skipGithub()}>Skip</button>
                  </>
                )}
                {step.id === 'github' && status.device && (
                  <button onClick={() => window.api.setup.cancelSignIn()}>Cancel</button>
                )}
                {step.id === 'github' && step.state === 'done' && (
                  <button onClick={() => window.api.setup.signOut()}>Sign out</button>
                )}
                {step.id === 'github' && step.state === 'skipped' && status.githubConfigured && (
                  <button onClick={() => void window.api.setup.signIn()}>Sign in</button>
                )}
                {step.id === 'site' && step.state === 'action' && (
                  <>
                    <button className="primary" onClick={() => void window.api.setup.cloneSite()}>
                      Get the site
                    </button>
                    <button onClick={() => void window.api.repo.choose()}>Open a checkout…</button>
                  </>
                )}
                {step.state === 'failed' && (
                  <button onClick={() => void window.api.setup.retry(step.id)}>Retry</button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="dialog-buttons">
          <button className={status.complete ? 'primary' : ''} onClick={onClose}>
            {status.complete ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StateIcon({ step }: { step: SetupStep }): React.JSX.Element {
  switch (step.state) {
    case 'done':
      return <Check size={18} className="setup-icon done" />
    case 'running':
      return <LoaderCircle size={18} className="setup-icon running spin" />
    case 'failed':
      return <CircleAlert size={18} className="setup-icon failed" />
    case 'skipped':
      return <Minus size={18} className="setup-icon skipped" />
    default:
      return <Circle size={18} className="setup-icon pending" />
  }
}
