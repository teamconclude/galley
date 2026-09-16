import { useState } from 'react'
import type { ImageValues, LinkValues } from '../lib/inline'
import { Dialog } from './Dialogs'
import ImagePicker from './ImagePicker'

interface LinkProps {
  initial: LinkValues
  onSubmit: (values: LinkValues) => void
  onCancel: () => void
}

export function LinkDialog({ initial, onSubmit, onCancel }: LinkProps): React.JSX.Element {
  const [text, setText] = useState(initial.text)
  const [url, setUrl] = useState(initial.url)
  const [newTab, setNewTab] = useState(initial.newTab)
  return (
    <Dialog
      title={initial.url ? 'Edit link' : 'Add link'}
      submitLabel={initial.url ? 'Save' : 'Add'}
      canSubmit={url.trim() !== ''}
      onSubmit={() => onSubmit({ text: text.trim() || url.trim(), url: url.trim(), newTab })}
      onCancel={onCancel}
    >
      <label className="dialog-field">
        <span>Text</span>
        <input autoFocus={!text} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label className="dialog-field">
        <span>Address</span>
        <input
          autoFocus={!!text}
          placeholder="https://… or /product/…"
          value={url}
          spellCheck={false}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label className="dialog-check">
        <input type="checkbox" checked={newTab} onChange={(e) => setNewTab(e.target.checked)} />
        <span>
          Open in a new tab
          <small>Links to other sites always do.</small>
        </span>
      </label>
    </Dialog>
  )
}

interface ImageProps {
  initial: ImageValues
  onSubmit: (values: ImageValues) => void
  onCancel: () => void
}

export function ImageDialog({ initial, onSubmit, onCancel }: ImageProps): React.JSX.Element {
  const [path, setPath] = useState(initial.path)
  const [alt, setAlt] = useState(initial.alt)
  const [picking, setPicking] = useState(false)
  return (
    <>
      <Dialog
        title={initial.path ? 'Edit image' : 'Add image'}
        submitLabel={initial.path ? 'Save' : 'Add'}
        canSubmit={path.trim() !== ''}
        onSubmit={() => onSubmit({ path: path.trim(), alt: alt.trim() })}
        onCancel={onCancel}
      >
        <label className="dialog-field">
          <span>Image</span>
          <span className="dialog-row">
            <input
              autoFocus={!path}
              placeholder="/images/…"
              value={path}
              spellCheck={false}
              onChange={(e) => setPath(e.target.value)}
            />
            <button type="button" onClick={() => setPicking(true)}>
              Choose…
            </button>
          </span>
        </label>
        {path && <img className="dialog-preview" src={`galley://repo/static${path}`} alt="" />}
        <label className="dialog-field">
          <span>Description</span>
          <input
            autoFocus={!!path}
            placeholder="What the picture shows, for readers who cannot see it"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
          />
        </label>
      </Dialog>
      {picking && (
        <ImagePicker
          value={path}
          onPick={(p) => {
            setPath(p)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  )
}
