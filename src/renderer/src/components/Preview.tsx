import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { DropSpot, HugoStatus, PreviewMode, PreviewTarget } from '../../../shared/types'
import type { WebviewElement } from '../env'
import { dropMarkScript, dropSpotScript, previewScript } from '../../../shared/previewScript'

interface Props {
  status: HugoStatus
  url: string | null
  reloadKey: number
  mode: PreviewMode
  onMode: (mode: PreviewMode) => void
  // Changes whenever the open file's text does.
  version: number
  // The site's markdown rendition suffix; without one there is no Markdown mode.
  markdownSuffix: string | null
  // Shown in the preview's own window: the last button brings it back.
  detached: boolean
  onDetach: () => void
  onAttach: () => void
  // Where scroll targets come from: the store in this window, or IPC in the detached one.
  targets: (cb: (target: PreviewTarget) => void) => () => void
  // Shown instead of the page, e.g. while conflicts keep Hugo from building it.
  notice?: string | null
  // While a picture from the file list is dragged; see ImageDrop.
  imageDrop?: ImageDrop | null
}

// Judges what dropping the dragged picture at a spot would do, in words for the editor,
// and makes the drop.
export interface ImageDrop {
  judge: (spot: DropSpot) => { ok: boolean; hint: string }
  drop: (spot: DropSpot) => void
  // The drag is over, in case it ended without saying so.
  end: () => void
}

// A page's markdown rendition lives at its URL plus the suffix; a .txt is text as it is.
function textUrlFor(url: string, suffix: string | null): string {
  return url.endsWith('.txt') || !suffix ? url : url.replace(/\/?$/, '/') + suffix
}

const isPlainFile = (url: string | null): boolean => url?.endsWith('.txt') ?? false

export default function Preview(props: Props): React.JSX.Element {
  const { status, url, reloadKey, mode, onMode, version, detached, markdownSuffix } = props
  const { onDetach, onAttach, targets, notice, imageDrop } = props
  const plainFile = isPlainFile(url)
  const textMode = plainFile || (mode === 'markdown' && markdownSuffix !== null)
  const shownUrl = url && textMode ? textUrlFor(url, markdownSuffix) : url
  const [reloads, setReloads] = useState(0)

  return (
    <div className="preview">
      <div className="pane-bar">
        <span className={`dot ${status.state}`} />
        <span className="pane-title">{shownUrl ?? statusText(status)}</span>
        {url && !plainFile && markdownSuffix !== null && (
          <span className="segmented" title="The page as rendered, or its markdown for LLMs">
            <button className={mode === 'html' ? 'on' : ''} onClick={() => onMode('html')}>
              HTML
            </button>
            <button className={mode === 'markdown' ? 'on' : ''} onClick={() => onMode('markdown')}>
              Markdown
            </button>
          </span>
        )}
        {url && <button onClick={() => setReloads((n) => n + 1)}>Reload</button>}
        {shownUrl && (
          <button onClick={() => window.api.openExternal(shownUrl)}>Open in browser</button>
        )}
        {url && !detached && (
          <button onClick={onDetach} title="Move the preview into its own window">
            Separate window
          </button>
        )}
        {detached && (
          <button onClick={onAttach} title="Bring the preview back into the main window">
            Back into main window
          </button>
        )}
        {status.state === 'error' && status.missing && (
          <button className="primary" onClick={() => void window.api.hugo.install()}>
            Install Hugo
          </button>
        )}
        {status.state === 'error' && !status.missing && (
          <button onClick={() => void window.api.hugo.restart()}>Restart Hugo</button>
        )}
      </div>
      <PreviewContent
        url={url}
        mode={mode}
        version={version}
        markdownSuffix={markdownSuffix}
        reloadKey={reloadKey + reloads}
        targets={targets}
        empty={status.message ?? statusText(status)}
        notice={notice ?? null}
        imageDrop={imageDrop ?? null}
      />
    </div>
  )
}

interface ContentProps {
  url: string | null
  mode: PreviewMode
  version: number
  reloadKey: number
  markdownSuffix: string | null
  // Where scroll targets come from: the store in this window, or IPC in the detached one.
  targets: (cb: (target: PreviewTarget) => void) => () => void
  empty: string
  notice: string | null
  imageDrop?: ImageDrop | null
}

// The page in a webview, or its text rendered; shared by the pane and the detached window.
export function PreviewContent(props: ContentProps): React.JSX.Element {
  const { url, mode, version, reloadKey, targets, empty, markdownSuffix, notice, imageDrop } = props
  const view = useRef<WebviewElement>(null)
  const textMode = isPlainFile(url) || (mode === 'markdown' && markdownSuffix !== null)
  const shownUrl = url && textMode ? textUrlFor(url, markdownSuffix) : url

  // Pictures too, e.g. one replaced under its own name.
  useEffect(() => {
    if (reloadKey) view.current?.reloadIgnoringCache()
  }, [reloadKey])

  // A target stays pending until the page has found it, so one asked for while Hugo is
  // still starting or the page is still loading is applied once the page has loaded.
  const pending = useRef<PreviewTarget | null>(null)
  const run = (target: PreviewTarget): void => {
    void view.current
      ?.executeJavaScript(previewScript(target))
      .then((found) => {
        if (found === true && pending.current === target) pending.current = null
      })
      .catch(() => {})
  }
  useEffect(
    () =>
      targets((target) => {
        pending.current = target
        run(target)
      }),
    [targets]
  )
  useEffect(() => {
    const el = view.current
    if (!el) return
    const onLoad = (): void => {
      if (pending.current) run(pending.current)
    }
    el.addEventListener('did-finish-load', onLoad)
    return () => el.removeEventListener('did-finish-load', onLoad)
  }, [url, textMode])

  if (notice) return <div className="pane-empty">{notice}</div>
  if (shownUrl && textMode) {
    return <TextPreview url={shownUrl} version={version} reloadKey={reloadKey} />
  }
  if (url) {
    return (
      <div className="preview-stage">
        <webview ref={view} src={url} className="webview" />
        {imageDrop && <DropLayer view={view} imageDrop={imageDrop} />}
      </div>
    )
  }
  return <pre className="pane-empty">{empty}</pre>
}

