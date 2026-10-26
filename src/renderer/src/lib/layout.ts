import type { Layout } from '../../../shared/types'
import { defaultDocks, settleDocks, type Legacy } from './docks'

const defaults: Layout = {
  showPreview: true,
  showClaude: true,
  frontmatterHeight: 280,
  docks: defaultDocks(),
  showAllFiles: false,
  showTitles: true,
  previewMode: 'html'
}

// The saved layout arrives with the preload, so the first render already has it. One saved
// before the docks keeps its sidebar's arrangement and width, the Claude pane's height and
// the preview's width, and a preview in a window of its own stays there.
export function loadLayout(): Layout {
  const saved: Partial<Layout> & Legacy = window.api.layout.initial
  // Drops the fields of the old layout, which settleDocks has taken over.
  const { sidebarGroups, sidebarWidth, claudeHeight, previewWidth, detached, ...rest } = saved
  return {
    ...defaults,
    ...rest,
    docks: settleDocks(saved.docks, {
      sidebarGroups,
      sidebarWidth,
      claudeHeight,
      previewWidth,
      detached
    })
  }
}

export const saveLayout = (layout: Layout): void => window.api.layout.save(layout)
