import { useEffect, useState } from 'react'
import type { EditorView } from '@codemirror/view'

// The markdown editor that last had focus, so one toolbar can serve the body editor and
// the markdown fields in the settings form alike.
let active: EditorView | null = null
const listeners = new Set<(view: EditorView | null) => void>()

export function setActiveEditor(view: EditorView | null): void {
  if (active === view) return
  active = view
  for (const listener of listeners) listener(view)
}

export function clearActiveEditor(view: EditorView): void {
  if (active === view) setActiveEditor(null)
}

export function useActiveEditor(): EditorView | null {
  const [view, setView] = useState(active)
  useEffect(() => {
    listeners.add(setView)
    return () => {
      listeners.delete(setView)
    }
  }, [])
  return view
}
