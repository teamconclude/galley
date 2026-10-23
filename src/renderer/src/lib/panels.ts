import type { PanelGroup, SidebarTab } from '../../../shared/types'

export const panelTabs: SidebarTab[] = ['files', 'changes', 'search']

export const panelTitles: Record<SidebarTab, string> = {
  files: 'Files',
  changes: 'Changes',
  search: 'Search'
}

// Files above Changes, so both are in view; Search, wanted now and then, shares a place
// with Files.
export const defaultGroups: PanelGroup[] = [
  { tabs: ['files', 'search'], active: 'files', height: 420 },
  { tabs: ['changes'], active: 'changes', height: 0 }
]

// A saved arrangement with every panel in it exactly once, whatever version of Galley
// saved it. A panel it lacks joins the last group.
export function settleGroups(saved: PanelGroup[] | undefined): PanelGroup[] {
  if (!Array.isArray(saved) || saved.length === 0) return defaultGroups
  const seen = new Set<SidebarTab>()
  const groups = saved
    .map((g) => ({
      ...g,
      tabs: (g.tabs ?? []).filter((t) => panelTabs.includes(t) && !seen.has(t) && seen.add(t))
    }))
    .filter((g) => g.tabs.length > 0)
  if (groups.length === 0) return defaultGroups
  const missing = panelTabs.filter((t) => !seen.has(t))
  groups[groups.length - 1].tabs.push(...missing)
  return groups.map((g) => ({
    tabs: g.tabs,
    active: g.tabs.includes(g.active) ? g.active : g.tabs[0],
    height: typeof g.height === 'number' && g.height > 0 ? g.height : 300
  }))
}

// The panel brought to the front of its group.
export const showPanel = (groups: PanelGroup[], tab: SidebarTab): PanelGroup[] =>
  groups.map((g) => (g.tabs.includes(tab) ? { ...g, active: tab } : g))

export const isShown = (groups: PanelGroup[], tab: SidebarTab): boolean =>
  groups.some((g) => g.active === tab)

// Where a panel goes: into a group, among its tabs, or into a group of its own at an index.
export type PanelPlace = { join: number } | { apart: number }

export function movePanel(groups: PanelGroup[], tab: SidebarTab, to: PanelPlace): PanelGroup[] {
  const from = groups.findIndex((g) => g.tabs.includes(tab))
  if (from < 0) return groups
  const source = groups[from]
  if ('join' in to && to.join === from) return groups
  // A panel alone in its group is already apart; moving it apart again only reorders.
  const height = source.tabs.length === 1 ? source.height : 300
  const next = groups.map((g) => ({ ...g, tabs: [...g.tabs] }))
  next[from].tabs = next[from].tabs.filter((t) => t !== tab)
  if (next[from].active === tab) next[from].active = next[from].tabs[0]
  if ('join' in to) {
    next[to.join].tabs.push(tab)
    next[to.join].active = tab
  } else {
    next.splice(to.apart, 0, { tabs: [tab], active: tab, height })
  }
  return next.filter((g) => g.tabs.length > 0)
}

// A group swapped with its neighbour above (-1) or below (1).
export function moveGroup(groups: PanelGroup[], index: number, by: -1 | 1): PanelGroup[] {
  const other = index + by
  if (other < 0 || other >= groups.length) return groups
  const next = [...groups]
  ;[next[index], next[other]] = [next[other], next[index]]
  return next
}
