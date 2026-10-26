import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Dock, Docks, DockSide, ToolId } from '../../../shared/types'
import {
  dockTool,
  floatTool,
  isFloating,
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
import {
  closeToolWindow,
  openToolWindow,
  toolWindowClosed,
  useToolWindows
} from '../lib/toolWindows'
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
  // The tool window's own window moves along, rather than a ghost of it.
  byWindow?: boolean
  // The tool window as it follows the pointer: its size, where it was taken hold of, and a
  // picture of it once there is one.
  ghost?: Ghost
}

interface Ghost {
  width: number
  height: number
  dx: number
  dy: number
  image: string | null
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
// that has none, or, dropped outside the main window, in a window of its own there. Esc
// puts it back. Each tool window lives in an element of its own that moves between the
// docks and windows, so it keeps what it holds wherever it goes.
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

  const available = (tool: ToolId): boolean => !!tools[tool] && !hidden.includes(tool)
  const has = (tool: ToolId): boolean => available(tool) && !isFloating(docks, tool)

  // Tool windows on their own: their windows open and close with the arrangement, and one
  // the editor closes puts its tool window back in its dock.
  const windows = useToolWindows()
  const dropped = useRef(new Map<ToolId, { x: number; y: number }>())
  const floating = docks.floating.filter(available)
  useEffect(() => {
    for (const tool of floating) {
      openToolWindow(tool, toolTitles[tool], dropped.current.get(tool))
      dropped.current.delete(tool)
    }
    for (const tool of windows.keys()) if (!floating.includes(tool)) closeToolWindow(tool)
  })
  useEffect(
    () =>
      window.api.tools.onClosed((tool) => {
        if (toolWindowClosed(tool)) onDocks((d) => dockTool(d, tool))
      }),
    [onDocks]
  )

  const shown = Object.fromEntries(sides.map((s) => [s, shownGroups(docks[s], has)])) as Record<
    DockSide,
    Shown[]
  >

