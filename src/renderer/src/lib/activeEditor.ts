import { useSyncExternalStore } from 'react'
import type { EditorView } from '@codemirror/view'

// The markdown editor that last had focus, so one toolbar can serve the body editor and
// the markdown fields in the settings form alike. The tick advances on every selection
// or document change in it, so the toolbar can reflect the style at the cursor.
interface Active {
  view: EditorView | null
  tick: number
}

let active: Active = { view: null, tick: 0 }
const listeners = new Set<() => void>()

function publish(view: EditorView | null): void {
  active = { view, tick: active.tick + 1 }
  for (const listener of listeners) listener()
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

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Read through a store subscription, so a change published while a component was still
// mounting is not missed.
export function useActiveEditorState(): Active {
  return useSyncExternalStore(subscribe, () => active)
}

export function useActiveEditor(): EditorView | null {
  return useActiveEditorState().view
}
