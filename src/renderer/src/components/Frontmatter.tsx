import { useCallback, useMemo, useState } from 'react'
import { Document, isMap, parseDocument } from 'yaml'
import { pageField } from '../lib/schema'
import { FieldFor } from './Blocks'
import { EditContext, type EditFn, useSchemas } from '../lib/contexts'
import Editor from './Editor'

interface Props {
  text: string
  onChange: (text: string) => void
  grow?: boolean
  height?: number
}

// The default 80-column folding and single quotes match how existing pages are written.
const serialize = (doc: Document): string => doc.toString({ singleQuote: true }).replace(/\n$/, '')

export default function Frontmatter({ text, onChange, grow, height }: Props): React.JSX.Element {
  const [raw, setRaw] = useState(false)
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
  return (
    <div className={'frontmatter' + (grow ? ' grow' : '')} style={{ height }}>
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
        <EditContext.Provider value={edit}>
          <div className="frontmatter-form">
            <div className="fields-grid">
              {Object.entries(data).map(([key, value]) => (
                <FieldFor
                  key={key}
                  path={[key]}
                  name={key}
                  spec={pageField(key, value, lists)}
                  value={value}
                  inputs={{}}
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
