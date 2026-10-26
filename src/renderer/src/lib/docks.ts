import type { Dock, Docks, DockSide, ToolGroup, ToolId } from '../../../shared/types'

export const toolIds: ToolId[] = ['files', 'changes', 'search', 'claude']

export const toolTitles: Record<ToolId, string> = {
  files: 'Files',
  changes: 'Changes',
  search: 'Search',
  claude: 'Claude'
}

export const sides: DockSide[] = ['left', 'right', 'bottom']

// A dock holds two groups at most: stacked along the left and right, side by side along
// the bottom.
export const maxGroups = 2

const group = (...tabs: ToolId[]): ToolGroup => ({ tabs, active: tabs[0] })

// Files above Changes, so both are in view, with Search sharing a place with Files;
// Claude along the bottom.
export const defaultDocks = (): Docks => ({
  left: { groups: [group('files', 'search'), group('changes')], size: 260, split: 0.6 },
  right: { groups: [], size: 320, split: 0.5 },
  bottom: { groups: [group('claude')], size: 300, split: 0.5 }
})

// What 0.7 saved: the sidebar's groups, its width and the Claude pane's height.
interface Legacy {
  sidebarGroups?: { tabs?: ToolId[]; active?: ToolId }[]
  sidebarWidth?: number
  claudeHeight?: number
}

const isSize = (n: unknown): n is number => typeof n === 'number' && n > 0

// A saved arrangement with every tool window in it exactly once and no dock holding more
// than it can, whatever version of Galley saved it. A tool it lacks goes where it goes by
// default.
export function settleDocks(saved: Docks | undefined, legacy: Legacy): Docks {
  const fresh = defaultDocks()
  const docks: Docks = saved
    ? {
        left: { ...fresh.left, ...saved.left },
        right: { ...fresh.right, ...saved.right },
        bottom: { ...fresh.bottom, ...saved.bottom }
      }
    : {
        ...fresh,
        left: {
          ...fresh.left,
          groups: (legacy.sidebarGroups as ToolGroup[] | undefined) ?? fresh.left.groups,
          size: isSize(legacy.sidebarWidth) ? legacy.sidebarWidth : fresh.left.size
        },
        bottom: {
          ...fresh.bottom,
          size: isSize(legacy.claudeHeight) ? legacy.claudeHeight : fresh.bottom.size
        }
      }
  const seen = new Set<ToolId>()
  for (const side of sides) {
    const dock = docks[side]
    dock.groups = (Array.isArray(dock.groups) ? dock.groups : [])
      .map((g) => {
        const tabs = (g?.tabs ?? []).filter(
          (t) => toolIds.includes(t) && !seen.has(t) && seen.add(t)
        )
        return { tabs, active: tabs.includes(g.active) ? g.active : tabs[0] }
      })
      .filter((g) => g.tabs.length > 0)
      .slice(0, maxGroups)
    if (!isSize(dock.size)) dock.size = fresh[side].size
    if (!(dock.split > 0.1 && dock.split < 0.9)) dock.split = 0.5
  }
  for (const tool of toolIds) {
    if (seen.has(tool)) continue
    const side: DockSide = tool === 'claude' ? 'bottom' : 'left'
    const groups = docks[side].groups
    if (groups.length < maxGroups) groups.push(group(tool))
    else groups[groups.length - 1].tabs.push(tool)
  }
  return docks
}

export interface ToolPlace {
  side: DockSide
  group: number
  index: number
}

export function placeOf(docks: Docks, tool: ToolId): ToolPlace | null {
  for (const side of sides) {
    const groups = docks[side].groups
    for (let g = 0; g < groups.length; g++) {
      const index = groups[g].tabs.indexOf(tool)
      if (index >= 0) return { side, group: g, index }
    }
  }
  return null
}

// The tool window brought to the front of its group.
export function showTool(docks: Docks, tool: ToolId): Docks {
  const at = placeOf(docks, tool)
  if (!at || docks[at.side].groups[at.group].active === tool) return docks
  return withDock(docks, at.side, (dock) => ({
    ...dock,
    groups: dock.groups.map((g, i) => (i === at.group ? { ...g, active: tool } : g))
  }))
}

// Where a dragged tool window lands: among a group's tabs at an index, or in a group of
// its own in a dock, after the group there.
export type DropTarget =
  { kind: 'tab'; side: DockSide; group: number; index: number } | { kind: 'apart'; side: DockSide }

export function moveTool(docks: Docks, tool: ToolId, to: DropTarget): Docks {
  const from = placeOf(docks, tool)
  if (!from) return docks
  const next: Docks = {
    left: copy(docks.left),
    right: copy(docks.right),
    bottom: copy(docks.bottom)
  }
  const source = next[from.side].groups[from.group]
  source.tabs.splice(from.index, 1)
  if (source.active === tool)
    source.active = source.tabs[Math.min(from.index, source.tabs.length - 1)]
  const emptied = source.tabs.length === 0
  if (emptied) next[from.side].groups.splice(from.group, 1)
  const groups = next[to.side].groups
  if (to.kind === 'tab') {
    let g = to.group
    let index = to.index
    if (from.side === to.side && emptied && from.group < g) g--
    if (from.side === to.side && !emptied && from.group === g && from.index < index) index--
    const target = groups[g]
    if (target) {
      target.tabs.splice(Math.min(index, target.tabs.length), 0, tool)
      target.active = tool
      return next
    }
  }
  if (groups.length >= maxGroups) {
    const last = groups[groups.length - 1]
    last.tabs.push(tool)
    last.active = tool
  } else {
    groups.push(group(tool))
  }
  return next
}

export const withDock = (docks: Docks, side: DockSide, fn: (dock: Dock) => Dock): Docks => ({
  ...docks,
  [side]: fn(docks[side])
})

const copy = (dock: Dock): Dock => ({
  ...dock,
  groups: dock.groups.map((g) => ({ ...g, tabs: [...g.tabs] }))
})
