import type { Dock, Docks, DockSide, ToolGroup, ToolId } from '../../../shared/types'

export const toolIds: ToolId[] = ['files', 'changes', 'search', 'claude', 'preview']

export const toolTitles: Record<ToolId, string> = {
  files: 'Files',
  changes: 'Changes',
  search: 'Search',
  claude: 'Claude',
  preview: 'Preview'
}

export const sides: DockSide[] = ['left', 'right', 'bottom']

// A dock holds two groups at most: stacked along the left and right, side by side along
// the bottom.
export const maxGroups = 2

const group = (...tabs: ToolId[]): ToolGroup => ({ tabs, active: tabs[0] })

// Files above Changes, so both are in view, with Search sharing a place with Files; the
// preview along the right and Claude along the bottom.
export const defaultDocks = (): Docks => ({
  left: { groups: [group('files', 'search'), group('changes')], size: 260, split: 0.6 },
  right: { groups: [group('preview')], size: 600, split: 0.5 },
  bottom: { groups: [group('claude')], size: 300, split: 0.5 },
  floating: []
})

// What earlier versions saved: 0.7's sidebar groups, its width and the Claude pane's
// height, and the preview's width and whether it had a window of its own.
export interface Legacy {
  sidebarGroups?: { tabs?: ToolId[]; active?: ToolId }[]
  sidebarWidth?: number
  claudeHeight?: number
  previewWidth?: number
  detached?: boolean
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
        bottom: { ...fresh.bottom, ...saved.bottom },
        floating: saved.floating ?? (legacy.detached ? ['preview'] : [])
      }
    : {
        ...fresh,
        left: {
          ...fresh.left,
          groups: (legacy.sidebarGroups as ToolGroup[] | undefined) ?? fresh.left.groups,
          size: isSize(legacy.sidebarWidth) ? legacy.sidebarWidth : fresh.left.size
        },
        right: {
          ...fresh.right,
          size: isSize(legacy.previewWidth) ? legacy.previewWidth : fresh.right.size
        },
        bottom: {
          ...fresh.bottom,
          size: isSize(legacy.claudeHeight) ? legacy.claudeHeight : fresh.bottom.size
        },
        floating: legacy.detached ? ['preview'] : []
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
    const side: DockSide = tool === 'claude' ? 'bottom' : tool === 'preview' ? 'right' : 'left'
    const groups = docks[side].groups
    // The preview arriving in a dock of its own keeps the width it had beside the editor.
    if (tool === 'preview' && groups.length === 0) {
      docks.right.size = isSize(legacy.previewWidth) ? legacy.previewWidth : fresh.right.size
    }
    if (groups.length < maxGroups) groups.push(group(tool))
    else groups[groups.length - 1].tabs.push(tool)
  }
  docks.floating = (Array.isArray(docks.floating) ? docks.floating : []).filter(
    (t, i, all) => toolIds.includes(t) && all.indexOf(t) === i
  )
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

export const isFloating = (docks: Docks, tool: ToolId): boolean => docks.floating.includes(tool)

export const floatTool = (docks: Docks, tool: ToolId): Docks =>
  isFloating(docks, tool) ? docks : { ...docks, floating: [...docks.floating, tool] }

// Back in its place in the docks, in front of its group.
export const dockTool = (docks: Docks, tool: ToolId): Docks =>
  isFloating(docks, tool)
    ? showTool({ ...docks, floating: docks.floating.filter((t) => t !== tool) }, tool)
    : docks

export function moveTool(docks: Docks, tool: ToolId, to: DropTarget): Docks {
  const from = placeOf(docks, tool)
  if (!from) return docks
  const next: Docks = {
    left: copy(docks.left),
    right: copy(docks.right),
    bottom: copy(docks.bottom),
    floating: docks.floating.filter((t) => t !== tool)
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
