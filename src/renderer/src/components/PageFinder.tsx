import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PageInfo } from '../../../shared/types'
import { findPages, pageState, stateDetail, stateLabel } from '../lib/pages'

interface Props {
  pages: Map<string, PageInfo>
  onOpen: (path: string) => void
  onClose: () => void
}

// Finds a page by what an editor knows of it: words of its title, its address, an old
// address that forwards to it, or its file name. Without a query it lists the newest pages.
export default function PageFinder({ pages, onOpen, onClose }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const matches = useMemo(() => findPages(pages.values(), query), [pages, query])

  useEffect(() => {
    list.current?.querySelector('.finder-row.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (path: string | undefined): void => {
    if (!path) return
    onClose()
    onOpen(path)
  }

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, matches.length - 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
    else if (e.key === 'Enter') choose(matches[active]?.page.path)
    else if (e.key === 'Escape') onClose()
    else return
    e.preventDefault()
  }

  return createPortal(
    <div className="modal-backdrop finder-backdrop" onMouseDown={onClose}>
      <div className="finder" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type="search"
          placeholder="Find a page by title, address, link or file name…"
          value={query}
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKey}
        />
        <div className="finder-list" ref={list}>
          {pages.size > 0 && matches.length === 0 && (
            <div className="finder-empty">No page matches “{query}”.</div>
          )}
          {pages.size === 0 && <div className="finder-empty">Loading the pages…</div>}
          {matches.map(({ page, alias }, i) => {
            const state = pageState(page)
            return (
              <div
                key={page.path}
                className={'finder-row' + (i === active ? ' active' : '')}
                title={[page.path, stateDetail(page)].filter(Boolean).join('\n')}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(page.path)}
              >
                <div className="finder-title">
                  <span>{page.title || page.path.split('/').pop()}</span>
                  {state && (
                    <span className={`page-badge compact ${state}`}>{stateLabel[state]}</span>
                  )}
                </div>
                <div className="finder-url">
                  {page.url}
                  {alias && <span> · formerly {alias}</span>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="modal-foot">
          <span>↑↓ to choose, ⏎ to open</span>
          <span>
            {query ? `${matches.length} found` : 'Newest first'} · {pages.size} pages
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}
