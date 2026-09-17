import type { Layout } from '../../../shared/types'

const defaults: Layout = {
  showPreview: true,
  showClaude: true,
  detached: false,
  sidebarWidth: 240,
  previewWidth: 600,
  claudeHeight: 300,
  frontmatterHeight: 280,
  sidebarTab: 'files',
  showAllFiles: false,
  previewMode: 'html'
}

// The saved layout arrives with the preload, so the first render already has it.
export const loadLayout = (): Layout => ({ ...defaults, ...window.api.layout.initial })

export const saveLayout = (layout: Layout): void => window.api.layout.save(layout)
