import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Dock, Docks, DockSide, ToolId } from '../../../shared/types'
import {
  maxGroups,
  moveTool,
  placeOf,
  showTool,
  sides,
  toolIds,
  toolTitles,
  withDock,
  type DropTarget
} from '../lib/docks'
import Splitter from './Splitter'

export interface Tool {
  content: React.ReactNode
  badge?: number
}

interface Props {
  docks: Docks
  onDocks: (update: (docks: Docks) => Docks) => void
  // The tool windows there are; one left out, such as Claude while it is off, has no tab.
  tools: Partial<Record<ToolId, Tool>>
  // Tool windows put away for now, such as Claude while its button is off: they keep what
  // they hold, but have no tab.
  hidden: ToolId[]
  // The editor and the preview, which the docks surround.
  children: React.ReactNode
}

// A group as it shows: its index in the dock, and its tabs that are there to show.
interface Shown {
  index: number
  tabs: ToolId[]
  active: ToolId
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

interface Drag {
  tool: ToolId
  x: number
  y: number
  target: DropTarget | null
  // Where the tool window would land, drawn over the window.
  box: Box | null
}

// How far the pointer moves before a pressed tab starts to drag.
const threshold = 6
// How close to the window's edge a dock that is not there yet takes a drop.
const edge = 56

const shownGroups = (dock: Dock, has: (t: ToolId) => boolean): Shown[] =>
  dock.groups
    .map((g, index) => {
      const tabs = g.tabs.filter(has)
      return { index, tabs, active: tabs.includes(g.active) ? g.active : tabs[0] }
    })
    .filter((g) => g.tabs.length > 0)

// The tool windows in docks along the left, right and bottom edges, around the editor and
// the preview. A tab dragged a few pixels lifts its tool window, which lands where the
// marked place shows: among the tabs it is over, in the group it is over, in a group of
// its own in the far half of a dock with one group, or in a dock of its own at an edge
// that has none. Esc puts it back. Each tool window lives in an element of its own that
// moves between the docks, so it keeps what it holds wherever it goes.
export default function DockLayout(props: Props): React.JSX.Element {
  const { docks, onDocks, tools, hidden, children } = props
  const root = useRef<HTMLDivElement>(null)
  const docksRef = useRef(docks)
  useEffect(() => {
    docksRef.current = docks
  })
  const [drag, setDrag] = useState<Drag | null>(null)

  const [elements] = useState(() => {
    const made = new Map<ToolId, HTMLDivElement>()
    for (const tool of toolIds) {
      const el = document.createElement('div')
      el.className = 'tool'
      el.dataset['tool'] = tool
      made.set(tool, el)
    }
    return made
  })
  const elementOf = (tool: ToolId): HTMLDivElement => elements.get(tool)!

  const has = (tool: ToolId): boolean => !!tools[tool] && !hidden.includes(tool)
  const shown = Object.fromEntries(sides.map((s) => [s, shownGroups(docks[s], has)])) as Record<
    DockSide,
    Shown[]
  >

  const targetAt = (tool: ToolId, x: number, y: number): Pick<Drag, 'target' | 'box'> => {
    const none = { target: null, box: null }
    const host = root.current
    if (!host) return none
    const current = docksRef.current
    const from = placeOf(current, tool)
    const inside = (r: DOMRect): boolean =>
      x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    const box = (r: DOMRect | Box): Box => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height
    })

    // Among the tabs of a group: before the tab whose middle lies right of the pointer.
    for (const strip of host.querySelectorAll<HTMLElement>('[data-strip]')) {
      const r = strip.getBoundingClientRect()
      if (!inside(r)) continue
      const [side, g] = strip.dataset['strip']!.split(':') as [DockSide, string]
      const group = Number(g)
      const tabs = current[side].groups[group]?.tabs ?? []
      const buttons = [...strip.querySelectorAll<HTMLElement>('[data-tab]')]
      const k = buttons.findIndex((b) => {
        const br = b.getBoundingClientRect()
        return x < br.left + br.width / 2
      })
      const index = k < 0 ? tabs.length : tabs.indexOf(buttons[k].dataset['tab'] as ToolId)
      const same = from && from.side === side && from.group === group
      if (same && (index === from.index || index === from.index + 1)) return none
      const at =
        k < 0
          ? (buttons.at(-1)?.getBoundingClientRect().right ?? r.left + 8)
          : buttons[k].getBoundingClientRect().left
      return {
        target: { kind: 'tab', side, group, index },
        box: { left: at - 2, top: r.top + 4, width: 3, height: r.height - 8 }
      }
    }

