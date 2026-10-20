import { useEffect, useState } from 'react'
import type { DirEntry, PageInfo } from '../../../shared/types'
import {
  ChevronRight,
  ChevronsDownUp,
  Eye,
  EyeOff,
  FilePlus,
  FolderPlus,
  Heading,
  RefreshCw,
  Search
} from 'lucide-react'
import FileIcon from './FileIcon'
import Tip from './Tip'
import { useSchemas } from '../lib/contexts'
import { pageState, stateDetail, stateLabel } from '../lib/pages'

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
  showAll: boolean
  onToggleShowAll: () => void
  // Pages by path, for naming content files by their titles.
  pages: Map<string, PageInfo>
  showTitles: boolean
  onToggleTitles: () => void
  onFindPage: () => void
  version: number
}

const indent = 12
const rowStart = 6

const parentOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

const hasFiles = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('Files')

export default function FileTree(props: Props): React.JSX.Element {
  const { name, onNewPage, onNewFolder, onRefresh, onCollapseAll, showAll, onToggleShowAll } = props
  const { showTitles, onToggleTitles, onFindPage } = props
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  return (
    <div className="tree">
      <div className="tree-root">
        <span className="tree-title">{name}</span>
        <span className="tree-actions">
          <Tip text="Find page (⌘P)">
            <button aria-label="Find page" onClick={onFindPage}>
              <Search size={16} />
            </button>
          </Tip>
          <Tip text="New page">
            <button aria-label="New page" onClick={onNewPage}>
              <FilePlus size={16} />
            </button>
          </Tip>
          <Tip text="New folder">
            <button aria-label="New folder" onClick={onNewFolder}>
              <FolderPlus size={16} />
            </button>
          </Tip>
          <Tip text="Refresh">
            <button aria-label="Refresh" onClick={onRefresh}>
              <RefreshCw size={16} />
            </button>
          </Tip>
          <Tip text="Collapse all">
            <button aria-label="Collapse all" onClick={onCollapseAll}>
              <ChevronsDownUp size={16} />
            </button>
          </Tip>
          <Tip text={showTitles ? 'Hide page titles' : 'Show page titles'}>
            <button
              aria-label={showTitles ? 'Hide page titles' : 'Show page titles'}
              className={showTitles ? 'on' : ''}
              onClick={onToggleTitles}
            >
              <Heading size={16} />
            </button>
          </Tip>
          <Tip text={showAll ? 'Show content files only' : 'Show all files'}>
            <button
              aria-label={showAll ? 'Show content files only' : 'Show all files'}
              className={showAll ? 'on' : ''}
              onClick={onToggleShowAll}
            >
              {showAll ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </Tip>
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
  const { onContextMenu, onDropFiles, dropTarget, setDropTarget, showAll } = props
  const { pages, showTitles } = props
  const [entries, setEntries] = useState<DirEntry[]>([])
  // What an editor works in: pages, images and downloads, and the menus and authors.
  const { site } = useSchemas()
  const editorRoots = new Set([site.contentDir, site.staticDir.split('/')[0], 'data'])
  useEffect(() => {
    let live = true
    window.api.repo
      .list(path)
      .then((list) => {
        if (!live) return
        setEntries(path === '' && !showAll ? list.filter((e) => editorRoots.has(e.name)) : list)
      })
      .catch(() => live && setEntries([]))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version, showAll, site])
  // The open file comes into view once its folder has loaded, e.g. after the page finder
  // opened it deep in a long section.
  useEffect(() => {
    if (!selected || !entries.some((e) => e.path === selected)) return
    document
      .querySelector(`.tree-item[data-path="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [entries, selected])

  // The page a file is, or a page bundle's folder stands for.
  const pageOf = (entry: DirEntry): PageInfo | undefined =>
    entry.isDir ? pages.get(`${entry.path}/index.md`) : pages.get(entry.path)
  const inContent = path === site.contentDir || path.startsWith(site.contentDir + '/')
  const titled = showTitles && inContent
  // Folders first, then the section's own page, then pages newest first; pages without
  // a date follow by file name.
  const shown = titled ? [...entries].sort((a, b) => order(a) - order(b) || compare(a, b)) : entries
  function order(entry: DirEntry): number {
    if (/^_?index\.md$/.test(entry.name)) return 0
    if (entry.isDir && !pageOf(entry)) return 1
    return pageOf(entry) ? 2 : 3
  }
  function compare(a: DirEntry, b: DirEntry): number {
    const [pa, pb] = [pageOf(a), pageOf(b)]
    const byDate = (pb?.date ?? '').localeCompare(pa?.date ?? '')
    return byDate || a.name.localeCompare(b.name)
  }

  return (
    <>
      {shown.map((entry) => {
        const dropDir = entry.isDir ? entry.path : parentOf(entry.path)
        const open = entry.isDir && expanded.has(entry.path)
        const classes = ['tree-item']
        if (selected === entry.path) classes.push('selected')
        if (dropTarget === dropDir) classes.push('drop-target')
        const page = pageOf(entry)
        const tip = page
          ? [titled ? null : page.title, stateDetail(page)].filter(Boolean).join('\n') || undefined
          : undefined
        if (titled && page?.title) classes.push('two-line')
        return (
          <div key={entry.path}>
            <div
              className={classes.join(' ')}
              data-path={entry.path}
              title={tip}
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
              {titled && page?.title ? (
                <span className="tree-label">
                  <span className="tree-name">{entry.name}</span>
                  <span className="tree-title">{page.title}</span>
                </span>
              ) : (
                <span className="tree-name">{entry.name}</span>
              )}
              {badge(pageOf(entry))}
            </div>
            {open && <Children {...props} path={entry.path} depth={depth + 1} />}
          </div>
        )
      })}
    </>
  )
}

// Marks a page that is not on the live site.
function badge(page: PageInfo | undefined): React.JSX.Element | null {
  const state = page && pageState(page)
  return state ? <span className={`page-badge compact ${state}`}>{stateLabel[state]}</span> : null
}
