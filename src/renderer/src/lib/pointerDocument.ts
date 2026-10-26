// The document the editor last pressed or right-clicked in: the main window's, or that of
// a tool window in a window of its own. Menus open there, by the pointer.
let last: Document = document

export const pointerDocument = (): Document =>
  last.defaultView && !last.defaultView.closed ? last : document

export function trackPointer(doc: Document): void {
  const note = (): void => {
    last = doc
  }
  doc.addEventListener('mousedown', note, true)
  doc.addEventListener('contextmenu', note, true)
}

trackPointer(document)
