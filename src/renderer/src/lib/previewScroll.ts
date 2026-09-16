// Tells the preview, in the window or detached, to scroll to a content block.
const listeners = new Set<(index: number) => void>()
let last = -1

export function showBlock(index: number): void {
  if (index === last) return
  last = index
  for (const l of listeners) l(index)
  window.api.preview.showBlock(index)
}

// A new page starts over, so its first block gets scrolled to as well.
export function forgetBlock(): void {
  last = -1
}

export function onShowBlock(listener: (index: number) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
