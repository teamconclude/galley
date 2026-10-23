import { Fragment, useRef, useState } from 'react'
import type { PanelGroup, SidebarTab } from '../../../shared/types'
import { moveGroup, movePanel, panelTitles, showPanel, type PanelPlace } from '../lib/panels'
import ContextMenu, { type MenuItem } from './ContextMenu'
import Splitter from './Splitter'

export interface Panel {
  content: React.ReactNode
  badge?: number
}

interface Props {
  groups: PanelGroup[]
  onGroups: (groups: PanelGroup[]) => void
  panels: Record<SidebarTab, Panel>
}

const minHeight = 90
const dragType = 'application/x-galley-panel'

const named = (tabs: SidebarTab[]): string =>
  tabs.map((t) => panelTitles[t]).join(tabs.length === 2 ? ' and ' : ', ')

// The sidebar's panels in groups stacked top to bottom, each showing its panels as tabs.
// A tab dragged onto another group's tabs joins it, and dropped between groups stands
// apart; its context menu does the same and moves its group up or down. Every panel stays
// mounted while it waits behind another tab, so it keeps what it holds.
export default function Sidebar({ groups, onGroups, panels }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<SidebarTab | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; tab: SidebarTab } | null>(null)

  const place = (tab: SidebarTab, to: PanelPlace): void => onGroups(movePanel(groups, tab, to))

  // The group above a splitter grows or shrinks; the ones below keep at least their minimum.
  const resize = (index: number, delta: number): void => {
    const total = host.current?.clientHeight ?? 0
    const others = groups.reduce(
      (sum, g, i) => (i === index ? sum : sum + (i === groups.length - 1 ? minHeight : g.height)),
      0
    )
    const max = Math.max(minHeight, total - others)
    onGroups(
      groups.map((g, i) =>
        i === index ? { ...g, height: Math.min(max, Math.max(minHeight, g.height + delta)) } : g
      )
    )
  }

  const dropProps = (key: string, to: PanelPlace): React.HTMLAttributes<HTMLDivElement> => ({
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(dragType)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (target !== key) setTarget(key)
    },
    onDragLeave: () => setTarget((t) => (t === key ? null : t)),
    onDrop: (e) => {
      const tab = e.dataTransfer.getData(dragType) as SidebarTab
      if (!tab) return
      e.preventDefault()
      e.stopPropagation()
      setDragging(null)
      setTarget(null)
      place(tab, to)
    }
  })

  const menuItems = (tab: SidebarTab): MenuItem[] => {
    const index = groups.findIndex((g) => g.tabs.includes(tab))
    const group = groups[index]
    const items: MenuItem[] = []
    if (group.tabs.length > 1) {
      items.push({ label: 'Show apart', onClick: () => place(tab, { apart: index + 1 }) })
    }
    groups.forEach((g, i) => {
      if (i !== index) {
        items.push({ label: `Show with ${named(g.tabs)}`, onClick: () => place(tab, { join: i }) })
      }
    })
    if (index > 0) {
      items.push({ label: 'Move up', onClick: () => onGroups(moveGroup(groups, index, -1)) })
    }
    if (index < groups.length - 1) {
      items.push({ label: 'Move down', onClick: () => onGroups(moveGroup(groups, index, 1)) })
    }
    return items
  }

  // Dropping a tab apart next to where it already stands alone would change nothing.
  const dropApart = (at: number): React.JSX.Element | null => {
    if (!dragging) return null
    const from = groups.findIndex((g) => g.tabs.includes(dragging))
    if (groups[from].tabs.length === 1 && (at === from || at === from + 1)) return null
    const key = `apart-${at}`
    return (
      <div
        className={target === key ? 'panel-drop over' : 'panel-drop'}
        {...dropProps(key, { apart: at })}
      >
        Drop to show apart
      </div>
    )
  }

  return (
    <div className="panels" ref={host}>
      {dropApart(0)}
      {groups.map((g, i) => {
        const last = i === groups.length - 1
        const key = `join-${i}`
        return (
          <Fragment key={g.tabs.join()}>
            <section
              className="panel-group"
              style={last ? undefined : { height: g.height, flex: 'none' }}
            >
              <div
                className={target === key ? 'sidebar-tabs over' : 'sidebar-tabs'}
                {...(dragging && !g.tabs.includes(dragging) ? dropProps(key, { join: i }) : {})}
              >
                {g.tabs.map((tab) => (
                  <button
                    key={tab}
                    className={g.active === tab ? 'on' : ''}
                    draggable
                    onClick={() => onGroups(showPanel(groups, tab))}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenu({ x: e.clientX, y: e.clientY, tab })
                    }}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(dragType, tab)
                      e.dataTransfer.effectAllowed = 'move'
                      setDragging(tab)
                    }}
                    onDragEnd={() => {
                      setDragging(null)
                      setTarget(null)
                    }}
                  >
                    {panelTitles[tab]}
                    {!!panels[tab].badge && <span className="badge">{panels[tab].badge}</span>}
                  </button>
                ))}
              </div>
              {g.tabs.map((tab) => (
                <div key={tab} className="panel" hidden={g.active !== tab}>
                  {panels[tab].content}
                </div>
              ))}
            </section>
            {dropApart(i + 1)}
            {!last && <Splitter direction="vertical" onDrag={(d) => resize(i, d)} />}
          </Fragment>
        )
      })}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.tab)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
