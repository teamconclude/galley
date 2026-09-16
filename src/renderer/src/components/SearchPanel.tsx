import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { SearchFile, SearchMatch, SearchOptions, SearchResults } from '../../../shared/types'
import { substitute } from '../../../shared/search'
import FileIcon from './FileIcon'

export interface SearchRequest {
  tick: number
  // Text to search for, e.g. the editor's selection; null keeps what is in the field.
  text: string | null
  // Show the replace field as well.
  replace: boolean
}

// How hits are shown: as they are, or with what replaces them.
interface Preview {
  query: string
  options: SearchOptions
  replacement: string
}

interface Props {
  hidden: boolean
  request: SearchRequest | null
  selected: { path: string; line: number; column: number } | null
  onOpen: (path: string, match: SearchMatch) => void
  onReplaceAll: (query: string, options: SearchOptions, replacement: string) => Promise<void>
}

const defaults: SearchOptions = { ignoreCase: true, regex: false, contentOnly: true }
const context = 30

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? '' : word.endsWith('h') ? 'es' : 's'}`

const summary = (r: SearchResults): string =>
  r.total === 0
    ? 'No matches'
    : `${plural(r.total, 'match')} in ${plural(r.files.length, 'file')}` +
      (r.truncated ? ', showing the first ones' : '')

export default function SearchPanel(props: Props): React.JSX.Element {
  const { hidden, request, selected, onOpen, onReplaceAll } = props
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState(defaults)
  const [replace, setReplace] = useState(false)
  const [replacement, setReplacement] = useState('')
  const [version, setVersion] = useState(0)
  const [results, setResults] = useState<SearchResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const input = useRef<HTMLInputElement>(null)
  const sequence = useRef(0)

  // A request from the menu arrives as a prop; the query it carries is taken over during
  // the render that sees it, and the field gets focus once it is on screen.
  const [handled, setHandled] = useState(0)
  if (request && request.tick !== handled) {
    setHandled(request.tick)
    if (request.text !== null) setQuery(request.text)
    if (request.replace) setReplace(true)
  }
  useEffect(() => {
    if (!request) return
    input.current?.focus()
    input.current?.select()
  }, [request])

  useEffect(() => {
    const id = ++sequence.current
    if (query === '') return
    const timer = window.setTimeout(() => {
      window.api.repo
        .search(query, options)
        .then((r) => {
          if (sequence.current !== id) return
          setResults(r)
          setError(null)
          setCollapsed(new Set())
        })
        .catch((e: unknown) => {
          if (sequence.current !== id) return
          const message = e instanceof Error ? e.message : String(e)
          setError(
            message.replace(
              /^.*Invalid regular expression: \/.*\/\w*: /,
              'Not a valid expression: '
            )
          )
        })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [query, options, version])

  const shown = query === '' ? null : results
  const shownError = query === '' ? null : error
  const preview = replace ? { query, options, replacement } : null

  const replaceAll = async (): Promise<void> => {
    if (!shown || shown.total === 0) return
    const what = `${plural(shown.total, 'match')} in ${plural(shown.files.length, 'file')}`
    const question = shown.truncated
      ? `Replace every match in the site? At least ${what} change.`
      : `Replace ${what}?`
    if (!window.confirm(question)) return
    await onReplaceAll(query, options, replacement)
    setVersion((v) => v + 1)
  }

  const toggle = (path: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const option = (key: keyof SearchOptions, label: string): React.JSX.Element => (
    <label className="search-option">
      <input
        type="checkbox"
        checked={options[key]}
        onChange={(e) => setOptions({ ...options, [key]: e.target.checked })}
      />
      {label}
    </label>
  )

  return (
    <div className="search" hidden={hidden}>
      <div className="search-form">
        <div className="search-fields">
          <button
            className="find-toggle"
            aria-label={replace ? 'Hide replace' : 'Show replace'}
            onClick={() => setReplace(!replace)}
          >
            {replace ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <div className="search-inputs">
            <input
              ref={input}
              type="text"
              className="search-input"
              placeholder="Search the site"
              value={query}
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const first = shown?.files[0]
                if (first) onOpen(first.path, first.matches[0])
              }}
            />
            {replace && (
              <div className="search-replace">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Replace"
                  value={replacement}
                  spellCheck={false}
                  onChange={(e) => setReplacement(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void replaceAll()
                  }}
                />
                <button disabled={!shown || shown.total === 0} onClick={() => void replaceAll()}>
                  Replace all
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="search-options">
          {option('ignoreCase', 'Ignore case')}
          {option('contentOnly', 'Content only')}
          {option('regex', 'Regular expression')}
        </div>
        <div className={shownError ? 'search-summary error' : 'search-summary'}>
          {shownError ?? (shown ? summary(shown) : '')}
        </div>
      </div>
      <div className="search-results">
        {shown?.files.map((file) => (
          <FileResults
            key={file.path}
            file={file}
            open={!collapsed.has(file.path)}
            selected={selected?.path === file.path ? selected : null}
            preview={preview}
            onToggle={() => toggle(file.path)}
            onOpen={(m) => onOpen(file.path, m)}
          />
        ))}
      </div>
    </div>
  )
}

interface FileProps {
  file: SearchFile
  open: boolean
  selected: { line: number; column: number } | null
  preview: Preview | null
  onToggle: () => void
  onOpen: (match: SearchMatch) => void
}

function FileResults(props: FileProps): React.JSX.Element {
  const { file, open, selected, preview, onToggle, onOpen } = props
  const slash = file.path.lastIndexOf('/')
  const dir = slash >= 0 ? file.path.slice(0, slash) : ''
  const name = file.path.slice(slash + 1)
  return (
    <>
      <div className="tree-item search-file" title={file.path} onClick={onToggle}>
        <ChevronRight size={16} className={open ? 'tree-arrow open' : 'tree-arrow'} />
        <FileIcon name={name} />
        <span className="tree-name">{name}</span>
        <span className="search-dir">{dir}</span>
        <span className="search-count">{file.matches.length}</span>
      </div>
      {open &&
        file.matches.map((m, i) => (
          <div
            key={i}
            className={
              selected && selected.line === m.line && selected.column === m.column
                ? 'tree-item search-match selected'
                : 'tree-item search-match'
            }
            title={`Line ${m.line}`}
            onClick={() => onOpen(m)}
          >
            <Excerpt match={m} preview={preview} />
          </div>
        ))}
    </>
  )
}

// The matched words with a little of the line around them; while replacing, what they
// turn into follows them.
function Excerpt(props: { match: SearchMatch; preview: Preview | null }): React.JSX.Element {
  const { match, preview } = props
  const start = Math.max(0, match.column - context)
  const lead = start > 0 ? '…' : ''
  const before = match.text.slice(start, match.column).trimStart()
  const hit = match.text.slice(match.column, match.column + match.length)
  const after = match.text.slice(match.column + match.length)
  const next = preview ? substitute(hit, preview.query, preview.options, preview.replacement) : null
  return (
    <span className="search-text">
      {lead}
      {before}
      <mark className={next === null ? undefined : 'del'}>{hit}</mark>
      {next !== null && next !== '' && <mark className="ins">{next}</mark>}
      {after}
    </span>
  )
}
