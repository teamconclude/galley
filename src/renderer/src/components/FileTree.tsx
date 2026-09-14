import { useEffect, useState } from 'react'
import type { DirEntry } from '../../../shared/types'

interface Props {
  name: string
  selected: string | null
  onSelect: (path: string) => void
  version: number
}

export default function FileTree({ name, selected, onSelect, version }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['content']))
  const toggle = (path: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  return (
    <div className="tree">
      <div className="tree-root">{name}</div>
      <Children
        path=""
        depth={0}
        expanded={expanded}
        toggle={toggle}
        selected={selected}
        onSelect={onSelect}
        version={version}
      />
    </div>
  )
}

interface ChildrenProps {
  path: string
  depth: number
  expanded: Set<string>
  toggle: (path: string) => void
  selected: string | null
  onSelect: (path: string) => void
  version: number
}

function Children(props: ChildrenProps): React.JSX.Element {
  const { path, depth, expanded, toggle, selected, onSelect, version } = props
  const [entries, setEntries] = useState<DirEntry[]>([])
  useEffect(() => {
    let live = true
    window.api.repo
      .list(path)
      .then((list) => live && setEntries(list))
      .catch(() => live && setEntries([]))
    return () => {
      live = false
    }
  }, [path, version])
  return (
    <>
      {entries.map((entry) => (
        <div key={entry.path}>
          <div
            className={'tree-item' + (selected === entry.path ? ' selected' : '')}
            style={{ paddingLeft: 10 + depth * 14 }}
            onClick={() => (entry.isDir ? toggle(entry.path) : onSelect(entry.path))}
          >
            <span className="tree-arrow">
              {entry.isDir ? (expanded.has(entry.path) ? '▾' : '▸') : ''}
            </span>
            {entry.name}
          </div>
          {entry.isDir && expanded.has(entry.path) && (
            <Children {...props} path={entry.path} depth={depth + 1} />
          )}
        </div>
      ))}
    </>
  )
}
