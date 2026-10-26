import type { Layout, ToolId } from '../../../shared/types'
import { defaultDocks, settleDocks } from './docks'

const defaults: Layout = {
  showPreview: true,
  showClaude: true,
  detached: false,
  previewWidth: 600,
  frontmatterHeight: 280,
  docks: defaultDocks(),
  showAllFiles: false,
  showTitles: true,
  previewMode: 'html'
}

// The saved layout arrives with the preload, so the first render already has it. One saved
// before the docks keeps its sidebar's arrangement and width and the Claude pane's height.
export function loadLayout(): Layout {
  const saved: Partial<Layout> = window.api.layout.initial
  // Drops the fields of the old layout, which settleDocks has taken over.
  const { sidebarGroups, sidebarWidth, claudeHeight, ...rest } = saved as Partial<Layout> & {
    sidebarGroups?: { tabs?: ToolId[]; active?: ToolId }[]
    sidebarWidth?: number
    claudeHeight?: number
  }
  return {
    ...defaults,
    ...rest,
    docks: settleDocks(saved.docks, { sidebarGroups, sidebarWidth, claudeHeight })
  }
}

export const saveLayout = (layout: Layout): void => window.api.layout.save(layout)
