import { app, Rectangle } from 'electron'
import type { Layout } from '../shared/types'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface Settings {
  repoPath?: string
  declinedMove?: boolean
  hugoChecked?: number
  windows?: { main?: Rectangle; preview?: Rectangle }
  layout?: Layout
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

export function loadSettings(): Settings {
  try {
    return JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    return {}
  }
}

export function saveSettings(settings: Settings): void {
  writeFileSync(file(), JSON.stringify(settings, null, 2))
}
