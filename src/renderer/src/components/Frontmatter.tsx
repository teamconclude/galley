import { useCallback, useMemo, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { Document, isMap, parseDocument } from 'yaml'
import { parse as parseToml } from 'smol-toml'
import { isRecord } from '../../../shared/fields'
import type { FrontmatterFormat } from '../lib/frontmatter'
import { humanize, pageField } from '../lib/schema'
import { FieldFor } from './Blocks'
import { EditContext, type EditFn, useSchemas } from '../lib/contexts'
import Editor, { type Selection } from './Editor'
import { YamlFollower } from './PreviewFollow'

interface Props {
  text: string
  // YAML gets the form; TOML and JSON are shown as text with the badge.
  format: FrontmatterFormat
  onChange: (text: string) => void
  grow?: boolean
  height?: number
  // A range of the YAML to show selected, e.g. a search hit; it switches to the YAML view.
  select?: Selection
}

// TOML or JSON settings, for the badge only; unparsable text is an empty page.
function parseOther(text: string, format: FrontmatterFormat): Record<string, unknown> {
  try {
    const v: unknown = format === 'toml' ? parseToml(text) : JSON.parse(text)
    return isRecord(v) ? v : {}
  } catch {
    return {}
  }
}

// The default 80-column folding and single quotes match how existing pages are written.
const serialize = (doc: Document): string => doc.toString({ singleQuote: true }).replace(/\n$/, '')

// Why Hugo would leave this page out of the live site: a draft, a publishing date still
// ahead, or an expiry date behind. The preview shows such pages anyway.
function visibility(data: Record<string, unknown>): { label: string; kind: string } | null {
  if (data.draft === true) return { label: 'Draft', kind: 'draft' }
  const when = (v: unknown): Date | null => {
    if (!(typeof v === 'string' || v instanceof Date)) return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const now = Date.now()
  const publish = when(data.publishDate) ?? when(data.date)
  if (publish && publish.getTime() > now) {
    const day = publish.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
    return { label: `Publishes on ${day}`, kind: 'scheduled' }
  }
  const expiry = when(data.expiryDate)
  if (expiry && expiry.getTime() < now) return { label: 'Expired', kind: 'expired' }
  return null
}

export default function Frontmatter(props: Props): React.JSX.Element {
  const { text, format, onChange, grow, height, select } = props
  const [raw, setRaw] = useState(false)
  const [yamlView, setYamlView] = useState<EditorView | null>(null)
  const [selected, setSelected] = useState(0)
  if (select && select.tick !== selected) {
    setSelected(select.tick)
    setRaw(true)
  }
  const { lists } = useSchemas()
  const doc = useMemo(() => parseDocument(text), [text])
  const broken = doc.errors.length > 0 || !isMap(doc.contents)
  const data = useMemo(() => (broken ? {} : (doc.toJS() as Record<string, unknown>)), [doc, broken])
  const edit = useCallback<EditFn>(
    (change) => {
      const copy = doc.clone()
      change(copy)
      onChange(serialize(copy))
    },
    [doc, onChange]
  )
  const badge =
    format === 'yaml' ? (broken ? null : visibility(data)) : visibility(parseOther(text, format))
  if (format !== 'yaml') {
    return (
      <div className={'frontmatter' + (grow ? ' grow' : '')} style={{ height }}>
        <div className="pane-bar">
          <span className="pane-title">Page settings</span>
          {badge && <span className={`page-badge ${badge.kind}`}>{badge.label}</span>}
          <span className="pane-spacer" />
          <span className="pane-note">{format.toUpperCase()} settings are edited as text</span>
        </div>
        <div className="frontmatter-raw">
          <Editor
            filename={`frontmatter.${format}`}
            value={text}
            onChange={onChange}
            select={select}
          />
        </div>
      </div>
    )
  }
  return (
    <div className={'frontmatter' + (grow ? ' grow' : '')} style={{ height }}>
      <div className="pane-bar">
        <span className="pane-title">Page settings</span>
        {badge && <span className={`page-badge ${badge.kind}`}>{badge.label}</span>}
        <span className="pane-spacer" />
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
          <Editor
            filename="frontmatter.yaml"
            value={text}
            onChange={onChange}
            select={select}
            onView={setYamlView}
          />
          <YamlFollower view={yamlView} doc={doc} />
        </div>
      ) : (
        <EditContext.Provider value={edit}>
          <div className="frontmatter-form">
            <div className="fields-grid">
              {Object.entries(data).map(([key, value]) => (
                <FieldFor
                  key={key}
                  path={[key]}
                  def={{ key, type: 'text', label: humanize(key) }}
                  spec={pageField(key, value, lists)}
                  value={value}
                />
              ))}
              {Object.keys(data).length === 0 && (
                <div className="field-complex">No fields yet.</div>
              )}
            </div>
          </div>
        </EditContext.Provider>
      )}
    </div>
  )
}