  const targetAt = (tool: ToolId, x: number, y: number): Pick<Drag, 'target' | 'box'> => {
    const none = { target: null, box: null }
    const host = root.current
    if (!host) return none
    const current = docksRef.current
    // A tool window on its own has a place in a dock but is not there, so anywhere in the
    // docks brings it back.
    const from = isFloating(current, tool) ? null : placeOf(current, tool)
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
      if (alone && from && current[side].groups[from.group].tabs.length === 1) return none
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

  // A drag starts in the main window or in a tool window's own window; either way the
  // pointer is followed in the main window's coordinates, and the window it started in
  // keeps reporting it while the button is down, wherever it goes. Within the main window
  // a picture of the tool window follows the pointer. Leaving it, the tool window tears
  // off into a window of its own under the pointer, as a browser tab does, which then
  // follows the pointer; so does a tool window's own window dragged by its tab bar. Such a
  // window turns see-through over a place to dock, and docks there only once let go,
  // never during the move; let go elsewhere, it stays a window where it is. Esc undoes it.
  const startDrag = (tool: ToolId, e: React.PointerEvent): void => {
    if (e.button !== 0) return
    const view = (e.view as unknown as Window | null) ?? window
    const fromMain = view === window
    const start = { x: view.screenX, y: view.screenY }
    const local = (ev: PointerEvent): { x: number; y: number } =>
      fromMain
        ? { x: ev.clientX, y: ev.clientY }
        : {
            x: ev.screenX - window.screenX,
            y: ev.screenY - window.screenY - (window.outerHeight - window.innerHeight)
          }
    const x0 = e.screenX
    const y0 = e.screenY
    let dragging = false
    let tornOff = false
    let seeThrough = false
    let last: Drag | null = null
    // The picture: the tool window's own contents, under a tab bar with its tab alone.
    const group = fromMain
      ? (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-group]')
      : null
    const g = group?.getBoundingClientRect()
    let ghost: Ghost | undefined = g && {
      width: g.width,
      height: g.height,
      dx: e.clientX - g.left,
      dy: e.clientY - g.top,
      image: null
    }
    // Taken at the press, before anything of the drag is drawn over it; a tool window
    // behind another tab has nothing to show but its frame.
    const content = elementOf(tool)
    if (g && !content.hidden) {
      const c = content.getBoundingClientRect()
      void window.api.tools
        .snapshot({ x: c.left, y: c.top, width: c.width, height: c.height })
        .then((image) => {
          if (!ghost) return
          ghost = { ...ghost, image }
          if (last) setDrag((last = { ...last, ghost }))
        })
        .catch(() => {})
    }
    // Where the moving window goes: its tab bar under the pointer as it tears off, or as
    // far as the pointer moved, for a window that was there already.
    const windowAt = (ev: PointerEvent): { x: number; y: number } =>
      fromMain
        ? { x: ev.screenX - 110, y: ev.screenY - 20 }
        : { x: start.x + ev.screenX - x0, y: start.y + ev.screenY - y0 }
    const move = (ev: PointerEvent): void => {
      if (!dragging && Math.hypot(ev.screenX - x0, ev.screenY - y0) < threshold) return
      dragging = true
      const { x, y } = local(ev)
      const outside = x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight
      if (fromMain && outside && !tornOff && !isFloating(docksRef.current, tool)) {
        tornOff = true
        dropped.current.set(tool, windowAt(ev))
        onDocks((d) => floatTool(d, tool))
      }
      const moving = !fromMain || tornOff
      const placed: Pick<Drag, 'target' | 'box'> = outside
        ? { target: null, box: null }
        : targetAt(tool, x, y)
      if (moving) {
        const at = windowAt(ev)
        window.api.tools.place(tool, at.x, at.y)
        if (seeThrough !== !!placed.target) {
          seeThrough = !!placed.target
          window.api.tools.seeThrough(tool, seeThrough)
        }
      }
      last = { tool, x, y, ...placed, byWindow: moving, ghost }
      setDrag(last)
    }
    const stop = (): void => {
      view.removeEventListener('pointermove', move)
      view.removeEventListener('pointerup', up)
      view.removeEventListener('keydown', key, true)
      if (seeThrough) window.api.tools.seeThrough(tool, false)
      // A picture arriving after the drag has nothing to show.
      ghost = undefined
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
      if (tornOff) onDocks((d) => dockTool(d, tool))
      else if (!fromMain && dragging) window.api.tools.place(tool, start.x, start.y)
    }
    view.addEventListener('pointermove', move)
    view.addEventListener('pointerup', up)
    view.addEventListener('keydown', key, true)
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
        <Splitter direction="horizontal" onDrag={(d) => resize('right', -d, 160, 1400)} />
      )}
      {dockView('right')}
      {toolIds.map((id) => {
        const tool = tools[id]
        return tool ? createPortal(tool.content, elementOf(id), id) : null
      })}
      {[...windows].map(([tool, win]) =>
        floating.includes(tool) ? (
          <ToolWindow
            key={tool}
            tool={tool}
            win={win}
            badge={tools[tool]?.badge}
            elementOf={elementOf}
            onPress={startDrag}
          />
        ) : null
      )}
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
          {!drag.byWindow && drag.ghost && (
            <div
              className="dock-ghost"
              style={{
                left: drag.x - drag.ghost.dx,
                top: drag.y - drag.ghost.dy,
                width: drag.ghost.width,
                height: drag.ghost.height
              }}
            >
              <div className="tool-tabs">
                <button className="on">{toolTitles[drag.tool]}</button>
              </div>
              {drag.ghost.image && <img src={drag.ghost.image} alt="" />}
            </div>
          )}
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

interface ToolWindowProps {
  tool: ToolId
  win: Window
  badge?: number
  elementOf: (tool: ToolId) => HTMLDivElement
  onPress: (tool: ToolId, e: React.PointerEvent) => void
}

// A tool window in a window of its own: its tab bar, which is the window's title bar and
// moves it, or into a dock, and the tool window itself. Closing the window puts it back
// where it was.
function ToolWindow(props: ToolWindowProps): React.JSX.Element {
  const { tool, win, badge, elementOf, onPress } = props
  const body = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = elementOf(tool)
    if (body.current && el.parentElement !== body.current) body.current.appendChild(el)
    el.hidden = false
  })
  return createPortal(
    <div className="tool-window">
      <div className="tool-tabs" onPointerDown={(e) => onPress(tool, e)}>
        <button className="on" data-tab={tool}>
          {toolTitles[tool]}
          {!!badge && <span className="badge">{badge}</span>}
        </button>
      </div>
      <div className="tool-body" ref={body} />
    </div>,
    win.document.body
  )
}
