import { useEffect, useRef } from 'react'
import { Compartment, EditorState, Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { basicSetup } from 'codemirror'
import { clearActiveEditor, editorChanged, setActiveEditor } from '../lib/activeEditor'
import { markdownStyle } from '../lib/markdownStyle'

interface Props {
  filename: string
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  // Copies dropped images into the site and returns their URL paths.
  importImages?: (files: File[]) => Promise<string[]>
  // A writing surface: proportional type, no line numbers.
  prose?: boolean
}

const markdownFile = /\.(md|markdown)$/i
const imageFile = /\.(png|jpe?g|gif|webp|svg|avif)$/i

// Remount (change the React key) to open a different file.
export default function Editor(props: Props): React.JSX.Element {
  const { filename, value, onChange, onSave, importImages, prose } = props
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const importImagesRef = useRef(importImages)
  useEffect(() => {
    onChangeRef.current = onChange
    onSaveRef.current = onSave
    importImagesRef.current = importImages
  })

  useEffect(() => {
    const language = new Compartment()
    const isMarkdown = markdownFile.test(filename)
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
          }),
          isMarkdown ? [trackFocus(), markdownStyle] : [],
          importImages ? dropImages(importImagesRef) : []
        ]
      }),
      parent: host.current!
    })
    viewRef.current = view
    void languageFor(filename).then((ext) => {
      if (viewRef.current === view) view.dispatch({ effects: language.reconfigure(ext) })
    })
    return () => {
      clearActiveEditor(view)
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

  return <div className={prose ? 'editor prose' : 'editor'} ref={host} />
}

// Focus moving to the toolbar keeps the editor active so its buttons can act on it.
function trackFocus(): Extension {
  return [
    EditorView.domEventHandlers({
      focus: (_event, view) => {
        setActiveEditor(view)
        return false
      },
      blur: (event, view) => {
        const target = event.relatedTarget as Element | null
        if (!target?.closest('.toolbar')) clearActiveEditor(view)
        return false
      }
    }),
    EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) editorChanged(update.view)
    })
  ]
}

// Dropped image files are copied into the site and inserted as markdown images.
function dropImages(importImages: React.RefObject<Props['importImages']>): Extension {
  return EditorView.domEventHandlers({
    dragover: (event) => {
      if (!event.dataTransfer?.types.includes('Files')) return false
      event.preventDefault()
      return true
    },
    drop: (event, view) => {
      const files = [...(event.dataTransfer?.files ?? [])].filter((f) => imageFile.test(f.name))
      const handler = importImages.current
      if (files.length === 0 || !handler) return false
      event.preventDefault()
      const pos =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
      void handler(files).then((urls) => {
        const text = urls.map((url) => `![Description](${url})`).join('\n')
        view.dispatch({
          changes: { from: pos, insert: text },
          selection: { anchor: pos + text.length }
        })
        view.focus()
      })
      return true
    }
  })
}

async function languageFor(filename: string): Promise<Extension> {
  if (markdownFile.test(filename)) return markdown({ codeLanguages: languages })
  if (/\.ya?ml$/i.test(filename)) return yaml()
  const desc = LanguageDescription.matchFilename(languages, filename)
  return desc ? await desc.load() : []
}
