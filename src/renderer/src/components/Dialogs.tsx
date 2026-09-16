import { useEffect, useState } from 'react'
import { slugify } from '../lib/newPage'

interface DialogProps {
  title: string
  submitLabel: string
  canSubmit: boolean
  onSubmit: () => void
  onCancel: () => void
  children: React.ReactNode
}

export function Dialog(props: DialogProps): React.JSX.Element {
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

interface PromptProps {
  title: string
  label: string
  initial: string
  submitLabel: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function PromptDialog(props: PromptProps): React.JSX.Element {
  const { title, label, initial, submitLabel, onSubmit, onCancel } = props
  const [value, setValue] = useState(initial)
  return (
    <Dialog
      title={title}
      submitLabel={submitLabel}
      canSubmit={value.trim() !== ''}
      onSubmit={() => onSubmit(value.trim())}
      onCancel={onCancel}
    >
      <label className="dialog-field">
        <span>{label}</span>
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
    </Dialog>
  )
}

interface NewPageProps {
  directory: string
  onSubmit: (title: string, filename: string) => void
  onCancel: () => void
}

// The file name follows the title until the editor changes it by hand.
export function NewPageDialog({ directory, onSubmit, onCancel }: NewPageProps): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [filename, setFilename] = useState('')
  const [filenameEdited, setFilenameEdited] = useState(false)
  const shownFilename = filenameEdited ? filename : slugify(title) + (title ? '.md' : '')
  const valid = title.trim() !== '' && /^[a-z0-9][a-z0-9-]*\.md$/.test(shownFilename)
  return (
    <Dialog
      title="New page"
      submitLabel="Create"
      canSubmit={valid}
      onSubmit={() => onSubmit(title.trim(), shownFilename)}
      onCancel={onCancel}
    >
      <label className="dialog-field">
        <span>Title</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="dialog-field">
        <span>File name</span>
        <input
          value={shownFilename}
          placeholder="lowercase-with-hyphens.md"
          onChange={(e) => {
            setFilenameEdited(true)
            setFilename(e.target.value)
          }}
        />
      </label>
      <p className="dialog-note">
        Created in {directory || 'the checkout root'} as a draft, with the same settings as the
        newest page there.
      </p>
    </Dialog>
  )
}
