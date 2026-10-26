import { app, Rectangle } from 'electron'
import type { Layout, Preferences } from '../shared/types'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface Settings {
  repoPath?: string
  // Sites opened before, newest first; repoPath is the first.
  recent?: string[]
  declinedMove?: boolean
  hugoChecked?: number
  // Window bounds: the main window's, and each tool window's own window's as tool:<id>.
  windows?: Partial<Record<string, Rectangle>>
  layout?: Layout
  githubToken?: string
  githubSkipped?: boolean
  setupSeen?: string
  prefs?: Partial<Preferences>
  zoom?: number
  // A branch opened for review in the checkout at repo, and the one it was opened from.
  review?: { repo: string; branch: string; from: string }
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

export function loadSettings(): Settings {
  try {
    return JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    return {}
  }
}

export const prefs = (): Preferences => ({
  deleteMergedBranch: true,
  claude: true,
  claudeModel: 'opus',
  claudeView: 'chat',
  claudeMode: 'auto',
  appearance: 'system',
  ...loadSettings().prefs
})

export function saveSettings(settings: Settings): void {
  writeFileSync(file(), JSON.stringify(settings, null, 2))
}
