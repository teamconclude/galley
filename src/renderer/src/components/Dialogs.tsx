import { useEffect, useState } from 'react'
import { documentParts, slugify, type DocumentParts } from '../lib/newPage'

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

export interface NewPage {
  title: string
  filename: string
  date: Date
  // The document the page is made from, when one was chosen.
  document: { parts: DocumentParts; images: string[] } | null
}

interface NewPageProps {
  directory: string
  // The address of the folder's pages, e.g. /blog/.
  sectionUrl: string
  onSubmit: (page: NewPage) => void
  onCancel: () => void
}

// A datetime-local value for a moment, in local time, to the minute.
const localInput = (d: Date): string =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length

// The address follows the title until the editor changes it by hand. A document fills in
// the title and becomes the page's text.
export function NewPageDialog(props: NewPageProps): React.JSX.Element {
  const { directory, sectionUrl, onSubmit, onCancel } = props
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [date, setDate] = useState(() => {
    const now = new Date()
    now.setMinutes(0, 0, 0)
    return localInput(now)
  })
  const [document, setDocument] = useState<NewPage['document']>(null)
  const [docName, setDocName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const shownSlug = slugEdited ? slug : slugify(title)
  const valid = title.trim() !== '' && /^[a-z0-9][a-z0-9-]*$/.test(shownSlug) && date !== ''

  const chooseDocument = async (): Promise<void> => {
    setError(null)
    try {
      const doc = await window.api.repo.chooseDocument()
      if (!doc) return
      const parts = documentParts(doc.markdown)
      setDocument({ parts, images: doc.images })
      setDocName(doc.name)
      if (parts.title) setTitle(parts.title)
      if (parts.slug) {
        setSlug(parts.slug)
        setSlugEdited(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const links = document ? (document.parts.body.match(/(^|[^!])\[[^\]]*\]\(/g) ?? []).length : 0
  return (
    <Dialog
      title="New page"
      submitLabel="Create"
      canSubmit={valid}
      onSubmit={() =>
        onSubmit({
          title: title.trim(),
          filename: shownSlug + '.md',
          date: new Date(date),
          document
        })
      }
      onCancel={onCancel}
    >
      <div className="dialog-row">
        <button type="button" onClick={() => void chooseDocument()}>
          {document ? 'Another document…' : 'From a document…'}
        </button>
        <span className="dialog-note">
          {document
            ? `${docName}: ${words(document.parts.body)} words, ${links} links, ` +
              `${document.images.length} pictures`
            : 'Word, Markdown or a web page, with its links'}
        </span>
      </div>
      {error && <p className="dialog-note error">{error}</p>}
      {document?.parts.notes && (
        <details className="dialog-notes">
          <summary>Notes above the headline, not put on the page</summary>
          <pre>{document.parts.notes}</pre>
        </details>
      )}
      <label className="dialog-field">
        <span>Title</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        <small>The headline readers see at the top of the page.</small>
      </label>
      <label className="dialog-field">
        <span>Address</span>
        <span className="dialog-address">
          <span>{sectionUrl}</span>
          <input
            value={shownSlug}
            placeholder="words-joined-by-hyphens"
            spellCheck={false}
            onChange={(e) => {
              setSlugEdited(true)
              setSlug(e.target.value)
            }}
          />
          <span>/</span>
        </span>
        <small>
          {!slugEdited
            ? 'Filled in from the title. '
            : document?.parts.slug === shownSlug
              ? 'Taken from the document. '
              : ''}
          Lowercase words joined by hyphens; once the page is published it should not change, or
          links to it break.
        </small>
      </label>
      <label className="dialog-field">
        <span>Publish date</span>
        <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
        <small>A date in the future publishes the page then.</small>
      </label>
      <p className="dialog-note">
        Created in {directory || 'the checkout root'} as a draft, with the same settings as the
        newest page there. A draft stays off the live site until Draft is switched off.
      </p>
    </Dialog>
  )
}
