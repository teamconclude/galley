import { useEffect, useState } from 'react'
import type { Identity } from '../../../shared/types'

interface FrameProps {
  title: string
  submitLabel: string
  canSubmit: boolean
  onSubmit: () => void
  onCancel: () => void
  children: React.ReactNode
}

function Frame(props: FrameProps): React.JSX.Element {
  const { title, submitLabel, canSubmit, onSubmit, onCancel, children } = props
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form
        className="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) onSubmit()
        }}
      >
        <h2>{title}</h2>
        {children}
        <div className="dialog-buttons">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!canSubmit}>
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

interface ConfirmProps {
  title: string
  action: string
  onConfirm: () => void
  onCancel: () => void
  children: React.ReactNode
}

export function ConfirmDialog(props: ConfirmProps): React.JSX.Element {
  const { title, action, onConfirm, onCancel, children } = props
  return (
    <Frame title={title} submitLabel={action} canSubmit onSubmit={onConfirm} onCancel={onCancel}>
      {children}
    </Frame>
  )
}

interface NewBranchProps {
  base: string
  prefix: string
  onSubmit: (name: string) => void
  onCancel: () => void
}

const branchName = /^[A-Za-z0-9][A-Za-z0-9._/-]*[A-Za-z0-9]$/

export function NewBranchDialog({
  base,
  prefix,
  onSubmit,
  onCancel
}: NewBranchProps): React.JSX.Element {
  const [name, setName] = useState(prefix)
  const valid = branchName.test(name) && !name.includes('..') && name !== prefix
  return (
    <Frame
      title="New branch"
      submitLabel="Create"
      canSubmit={valid}
      onSubmit={() => onSubmit(name)}
      onCancel={onCancel}
    >
      <label className="dialog-field">
        <span>Branch name</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value.trim())} />
      </label>
      <p className="dialog-note">
        Starts from the latest {base} on GitHub. Changes you have not committed come along.
      </p>
    </Frame>
  )
}

interface SwitchBranchProps {
  branches: string[]
  current: string
  onSubmit: (name: string) => void
  onCancel: () => void
}

export function SwitchBranchDialog(props: SwitchBranchProps): React.JSX.Element {
  const { branches, current, onSubmit, onCancel } = props
  const [name, setName] = useState(current)
  return (
    <Frame
      title="Switch branch"
      submitLabel="Switch"
      canSubmit={name !== '' && name !== current}
      onSubmit={() => onSubmit(name)}
      onCancel={onCancel}
    >
      <label className="dialog-field">
        <span>Branch</span>
        <select autoFocus value={name} onChange={(e) => setName(e.target.value)}>
          {branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <p className="dialog-note">Commit or discard your changes first if switching fails.</p>
    </Frame>
  )
}

interface IdentityProps {
  onSubmit: (identity: Identity) => void
  onCancel: () => void
}

export function IdentityDialog({ onSubmit, onCancel }: IdentityProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const valid = name.trim() !== '' && /^[^@\s]+@[^@\s]+$/.test(email.trim())
  return (
    <Frame
      title="Who is committing?"
      submitLabel="Save"
      canSubmit={valid}
      onSubmit={() => onSubmit({ name: name.trim(), email: email.trim() })}
      onCancel={onCancel}
    >
      <p className="dialog-note">
        Git records a name and email with every commit. They are saved for this checkout.
      </p>
      <label className="dialog-field">
        <span>Name</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="dialog-field">
        <span>Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
    </Frame>
  )
}

interface CloneProps {
  onCancel: () => void
}

const defaultUrl = 'https://github.com/teamconclude/Conclude-web.git'

// Clones into <folder>/<repository name>; progress lines stream in from git.
export function CloneDialog({ onCancel }: CloneProps): React.JSX.Element {
  const [url, setUrl] = useState(defaultUrl)
  const [folder, setFolder] = useState<string | null>(null)
  const [progress, setProgress] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () => window.api.git.onCloneProgress((line) => setProgress((p) => [...p.slice(-6), line])),
    []
  )

  const repoName =
    url
      .trim()
      .replace(/\/$/, '')
      .split(/[/:]/)
      .pop()
      ?.replace(/\.git$/, '') ?? ''
  const dest = folder && repoName ? `${folder}/${repoName}` : null

  const start = async (): Promise<void> => {
    if (!dest) return
    setRunning(true)
    setError(null)
    try {
      await window.api.git.clone(url.trim(), dest)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRunning(false)
    }
  }

  return (
    <Frame
      title="Clone the site"
      submitLabel={running ? 'Cloning…' : 'Clone'}
      canSubmit={!running && dest !== null && url.trim() !== ''}
      onSubmit={() => void start()}
      onCancel={onCancel}
    >
      <label className="dialog-field">
        <span>Repository</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} disabled={running} />
      </label>
      <div className="dialog-field">
        <span>Folder</span>
        <div className="dialog-row">
          <span className="dialog-path">{dest ?? 'Choose where to put the checkout'}</span>
          <button
            type="button"
            disabled={running}
            onClick={() => void window.api.git.chooseFolder().then((f) => f && setFolder(f))}
          >
            Choose…
          </button>
        </div>
      </div>
      {progress.length > 0 && <pre className="dialog-log">{progress.join('\n')}</pre>}
      {error && <p className="dialog-note error">{error}</p>}
      <p className="dialog-note">
        Needs access to the repository on GitHub with your SSH key or saved login.
      </p>
    </Frame>
  )
}
