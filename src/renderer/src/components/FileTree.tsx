import { useEffect, useState } from 'react'
import type { DirEntry } from '../../../shared/types'

interface Props {
  name: string
  selected: string | null
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onContextMenu: (entry: DirEntry, x: number, y: number) => void
  onDropFiles: (dir: string, files: File[]) => void
  onNewPage: () => void
  version: number
}

const parentOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

const hasFiles = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('Files')

export default function FileTree(props: Props): React.JSX.Element {
  const { name, onNewPage } = props
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  return (
    <div className="tree">
      <div className="tree-root">
        <span>{name}</span>
        <button title="New page" onClick={onNewPage}>
          +
        </button>
      </div>
      <Children
        {...props}
        path=""
        depth={0}
        dropTarget={dropTarget}
        setDropTarget={setDropTarget}
      />
    </div>
  )
}

interface ChildrenProps extends Props {
  path: string
  depth: number
  dropTarget: string | null
  setDropTarget: (path: string | null) => void
}

function Children(props: ChildrenProps): React.JSX.Element {
  const { path, depth, expanded, onToggle, selected, onSelect, version } = props
  const { onContextMenu, onDropFiles, dropTarget, setDropTarget } = props
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
      {entries.map((entry) => {
        const dropDir = entry.isDir ? entry.path : parentOf(entry.path)
        const classes = ['tree-item']
        if (selected === entry.path) classes.push('selected')
        if (dropTarget === dropDir) classes.push('drop-target')
        return (
          <div key={entry.path}>
            <div
              className={classes.join(' ')}
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={() => (entry.isDir ? onToggle(entry.path) : onSelect(entry.path))}
              onContextMenu={(e) => {
                e.preventDefault()
                onContextMenu(entry, e.clientX, e.clientY)
              }}
              onDragOver={(e) => {
                if (!hasFiles(e)) return
                e.preventDefault()
                e.stopPropagation()
                setDropTarget(dropDir)
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                if (!hasFiles(e)) return
                e.preventDefault()
                e.stopPropagation()
                setDropTarget(null)
                onDropFiles(dropDir, [...e.dataTransfer.files])
              }}
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
        )
      })}
    </>
  )
}
