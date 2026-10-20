import type { Terminal } from '@xterm/xterm'

// The running Claude pane's terminal, for handing Claude a request from elsewhere in the
// window.
let current: Terminal | null = null

export function setClaudeTerminal(term: Terminal): void {
  current = term
}

export function clearClaudeTerminal(term: Terminal): void {
  if (current === term) current = null
}

// Pastes the request at Claude's prompt and sends it; false when no pane is running. The
// paste keeps a request of several lines in one piece, and Enter follows once Claude has
// taken it in.
export function askClaude(text: string): boolean {
  const term = current
  if (!term) return false
  term.paste(text)
  window.setTimeout(() => window.api.terminal.write('\r'), 300)
  term.focus()
  return true
}
