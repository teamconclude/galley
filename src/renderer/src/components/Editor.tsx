import { useEffect, useRef } from 'react'
import { Compartment, EditorState, Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { search } from '@codemirror/search'
import { basicSetup } from 'codemirror'
import { clearActiveEditor, editorChanged, setActiveEditor } from '../lib/activeEditor'
import { FindPanel } from '../lib/findPanel'
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
  // A range to select and scroll to, e.g. a search hit; a new tick selects again.
  select?: Selection
  // Hands out the CodeMirror view once mounted, and null when it goes away.
  onView?: (view: EditorView | null) => void
}

export interface Selection {
  from: number
  to: number
  tick: number
}

const markdownFile = /\.(md|markdown)$/i
const imageFile = /\.(png|jpe?g|gif|webp|svg|avif)$/i

// Remount (change the React key) to open a different file.
export default function Editor(props: Props): React.JSX.Element {
  const { filename, value, onChange, onSave, importImages, prose, select, onView } = props
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const importImagesRef = useRef(importImages)
  const onViewRef = useRef(onView)
  useEffect(() => {
    onChangeRef.current = onChange
    onSaveRef.current = onSave
    importImagesRef.current = importImages
    onViewRef.current = onView
  })

  useEffect(() => {
    const language = new Compartment()
    const isMarkdown = markdownFile.test(filename)
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          search({ top: true, createPanel: (v) => new FindPanel(v) }),
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
          trackFocus(),
          isMarkdown ? markdownStyle : [],
          importImages ? dropImages(importImagesRef) : []
        ]
      }),
      parent: host.current!
    })
    viewRef.current = view
    onViewRef.current?.(view)
    void languageFor(filename).then((ext) => {
      if (viewRef.current === view) view.dispatch({ effects: language.reconfigure(ext) })
    })
    return () => {
      onViewRef.current?.(null)
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

  useEffect(() => {
    const view = viewRef.current
    if (!view || !select) return
    const to = Math.min(select.to, view.state.doc.length)
    const from = Math.min(select.from, to)
    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' })
    })
    view.focus()
  }, [select])

  return <div className={prose ? 'editor prose' : 'editor'} ref={host} />
}

// The editor that has focus is the one the Find command acts on and whose toolbar shows;
// focus moving to a toolbar or one of its dialogs keeps it active.
function trackFocus(): Extension {
  return [
    EditorView.domEventHandlers({
      focus: (_event, view) => {
        setActiveEditor(view)
        return false
      },
      blur: (event, view) => {
        const target = event.relatedTarget as Element | null
        if (!target?.closest('.toolbar, .modal-backdrop')) clearActiveEditor(view)
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
  // GitHub flavoured, like Hugo's Goldmark: strikethrough, tables and task lists parse.
  if (markdownFile.test(filename)) {
    return markdown({ base: markdownLanguage, codeLanguages: languages })
  }
  if (/\.ya?ml$/i.test(filename)) return yaml()
  const desc = LanguageDescription.matchFilename(languages, filename)
  return desc ? await desc.load() : []
}
