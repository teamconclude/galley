import { useEffect, useState } from 'react'
import type { BranchInfo, Identity } from '../../../shared/types'
import { siteRepoUrl } from '../../../shared/site'

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
  // Edits are pending, so the branch starts where the checkout stands.
  dirty: boolean
  // Says what happens instead of the usual note, e.g. when commits move along.
  note?: string
  onSubmit: (name: string) => void
  onCancel: () => void
}

const branchName = /^[A-Za-z0-9][A-Za-z0-9._/-]*[A-Za-z0-9]$/

export function NewBranchDialog(props: NewBranchProps): React.JSX.Element {
  const { base, prefix, dirty, note, onSubmit, onCancel } = props
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
        {note ??
          (dirty
            ? `Your uncommitted changes come along. After the commit, Update brings the branch to the latest ${base}.`
            : `Starts from the latest ${base} on GitHub.`)}
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

interface DeleteBranchProps {
  branches: string[]
  current: string
  base: string
  onSubmit: (name: string, onGitHub: boolean) => void
  onCancel: () => void
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

// Deleting a branch, e.g. a playground that is done with. It says what goes with it, and
// deletes the copy on GitHub too unless colleagues' work is on the branch.
export function DeleteBranchDialog(props: DeleteBranchProps): React.JSX.Element {
  const { branches, current, base, onSubmit, onCancel } = props
  const [name, setName] = useState(branches.includes(current) ? current : (branches[0] ?? ''))
  // What deleting is about to remove, for the branch it was looked up for.
  const [loaded, setLoaded] = useState<{ name: string; info: BranchInfo } | null>(null)
  const info = loaded?.name === name ? loaded.info : null
  const [onGitHub, setOnGitHub] = useState(false)
  useEffect(() => {
    if (!name) return
    let live = true
    void window.api.git.branchInfo(name).then((found) => {
      if (!live) return
      setLoaded({ name, info: found })
      setOnGitHub(found.onGitHub && found.others.length === 0)
    })
    return () => {
      live = false
    }
  }, [name])
  return (
    <Frame
      title="Delete branch"
      submitLabel="Delete"
      canSubmit={info !== null}
      onSubmit={() => onSubmit(name, onGitHub)}
      onCancel={onCancel}
    >
      {branches.length === 0 ? (
        <p className="dialog-note">
          You have no branches of your own to delete. Only branches named with your prefix can be
          deleted here.
        </p>
      ) : (
        <>
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
          {info && (
            <>
              <p className="dialog-note">
                {info.commits === 0
                  ? `Everything on ${name} is in ${base}, so nothing is lost.`
                  : `${plural(info.commits, 'commit')} on ${name} ${info.commits === 1 ? 'is' : 'are'} not in ${base} and will be lost.`}
                {name === current && ` You are on ${name}; Galley switches to ${base} first.`}
              </p>
              {info.onGitHub && (
                <label className="dialog-check">
                  <input
                    type="checkbox"
                    checked={onGitHub}
                    onChange={(e) => setOnGitHub(e.target.checked)}
                  />
                  <span>
                    Delete it on GitHub too
                    <small>
                      {info.others.length > 0
                        ? `It holds work by ${info.others.join(', ')}, which this removes for everyone.`
                        : 'Review links to it stop working.'}
                    </small>
                  </span>
                </label>
              )}
            </>
          )}
        </>
      )}
    </Frame>
  )
}

interface IdentityProps {
  // What to suggest, e.g. the GitHub profile.
  initial?: Partial<Identity>
  onSubmit: (identity: Identity) => void
  onCancel: () => void
}

export function IdentityDialog({ initial, onSubmit, onCancel }: IdentityProps): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const valid = name.trim() !== '' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
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

interface OpenSiteProps {
  onCancel: () => void
}

// Opens a checkout already on this Mac, or clones one from GitHub into
// <folder>/<repository name> with git's progress streaming in.
export function OpenSiteDialog({ onCancel }: OpenSiteProps): React.JSX.Element {
  const [source, setSource] = useState<'local' | 'github'>('local')
  const [url, setUrl] = useState('')
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
    if (source === 'local') {
      await window.api.repo.choose()
      return
    }
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
      title="Open a site"
      submitLabel={source === 'local' ? 'Choose Folder…' : running ? 'Cloning…' : 'Clone'}
      canSubmit={source === 'local' || (!running && dest !== null && url.trim() !== '')}
      onSubmit={() => void start()}
      onCancel={onCancel}
    >
      <div className="segmented dialog-source">
        <button
          type="button"
          className={source === 'local' ? 'on' : ''}
          disabled={running}
          onClick={() => setSource('local')}
        >
          On this Mac
        </button>
        <button
          type="button"
          className={source === 'github' ? 'on' : ''}
          disabled={running}
          onClick={() => setSource('github')}
        >
          From GitHub
        </button>
      </div>
      {source === 'local' ? (
        <p className="dialog-note">
          Choose the folder that holds the site: the one with its Hugo configuration, such as
          hugo.yaml or config.toml.
        </p>
      ) : (
        <>
          <label className="dialog-field">
            <span>Repository</span>
            <input
              autoFocus
              value={url}
              placeholder={siteRepoUrl}
              onChange={(e) => setUrl(e.target.value)}
              disabled={running}
            />
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
        </>
      )}
    </Frame>
  )
}

interface NewSiteProps {
  onCancel: () => void
}

const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// The folder name for a site name, e.g. "Acme Robotics" -> acme-robotics.
const slug = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// Makes <folder>/<slug> from the Galley template. Asks who commits only when neither git
// nor the GitHub sign-in says.
export function NewSiteDialog({ onCancel }: NewSiteProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [folder, setFolder] = useState<string | null>(null)
  const [known, setKnown] = useState<Identity | null | undefined>(undefined)
  const [author, setAuthor] = useState('')
  const [email, setEmail] = useState('')
  const [progress, setProgress] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.repo.defaultIdentity().then(setKnown)
    return window.api.git.onCloneProgress((line) => setProgress((p) => [...p.slice(-6), line]))
  }, [])

  const dest = folder && slug(name) ? `${folder}/${slug(name)}` : null
  const identity: Identity | null =
    known ??
    (author.trim() && validEmail.test(email.trim())
      ? { name: author.trim(), email: email.trim() }
      : null)

  const start = async (): Promise<void> => {
    if (!dest || !identity) return
    setRunning(true)
    setError(null)
    try {
      await window.api.repo.createSite(name.trim(), dest, known ? null : identity)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRunning(false)
    }
  }

  return (
    <Frame
      title="New site"
      submitLabel={running ? 'Creating…' : 'Create'}
      canSubmit={!running && dest !== null && identity !== null}
      onSubmit={() => void start()}
      onCancel={onCancel}
    >
      <label className="dialog-field">
        <span>Name</span>
        <input
          autoFocus
          value={name}
          placeholder="My site"
          onChange={(e) => setName(e.target.value)}
          disabled={running}
        />
      </label>
      <div className="dialog-field">
        <span>Folder</span>
        <div className="dialog-row">
          <span className="dialog-path">{dest ?? 'Choose where to put the site'}</span>
          <button
            type="button"
            disabled={running}
            onClick={() => void window.api.git.chooseFolder().then((f) => f && setFolder(f))}
          >
            Choose…
          </button>
        </div>
      </div>
      {known === null && (
        <>
          <label className="dialog-field">
            <span>Your name</span>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} disabled={running} />
          </label>
          <label className="dialog-field">
            <span>Your email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={running} />
          </label>
        </>
      )}
      {progress.length > 0 && <pre className="dialog-log">{progress.join('\n')}</pre>}
      {error && <p className="dialog-note error">{error}</p>}
      <p className="dialog-note">
        Starts from the Galley template: a home page built from blocks, an about page and a blog.
        The site stays on this Mac until you add a GitHub repository for it.
      </p>
    </Frame>
  )
}