    // Over a dock: the group under the pointer, or the far half of a dock with one group.
    for (const dockEl of host.querySelectorAll<HTMLElement>('[data-dock]')) {
      const r = dockEl.getBoundingClientRect()
      if (!inside(r)) continue
      const side = dockEl.dataset['dock'] as DockSide
      const groupEls = [...dockEl.querySelectorAll<HTMLElement>('[data-group]')]
      const own = (group: number): boolean => !!from && from.side === side && from.group === group
      const join = (el: HTMLElement): Pick<Drag, 'target' | 'box'> => {
        const group = Number(el.dataset['group'])
        if (own(group)) return none
        const index = current[side].groups[group].tabs.length
        return { target: { kind: 'tab', side, group, index }, box: box(el.getBoundingClientRect()) }
      }
      if (groupEls.length >= maxGroups) {
        const over = groupEls.find((el) => inside(el.getBoundingClientRect()))
        return over ? join(over) : none
      }
      const near = side === 'bottom' ? x < r.left + r.width / 2 : y < r.top + r.height / 2
      if (near) return join(groupEls[0])
      const alone = own(Number(groupEls[0].dataset['group'])) && current[side].groups.length === 1
      if (alone && current[side].groups[from!.group].tabs.length === 1) return none
      const half =
        side === 'bottom'
          ? { left: r.left + r.width / 2, top: r.top, width: r.width / 2, height: r.height }
          : { left: r.left, top: r.top + r.height / 2, width: r.width, height: r.height / 2 }
      return { target: { kind: 'apart', side }, box: half }
    }

    // At an edge without a dock: a new one there.
    const outer = host.getBoundingClientRect()
    const center = host.querySelector('.dock-center')!.getBoundingClientRect()
    if (shown.left.length === 0 && x < outer.left + edge) {
      const width = current.left.size
      return { target: { kind: 'apart', side: 'left' }, box: { ...box(outer), width } }
    }
    if (shown.right.length === 0 && x > outer.right - edge) {
      const width = current.right.size
      return {
        target: { kind: 'apart', side: 'right' },
        box: { ...box(outer), left: outer.right - width, width }
      }
    }
    if (
      shown.bottom.length === 0 &&
      x > center.left &&
      x < center.right &&
      y > center.bottom - edge
    ) {
      const height = Math.min(current.bottom.size, center.height / 2)
      return {
        target: { kind: 'apart', side: 'bottom' },
        box: { ...box(center), top: center.bottom - height, height }
      }
    }
    return none
  }

  const startDrag = (tool: ToolId, e: React.PointerEvent): void => {
    if (e.button !== 0) return
    const x0 = e.clientX
    const y0 = e.clientY
    let dragging = false
    let last: Drag | null = null
    const move = (ev: PointerEvent): void => {
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < threshold) return
      dragging = true
      last = { tool, x: ev.clientX, y: ev.clientY, ...targetAt(tool, ev.clientX, ev.clientY) }
      setDrag(last)
    }
    const stop = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', key, true)
      setDrag(null)
    }
    const up = (): void => {
      stop()
      const target = last?.target
      if (target) onDocks((d) => moveTool(d, tool, target))
    }
    const key = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopPropagation()
      stop()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', key, true)
  }

  const dockView = (side: DockSide): React.JSX.Element | null => {
    if (shown[side].length === 0) return null
    return (
      <DockView
        side={side}
        dock={docks[side]}
        shown={shown[side]}
        tools={tools}
        dragged={drag?.tool ?? null}
        elementOf={elementOf}
        onShow={(tool) => onDocks((d) => showTool(d, tool))}
        onSplit={(split) => onDocks((d) => withDock(d, side, (dock) => ({ ...dock, split })))}
        onPress={startDrag}
      />
    )
  }
  const resize = (side: DockSide, by: number, min: number, max: number): void =>
    onDocks((d) =>
      withDock(d, side, (dock) => ({
        ...dock,
        size: Math.min(max, Math.max(min, dock.size + by))
      }))
    )

  return (
    <div className="dock-layout" ref={root}>
      {dockView('left')}
      {shown.left.length > 0 && (
        <Splitter direction="horizontal" onDrag={(d) => resize('left', d, 160, 600)} />
      )}
      <div className="dock-center">
        <div className="dock-main">{children}</div>
        {shown.bottom.length > 0 && (
          <Splitter direction="vertical" onDrag={(d) => resize('bottom', -d, 100, 900)} />
        )}
        {dockView('bottom')}
      </div>
      {shown.right.length > 0 && (
        <Splitter direction="horizontal" onDrag={(d) => resize('right', -d, 160, 600)} />
      )}
      {dockView('right')}
      {toolIds.map((id) => {
        const tool = tools[id]
        return tool ? createPortal(tool.content, elementOf(id), id) : null
      })}
      {drag && (
        <div className="dock-drag">
          {shown.left.length === 0 && <div className="dock-edge left" />}
          {shown.right.length === 0 && <div className="dock-edge right" />}
          {drag.box && (
            <div
              className={
                drag.target?.kind === 'tab' && drag.box.width < 8 ? 'dock-mark line' : 'dock-mark'
              }
              style={drag.box}
            />
          )}
          <div className="dock-ghost" style={{ left: drag.x + 10, top: drag.y + 10 }}>
            <span>{toolTitles[drag.tool]}</span>
          </div>
        </div>
      )}
    </div>
  )
}

