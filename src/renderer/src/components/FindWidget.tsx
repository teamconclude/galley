import { useEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery
} from '@codemirror/search'
import {
  ArrowDown,
  ArrowUp,
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  Regex,
  Replace,
  ReplaceAll,
  WholeWord,
  X
} from 'lucide-react'
import Tip from './Tip'

interface Props {
  view: EditorView
  query: SearchQuery
  count: number
  current: number
  replace: boolean
  onToggleReplace: () => void
}

type Spec = ConstructorParameters<typeof SearchQuery>[0]

export default function FindWidget(props: Props): React.JSX.Element {
  const { view, query, count, current, replace, onToggleReplace } = props
  const [search, setSearch] = useState(query.search)
  const [replacement, setReplacement] = useState(query.replace)
  const [seen, setSeen] = useState(query.search)
  const field = useRef<HTMLInputElement>(null)
  // The query changes from outside when the panel is reopened over a selection.
  if (query.search !== seen) {
    setSeen(query.search)
    setSearch(query.search)
  }
  // CodeMirror looks for main-field when it refocuses an open panel.
  useEffect(() => {
    field.current?.setAttribute('main-field', 'true')
    field.current?.focus()
    field.current?.select()
  }, [])

  const spec: Spec = {
    search: query.search,
    caseSensitive: query.caseSensitive,
    regexp: query.regexp,
    wholeWord: query.wholeWord,
    replace: query.replace,
    literal: true
  }
  const set = (patch: Partial<Spec>): SearchQuery => {
    const next = new SearchQuery({ ...spec, ...patch })
    view.dispatch({ effects: setSearchQuery.of(next) })
    return next
  }

  // While typing, the selection follows the first hit at or after where it stands.
  const change = (text: string): void => {
    setSearch(text)
    setSeen(text)
    const next = set({ search: text })
    if (!next.valid) return
    const from = view.state.selection.main.from
    let cursor = next.getCursor(view.state, from).next()
    if (cursor.done) cursor = next.getCursor(view.state, 0).next()
    if (cursor.done) return
    view.dispatch({
      selection: EditorSelection.single(cursor.value.from, cursor.value.to),
      scrollIntoView: true
    })
  }

  const close = (): void => {
    closeSearchPanel(view)
    view.focus()
  }

  const onKey = (e: React.KeyboardEvent, enter: () => void): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      enter()
    }
  }

  const option = (
    key: 'caseSensitive' | 'wholeWord' | 'regexp',
    label: string,
    Icon: typeof CaseSensitive
  ): React.JSX.Element => (
    <Tip text={label}>
      <button
        aria-label={label}
        className={query[key] ? 'find-option on' : 'find-option'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => set({ [key]: !query[key] })}
      >
        <Icon size={16} />
      </button>
    </Tip>
  )

  const icon = (
    label: string,
    Icon: typeof ArrowUp,
    run: () => void,
    disabled = false
  ): React.JSX.Element => (
    <Tip text={label}>
      <button
        aria-label={label}
        className="find-icon"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={run}
      >
        <Icon size={16} />
      </button>
    </Tip>
  )

  const status = !query.valid
    ? query.search === ''
      ? ''
      : 'Invalid'
    : count === 0
      ? 'No results'
      : current
        ? `${current} of ${count}`
        : `${count} results`

  return (
    <div className="find" onMouseDown={(e) => e.stopPropagation()}>
      <button
        className="find-toggle"
        aria-label={replace ? 'Hide replace' : 'Show replace'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggleReplace}
      >
        {replace ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      <div className="find-rows">
        <div className="find-row">
          <div className="find-field">
            <input
              ref={field}
              value={search}
              placeholder="Find"
              spellCheck={false}
              onChange={(e) => change(e.target.value)}
              onKeyDown={(e) => onKey(e, () => (e.shiftKey ? findPrevious(view) : findNext(view)))}
            />
            {option('caseSensitive', 'Match case', CaseSensitive)}
            {option('wholeWord', 'Whole word', WholeWord)}
            {option('regexp', 'Regular expression', Regex)}
          </div>
          <span className={count === 0 && query.valid && search ? 'find-count none' : 'find-count'}>
            {status}
          </span>
          {icon('Previous match', ArrowUp, () => findPrevious(view), count === 0)}
          {icon('Next match', ArrowDown, () => findNext(view), count === 0)}
          {icon('Close', X, close)}
        </div>
        {replace && (
          <div className="find-row">
            <div className="find-field">
              <input
                value={replacement}
                placeholder="Replace"
                spellCheck={false}
                onChange={(e) => {
                  setReplacement(e.target.value)
                  set({ replace: e.target.value })
                }}
                onKeyDown={(e) =>
                  onKey(e, () => (e.metaKey || e.ctrlKey ? replaceAll(view) : replaceNext(view)))
                }
              />
            </div>
            {icon('Replace', Replace, () => replaceNext(view), count === 0)}
            {icon('Replace all', ReplaceAll, () => replaceAll(view), count === 0)}
          </div>
        )}
      </div>
    </div>
  )
}
