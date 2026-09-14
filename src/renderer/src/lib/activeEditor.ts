import { useEffect, useState } from 'react'
import type { EditorView } from '@codemirror/view'

// The markdown editor that last had focus, so one toolbar can serve the body editor and
// the markdown fields in the settings form alike. The tick advances on every selection
// or document change in it, so the toolbar can reflect the style at the cursor.
interface Active {
  view: EditorView | null
  tick: number
}

let active: Active = { view: null, tick: 0 }
const listeners = new Set<(state: Active) => void>()

function publish(view: EditorView | null): void {
  active = { view, tick: active.tick + 1 }
  for (const listener of listeners) listener(active)
}

export function setActiveEditor(view: EditorView | null): void {
  if (active.view !== view) publish(view)
}

export function clearActiveEditor(view: EditorView): void {
  if (active.view === view) publish(null)
}

export function editorChanged(view: EditorView): void {
  if (active.view === view) publish(view)
}

export function useActiveEditor(): EditorView | null {
  const [state, setState] = useState(active)
  useEffect(() => {
    listeners.add(setState)
    return () => {
      listeners.delete(setState)
    }
  }, [])
  return state.view
}
