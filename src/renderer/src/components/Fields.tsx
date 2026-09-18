import { useState } from 'react'
import { setValue, type Path } from '../lib/yamlEdit'
import { useEdit, useSchemas } from '../lib/contexts'
import { imageFolder, imagePath, imageUrl, isImageUrl } from '../lib/site'
import type { EditorView } from '@codemirror/view'
import { useActiveEditor } from '../lib/activeEditor'
import Editor from './Editor'
import ImagePicker from './ImagePicker'
import Toolbar from './Toolbar'

interface ControlProps {
  path: Path
  value: unknown
}

const asText = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value)

function MarkdownField(props: { text: string; onChange: (v: string) => void }): React.JSX.Element {
  const [view, setView] = useState<EditorView | null>(null)
  const active = useActiveEditor()
  return (
    <div className="field-editor">
      {view && active === view && <Toolbar view={view} compact />}
      <Editor filename="field.md" value={props.text} onChange={props.onChange} onView={setView} />
    </div>
  )
}

export function TextControl({
  path,
  value,
  multiline,
  markdown,
  placeholder
}: ControlProps & {
  multiline: boolean
  markdown?: boolean
  placeholder?: string
}): React.JSX.Element {
  const edit = useEdit()
  const text = asText(value)
  const set = (v: string): void => edit((doc) => setValue(doc, path, v))
  if (markdown) return <MarkdownField text={text} onChange={set} />
  if (multiline || text.includes('\n')) {
    const rows = Math.min(10, Math.max(2, text.split('\n').length + 1))
    return (
      <textarea
        rows={rows}
        value={text}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
      />
    )
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return (
      <input type="date" value={text} onChange={(e) => e.target.value && set(e.target.value)} />
    )
  }
  return (
    <input
      type="text"
      value={text}
      placeholder={placeholder}
      onChange={(e) => set(e.target.value)}
    />
  )
}

export function BooleanControl({ path, value }: ControlProps): React.JSX.Element {
  const edit = useEdit()
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => edit((doc) => setValue(doc, path, e.target.checked))}
      />
      <span className="switch-track" />
    </label>
  )
}

export function NumberControl({ path, value }: ControlProps): React.JSX.Element {
  const edit = useEdit()
  return (
    <input
      type="number"
      value={typeof value === 'number' ? value : asText(value)}
      onChange={(e) => edit((doc) => setValue(doc, path, Number(e.target.value)))}
    />
  )
}

export function ChoiceControl({
  path,
  value,
  choices
}: ControlProps & { choices: string[] }): React.JSX.Element {
  const edit = useEdit()
  const current = asText(value)
  const options = choices.includes(current) ? choices : [current, ...choices]
  return (
    <select value={current} onChange={(e) => edit((doc) => setValue(doc, path, e.target.value))}>
      {options.map((c) => (
        <option key={c} value={c}>
          {c === '' ? '(none)' : c}
        </option>
      ))}
    </select>
  )
}

// One item per line, committed when the field loses focus.
export function ListControl({ path, value }: ControlProps): React.JSX.Element {
  const edit = useEdit()
  const items = Array.isArray(value) ? value.map(asText) : []
  const joined = items.join('\n')
  const [text, setText] = useState(joined)
  const [editing, setEditing] = useState(false)
  return (
    <textarea
      rows={Math.min(8, Math.max(2, items.length + 1))}
      value={editing ? text : joined}
      placeholder="One entry per line"
      onFocus={() => {
        setText(joined)
        setEditing(true)
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false)
        const values = text
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
        if (values.join('\n') !== joined) edit((doc) => setValue(doc, path, values))
      }}
    />
  )
}

export function ChoiceListControl({
  path,
  value,
  options
}: ControlProps & { options: string[] }): React.JSX.Element {
  const edit = useEdit()
  const selected = Array.isArray(value) ? value.map(asText) : []
  const all = [...options, ...selected.filter((s) => !options.includes(s))]
  const toggle = (option: string, on: boolean): void => {
    const next = all.filter((o) => (o === option ? on : selected.includes(o)))
    edit((doc) => setValue(doc, path, next))
  }
  return (
    <div className="choice-list">
      {all.map((option) => (
        <label key={option}>
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={(e) => toggle(option, e.target.checked)}
          />
          {option}
        </label>
      ))}
    </div>
  )
}

export function ImageControl({ path, value }: ControlProps): React.JSX.Element {
  const edit = useEdit()
  const [open, setOpen] = useState(false)
  const { site } = useSchemas()
  const text = asText(value)
  const set = (v: string): void => edit((doc) => setValue(doc, path, v))
  const folder = imageFolder(site, text)
  const drop = async (e: React.DragEvent): Promise<void> => {
    const file = [...e.dataTransfer.files].find((f) =>
      /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(f.name)
    )
    if (!file) return
    e.preventDefault()
    const rel = await window.api.repo.importFile(
      window.api.files.pathFor(file),
      imagePath(site, folder)
    )
    set(imageUrl(site, rel))
  }
  return (
    <div
      className="image-control"
      title={`Drop an image here to copy it into ${imagePath(site, folder)}`}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => void drop(e)}
    >
      {isImageUrl(site, text) && (
        <img className="image-preview" src={`galley://repo/${imagePath(site, text)}`} alt="" />
      )}
      <div className="image-row">
        <input
          type="text"
          value={text}
          placeholder={`${site.imagesUrl}/…`}
          onChange={(e) => set(e.target.value)}
        />
        <button onClick={() => setOpen(true)}>Choose…</button>
      </div>
      {open && (
        <ImagePicker
          value={text}
          onPick={(p) => {
            set(p)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
