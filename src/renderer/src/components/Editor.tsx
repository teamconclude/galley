import { useEffect, useRef } from 'react'
import { Compartment, EditorState, Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { basicSetup } from 'codemirror'

interface Props {
  filename: string
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  onView?: (view: EditorView | null) => void
}

// Remount (change the React key) to open a different file.
export default function Editor({
  filename,
  value,
  onChange,
  onSave,
  onView
}: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  useEffect(() => {
    onChangeRef.current = onChange
    onSaveRef.current = onSave
  })

  useEffect(() => {
    const language = new Compartment()
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          language.of([]),
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                onSaveRef.current?.()
                return true
              }
            }
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          })
        ]
      }),
      parent: host.current!
    })
    viewRef.current = view
    onView?.(view)
    void languageFor(filename).then((ext) => {
      if (viewRef.current === view) view.dispatch({ effects: language.reconfigure(ext) })
    })
    return () => {
      onView?.(null)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [value])

  return <div className="editor" ref={host} />
}

async function languageFor(filename: string): Promise<Extension> {
  if (/\.(md|markdown)$/i.test(filename)) return markdown({ codeLanguages: languages })
  if (/\.ya?ml$/i.test(filename)) return yaml()
  const desc = LanguageDescription.matchFilename(languages, filename)
  return desc ? await desc.load() : []
}
