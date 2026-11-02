import { app } from 'electron'
import { appendFileSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'

const file = (): string => join(app.getPath('logs'), 'galley.log')

// Appends to ~/Library/Logs/Galley/galley.log, for support and for the VM test.
export function log(...parts: unknown[]): void {
  const line = `${new Date().toISOString()} ${parts.map(String).join(' ')}\n`
  try {
    mkdirSync(app.getPath('logs'), { recursive: true })
    appendFileSync(file(), line)
  } catch {
    // Logging must never take the app down.
  }
}

// The end of the log, for the page shown when Galley's window fails, to copy from.
export function readLog(lines = 300): { path: string; text: string } {
  try {
    return { path: file(), text: readFileSync(file(), 'utf8').split('\n').slice(-lines).join('\n') }
  } catch {
    return { path: file(), text: '' }
  }
}
