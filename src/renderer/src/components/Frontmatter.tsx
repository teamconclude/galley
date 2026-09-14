import { useMemo, useState } from 'react'
import {
  Document,
  Node,
  Pair,
  Scalar,
  YAMLMap,
  YAMLSeq,
  isMap,
  isScalar,
  isSeq,
  parseDocument
} from 'yaml'
import Editor from './Editor'

interface Props {
  text: string
  onChange: (text: string) => void
}

const longFields = new Set(['description', 'summary', 'excerpt'])

// The default 80-column folding matches how most existing pages are written.
const serialize = (doc: Document): string => doc.toString().replace(/\n$/, '')

export default function Frontmatter({ text, onChange }: Props): React.JSX.Element {
  const [raw, setRaw] = useState(false)
  const doc = useMemo(() => parseDocument(text), [text])
  const broken = doc.errors.length > 0 || !isMap(doc.contents)
  return (
    <div className="frontmatter">
      <div className="pane-bar">
        <span className="pane-title">Page settings</span>
        {broken ? (
          <span className="error">
            {doc.errors[0]?.message.split('\n')[0] ?? 'Not a list of fields'}
          </span>
        ) : (
          <button onClick={() => setRaw(!raw)}>{raw ? 'Form' : 'YAML'}</button>
        )}
      </div>
      {raw || broken ? (
        <div className="frontmatter-raw">
          <Editor filename="frontmatter.yaml" value={text} onChange={onChange} />
        </div>
      ) : (
        <Form doc={doc} onChange={onChange} onRaw={() => setRaw(true)} />
      )}
    </div>
  )
}

type Mutate = (node: Node) => void
type Edit = (mutate: Mutate) => void

interface FormProps {
  doc: Document
  onChange: (text: string) => void
  onRaw: () => void
}

function Form({ doc, onChange, onRaw }: FormProps): React.JSX.Element {
  const map = doc.contents as YAMLMap
  const editKey = (key: string, mutate: Mutate): void => {
    const copy = doc.clone()
    mutate((copy.contents as YAMLMap).get(key, true) as Node)
    onChange(serialize(copy))
  }
  return (
    <div className="frontmatter-form">
      {map.items.map((pair: Pair) => {
        const key = String((pair.key as Scalar).value)
        return (
          <label key={key} className="field">
            <span className="field-name">{key}</span>
            <Field name={key} node={pair.value} edit={(m) => editKey(key, m)} onRaw={onRaw} />
          </label>
        )
      })}
      {map.items.length === 0 && <div className="field-complex">No fields yet.</div>}
    </div>
  )
}

interface FieldProps {
  name: string
  node: unknown
  edit: Edit
  onRaw: () => void
}

function Field({ name, node, edit, onRaw }: FieldProps): React.JSX.Element {
  if (isScalar(node)) return <ScalarField name={name} node={node} edit={edit} />
  if (isSeq(node) && node.items.every(isScalar)) return <ListField node={node} edit={edit} />
  const summary = isSeq(node)
    ? `${node.items.length} item${node.items.length === 1 ? '' : 's'}`
    : isMap(node)
      ? `${node.items.length} field${node.items.length === 1 ? '' : 's'}`
      : 'empty'
  return (
    <span className="field-complex">
      {summary} <button onClick={onRaw}>Edit as YAML</button>
    </span>
  )
}

interface ScalarProps {
  name: string
  node: Scalar
  edit: Edit
}

function ScalarField({ name, node, edit }: ScalarProps): React.JSX.Element {
  const value = node.value
  const set = (v: unknown): void => edit((n) => ((n as Scalar).value = v))
  if (typeof value === 'boolean') {
    return <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
  }
  if (typeof value === 'number') {
    return <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} />
  }
  const text = value === null || value === undefined ? '' : String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return (
      <input type="date" value={text} onChange={(e) => e.target.value && set(e.target.value)} />
    )
  }
  if (longFields.has(name) || text.includes('\n') || text.length > 80) {
    const rows = Math.min(8, text.split('\n').length + 1)
    return <textarea rows={rows} value={text} onChange={(e) => set(e.target.value)} />
  }
  return <input type="text" value={text} onChange={(e) => set(e.target.value)} />
}

// Comma-separated editing, committed on blur so a trailing comma survives typing.
function ListField({ node, edit }: { node: YAMLSeq; edit: Edit }): React.JSX.Element {
  const joined = node.items.map((item) => String((item as Scalar).value ?? '')).join(', ')
  const [text, setText] = useState(joined)
  const [editing, setEditing] = useState(false)
  return (
    <input
      type="text"
      value={editing ? text : joined}
      placeholder="Comma-separated"
      onFocus={() => {
        setText(joined)
        setEditing(true)
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false)
        const values = text
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        if (values.join(', ') === joined) return
        edit((n) => ((n as YAMLSeq).items = values.map((v) => new Scalar(v))))
      }}
    />
  )
}
