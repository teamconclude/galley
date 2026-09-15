import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// Appends to ~/Library/Logs/Galley/galley.log, for support and for the VM test.
export function log(...parts: unknown[]): void {
  const dir = app.getPath('logs')
  const line = `${new Date().toISOString()} ${parts.map(String).join(' ')}\n`
  try {
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'galley.log'), line)
  } catch {
    // Logging must never take the app down.
  }
}