// Lies over the page while a picture is dragged, since the webview would take the drag
// events itself. The page is asked what lies under the pointer, one question at a time,
// and marks where the picture would go. Mouse events arrive only once no drag is going
// on, so one ends the layer should the drag have ended unnoticed.
function DropLayer(props: {
  view: React.RefObject<WebviewElement | null>
  imageDrop: ImageDrop
}): React.JSX.Element {
  const { view, imageDrop } = props
  const [hint, setHint] = useState<{ ok: boolean; hint: string } | null>(null)
  const spot = useRef<DropSpot | null>(null)
  const busy = useRef(false)
  const next = useRef<{ x: number; y: number } | null>(null)
  const judge = useRef(imageDrop.judge)
  useEffect(() => {
    judge.current = imageDrop.judge
  })

  const mark = (shown: DropSpot | null): void => {
    void view.current?.executeJavaScript(dropMarkScript(shown)).catch(() => {})
  }
  const ask = (x: number, y: number): void => {
    if (busy.current) {
      next.current = { x, y }
      return
    }
    busy.current = true
    void view.current
      ?.executeJavaScript(dropSpotScript(x, y))
      .then((found) => {
        const at = found as DropSpot
        const verdict = judge.current(at)
        spot.current = verdict.ok ? at : null
        setHint(verdict)
        mark(spot.current)
      })
      .catch(() => {})
      .finally(() => {
        busy.current = false
        const queued = next.current
        next.current = null
        if (queued) ask(queued.x, queued.y)
      })
  }
  // The mark goes when the drag ends anywhere else.
  useEffect(() => {
    const page = view.current
    return () => void page?.executeJavaScript(dropMarkScript(null)).catch(() => {})
  }, [view])

  return (
    <div
      className="preview-drop"
      onMouseMove={imageDrop.end}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = spot.current ? 'copy' : 'none'
        const r = e.currentTarget.getBoundingClientRect()
        ask(Math.round(e.clientX - r.left), Math.round(e.clientY - r.top))
      }}
      onDragLeave={() => {
        spot.current = null
        setHint(null)
        mark(null)
      }}
      onDrop={(e) => {
        e.preventDefault()
        const at = spot.current
        spot.current = null
        setHint(null)
        mark(null)
        if (at) imageDrop.drop(at)
      }}
    >
      {hint && (
        <span className={'preview-drop-hint' + (hint.ok ? '' : ' refused')}>{hint.hint}</span>
      )}
    </div>
  )
}

// The text the server serves at a URL, fetched again a moment after the file changes and
// once more when Hugo has surely rebuilt.
function TextPreview(props: {
  url: string
  version: number
  reloadKey: number
}): React.JSX.Element {
  const { url, version, reloadKey } = props
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shownUrl = useRef<string | null>(null)
  useEffect(() => {
    let live = true
    const load = (): void => {
      window.api.preview
        .fetchText(url)
        .then((t) => {
          if (!live) return
          setText(t)
          setError(null)
        })
        .catch((e: unknown) => {
          if (!live) return
          const message = e instanceof Error ? e.message : String(e)
          setError(
            /404/.test(message)
              ? 'The server has no text version of this page.'
              : `Could not load the text version (${message.replace(/^.*: /, '')}).`
          )
        })
    }
    const fresh = shownUrl.current !== url
    shownUrl.current = url
    const timers = fresh
      ? [window.setTimeout(load, 0)]
      : [window.setTimeout(load, 1500), window.setTimeout(load, 4000)]
    return () => {
      live = false
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [url, version, reloadKey])
  if (error) return <div className="pane-empty">{error}</div>
  if (text === null) return <div className="pane-empty">Loading…</div>
  return <RenderedMarkdown text={text} base={new URL(url).origin} />
}

// The markdown as a reader would see it, GitHub flavoured. Links open in the browser,
// site-relative ones on the preview server, whose images are also shown.
function RenderedMarkdown({ text, base }: { text: string; base: string }): React.JSX.Element {
  const resolve = (href: string): string => (href.startsWith('/') ? base + href : href)
  return (
    <div className="text-preview">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href) window.api.openExternal(resolve(href))
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img src={typeof src === 'string' ? resolve(src) : undefined} alt={alt ?? ''} />
          )
        }}
      >
        {text}
      </Markdown>
    </div>
  )
}

function statusText(status: HugoStatus): string {
  switch (status.state) {
    case 'running':
      return 'Preview running'
    case 'starting':
      return 'Starting the preview server…'
    case 'error':
      return 'The preview server failed'
    default:
      return 'Preview server stopped'
  }
}
