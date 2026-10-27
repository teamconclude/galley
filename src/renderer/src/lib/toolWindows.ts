import { useSyncExternalStore } from 'react'
import type { ToolId } from '../../../shared/types'
import { trackPointer } from './pointerDocument'

// The windows of tool windows shown on their own. Galley opens each from this page, so it
// shares this page's scripts: the tool window's element moves into it and goes on running
// here, keeping what it holds. The main process sizes and places the window, by what it
// remembers of it.
let windows = new Map<ToolId, Window>()
const listeners = new Set<() => void>()
// Windows closed from here, whose closing the main process reports as well.
const closing = new Set<ToolId>()

const changed = (next: Map<ToolId, Window>): void => {
  windows = next
  for (const l of listeners) l()
}

export const useToolWindows = (): Map<ToolId, Window> =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => windows
  )

// Opens the tool window's own window, at a point on screen when it was dropped there.
export function openToolWindow(tool: ToolId, title: string, at?: { x: number; y: number }): void {
  if (windows.has(tool)) return
  const features = at ? `left=${Math.round(at.x)},top=${Math.round(at.y)}` : ''
  const child = window.open('', `galley-tool:${tool}`, features)
  if (!child) return
  // The page's styles, as the main window has them.
  for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
    child.document.head.appendChild(node.cloneNode(true))
  }
  child.document.title = title
  child.document.body.className = 'tool-window-body'
  trackPointer(child.document)
  changed(new Map(windows).set(tool, child))
}

export function closeToolWindow(tool: ToolId): void {
  const child = windows.get(tool)
  if (!child) return
  closing.add(tool)
  const next = new Map(windows)
  next.delete(tool)
  changed(next)
  child.close()
}

// The main process reports a tool window's own window closed. True when the editor closed
// it, which puts the tool window back in its dock.
export function toolWindowClosed(tool: ToolId): boolean {
  if (closing.delete(tool)) return false
  if (!windows.has(tool)) return false
  const next = new Map(windows)
  next.delete(tool)
  changed(next)
  return true
}

// How often each tool window moved to another window's page. A webview takes input only in
// the page that made it, so the preview makes its anew after each such move.
const homes = new Map<ToolId, Document>()
let moves: Partial<Record<ToolId, number>> = {}
const moveListeners = new Set<() => void>()

// The page the tool window's element is in now, once the docks and windows have moved it.
export function settleHome(tool: ToolId, home: Document): void {
  const was = homes.get(tool)
  homes.set(tool, home)
  if (!was || was === home) return
  moves = { ...moves, [tool]: (moves[tool] ?? 0) + 1 }
  for (const l of moveListeners) l()
}

export const useToolMoves = (tool: ToolId): number =>
  useSyncExternalStore(
    (cb) => {
      moveListeners.add(cb)
      return () => moveListeners.delete(cb)
    },
    () => moves[tool] ?? 0
  )
