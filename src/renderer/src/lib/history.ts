import { useCallback, useRef, useState } from 'react'
import type { StateEffect } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

// Where the editor stood in a page: the cursor and scroll position of its text, and
// whether the text had focus, and how far its settings were scrolled.
export interface EditorSpot {
  text?: { anchor: number; head: number; scroll: StateEffect<unknown>; focused: boolean }
  form: number
}

// One step of Back and Forward: the file in the editor, or none for a page of the site
// without a file of its own, the address the preview showed, and the editor's spot.
export interface Place {
  path: string | null
  address: string | null
  spot?: EditorSpot
}

const formOf = (): HTMLElement | null => document.querySelector('.editor-column .frontmatter-form')

const inPreview = (): boolean => document.activeElement?.tagName === 'WEBVIEW'

export function spotOf(view: EditorView | null): EditorSpot {
  const form = formOf()?.scrollTop ?? 0
  if (!view) return { form }
  const { anchor, head } = view.state.selection.main
  return {
    // Following a link in the preview takes the focus there; coming back, it returns to
    // the text.
    text: { anchor, head, scroll: view.scrollSnapshot(), focused: view.hasFocus || inPreview() },
    form
  }
}

export function restoreText(view: EditorView, spot: EditorSpot): void {
  if (!spot.text) return
  const { anchor, head, scroll, focused } = spot.text
  const length = view.state.doc.length
  view.dispatch({
    selection: { anchor: Math.min(anchor, length), head: Math.min(head, length) },
    effects: scroll
  })
  if (focused) view.focus()
}

// The settings form lays out its fields after it mounts, so its scroll waits a frame.
export function restoreForm(spot: EditorSpot): void {
  requestAnimationFrame(() => {
    const form = formOf()
    if (form) form.scrollTop = spot.form
  })
}

const limit = 100

// The pages visited, as a browser keeps them: a new visit drops the ones ahead.
export function useHistory(): {
  current: () => Place | null
  visit: (place: Place, spot?: EditorSpot) => void
  step: (by: -1 | 1, spot?: EditorSpot) => Place | null
  canBack: boolean
  canForward: boolean
} {
  const places = useRef<Place[]>([])
  const index = useRef(-1)
  const [ends, setEnds] = useState({ canBack: false, canForward: false })
  const changed = (): void =>
    setEnds({
      canBack: index.current > 0,
      canForward: index.current < places.current.length - 1
    })

  const current = useCallback((): Place | null => places.current[index.current] ?? null, [])

  // The place being left keeps the editor's spot there, to come back to it.
  const leave = (spot: EditorSpot | undefined): void => {
    const here = places.current[index.current]
    if (here && spot) here.spot = spot
  }

  const visit = useCallback((place: Place, spot?: EditorSpot): void => {
    const here = places.current[index.current]
    if (here && here.path === place.path && here.address === place.address) return
    leave(spot)
    places.current = [...places.current.slice(0, index.current + 1), place].slice(-limit)
    index.current = places.current.length - 1
    changed()
  }, [])

  const step = useCallback((by: -1 | 1, spot?: EditorSpot): Place | null => {
    const next = places.current[index.current + by]
    if (!next) return null
    leave(spot)
    index.current += by
    changed()
    return next
  }, [])

  return {
    current,
    visit,
    step,
    ...ends
  }
}