interface DockViewProps {
  side: DockSide
  dock: Dock
  shown: Shown[]
  tools: Partial<Record<ToolId, Tool>>
  dragged: ToolId | null
  elementOf: (tool: ToolId) => HTMLDivElement
  onShow: (tool: ToolId) => void
  onSplit: (split: number) => void
  onPress: (tool: ToolId, e: React.PointerEvent) => void
}

function DockView(props: DockViewProps): React.JSX.Element {
  const { side, dock, shown, tools, dragged, elementOf, onShow, onSplit, onPress } = props
  const host = useRef<HTMLDivElement>(null)
  const vertical = side !== 'bottom'
  const size = vertical ? { width: dock.size } : { height: dock.size }
  return (
    <section className={`dock ${side}`} data-dock={side} style={size} ref={host}>
      {shown.map((g, i) => (
        <GroupView
          key={g.index}
          side={side}
          group={g}
          tools={tools}
          dragged={dragged}
          elementOf={elementOf}
          onShow={onShow}
          onPress={onPress}
          style={i === 0 && shown.length > 1 ? { flex: `0 0 ${dock.split * 100}%` } : undefined}
          after={
            i === 0 && shown.length > 1 ? (
              <Splitter
                direction={vertical ? 'vertical' : 'horizontal'}
                onDrag={(d) => {
                  const length = vertical ? host.current?.clientHeight : host.current?.clientWidth
                  if (length) onSplit(Math.min(0.85, Math.max(0.15, dock.split + d / length)))
                }}
              />
            ) : null
          }
        />
      ))}
    </section>
  )
}

interface GroupViewProps {
  side: DockSide
  group: Shown
  tools: Partial<Record<ToolId, Tool>>
  dragged: ToolId | null
  elementOf: (tool: ToolId) => HTMLDivElement
  onShow: (tool: ToolId) => void
  onPress: (tool: ToolId, e: React.PointerEvent) => void
  style?: React.CSSProperties
  after: React.ReactNode
}

function GroupView(props: GroupViewProps): React.JSX.Element {
  const { side, group, tools, dragged, elementOf, onShow, onPress, style, after } = props
  const body = useRef<HTMLDivElement>(null)
  // The group's tool windows move in here, the one in front shown.
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    for (const tool of group.tabs) {
      const toolEl = elementOf(tool)
      if (toolEl.parentElement !== el) el.appendChild(toolEl)
      toolEl.hidden = tool !== group.active
    }
  })
  return (
    <>
      <div className="tool-group" data-group={group.index} style={style}>
        <div className="tool-tabs" data-strip={`${side}:${group.index}`}>
          {group.tabs.map((tool) => {
            const badge = tools[tool]?.badge
            return (
              <button
                key={tool}
                data-tab={tool}
                className={
                  (group.active === tool ? 'on' : '') + (dragged === tool ? ' lifted' : '')
                }
                onPointerDown={(e) => onPress(tool, e)}
                onClick={() => onShow(tool)}
              >
                {toolTitles[tool]}
                {!!badge && <span className="badge">{badge}</span>}
              </button>
            )
          })}
        </div>
        <div className="tool-body" ref={body} />
      </div>
      {after}
    </>
  )
}
