import { useEffect, useState } from 'react'
import type { DirEntry } from '../../../shared/types'
import { ChevronRight, ChevronsDownUp, FilePlus, FolderPlus, RefreshCw } from 'lucide-react'
import FileIcon from './FileIcon'

interface Props {
  name: string
  selected: string | null
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onContextMenu: (entry: DirEntry, x: number, y: number) => void
  onDropFiles: (dir: string, files: File[]) => void
  onNewPage: () => void
  onNewFolder: () => void
  onRefresh: () => void
  onCollapseAll: () => void
  version: number
}

const indent = 12
const rowStart = 6

const parentOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

const hasFiles = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('Files')

export default function FileTree(props: Props): React.JSX.Element {
  const { name, onNewPage, onNewFolder, onRefresh, onCollapseAll } = props
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  return (
    <div className="tree">
      <div className="tree-root">
        <span className="tree-title">{name}</span>
        <span className="tree-actions">
          <button title="New page" onClick={onNewPage}>
            <FilePlus size={16} />
          </button>
          <button title="New folder" onClick={onNewFolder}>
            <FolderPlus size={16} />
          </button>
          <button title="Refresh" onClick={onRefresh}>
            <RefreshCw size={16} />
          </button>
          <button title="Collapse all" onClick={onCollapseAll}>
            <ChevronsDownUp size={16} />
          </button>
        </span>
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
        const open = entry.isDir && expanded.has(entry.path)
        const classes = ['tree-item']
        if (selected === entry.path) classes.push('selected')
        if (dropTarget === dropDir) classes.push('drop-target')
        return (
          <div key={entry.path}>
            <div
              className={classes.join(' ')}
              style={{ paddingLeft: rowStart + depth * indent }}
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
              {Array.from({ length: depth }, (_, i) => (
                <span key={i} className="tree-guide" style={{ left: rowStart + i * indent + 7 }} />
              ))}
              {entry.isDir ? (
                <span className={`tree-arrow${open ? ' open' : ''}`}>
                  <ChevronRight size={16} />
                </span>
              ) : (
                <FileIcon name={entry.name} />
              )}
              <span className="tree-name">{entry.name}</span>
            </div>
            {open && <Children {...props} path={entry.path} depth={depth + 1} />}
          </div>
        )
      })}
    </>
  )
}
