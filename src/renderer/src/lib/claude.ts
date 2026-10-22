import { useState } from 'react'

// Where a request for Claude from elsewhere in the window goes: the pane that is running,
// as a chat or as Claude Code's terminal.
type Send = (text: string) => void

let current: Send | null = null

// Makes send the pane's input; the returned function withdraws it.
export function setClaudeInput(send: Send): () => void {
  current = send
  return () => {
    if (current === send) current = null
  }
}

// Hands Claude the request; false when no pane is running.
export function askClaude(text: string): boolean {
  if (!current) return false
  current(text)
  return true
}

// Files dropped on the pane are copied where Claude may read them, Word and web documents
// converted to Markdown, and the copies handed to onFiles.
export function useFileDrop(onFiles: (paths: string[]) => void): {
  dropping: boolean
  handlers: Pick<React.HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'>
} {
  const [dropping, setDropping] = useState(false)
  const drop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setDropping(false)
    const paths = [...e.dataTransfer.files].map((f) => window.api.files.pathFor(f))
    if (paths.length > 0) onFiles(await window.api.terminal.drop(paths))
  }
  return {
    dropping,
    handlers: {
      onDragOver: (e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.stopPropagation()
        setDropping(true)
      },
      onDragLeave: () => setDropping(false),
      onDrop: (e) => void drop(e)
    }
  }
}
