import type { Layout } from '../../../shared/types'
import { defaultGroups, settleGroups } from './panels'

const defaults: Layout = {
  showPreview: true,
  showClaude: true,
  detached: false,
  sidebarWidth: 240,
  previewWidth: 600,
  claudeHeight: 300,
  frontmatterHeight: 280,
  sidebarGroups: defaultGroups,
  showAllFiles: false,
  showTitles: true,
  previewMode: 'html'
}

// The saved layout arrives with the preload, so the first render already has it.
export function loadLayout(): Layout {
  const saved: Partial<Layout> = window.api.layout.initial
  return { ...defaults, ...saved, sidebarGroups: settleGroups(saved.sidebarGroups) }
}

export const saveLayout = (layout: Layout): void => window.api.layout.save(layout)
