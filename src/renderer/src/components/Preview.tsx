import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { HugoStatus, PreviewMode, PreviewTarget } from '../../../shared/types'
import type { WebviewElement } from '../env'
import { previewScript } from '../../../shared/previewScript'
import { onShow } from '../lib/previewScroll'

interface Props {
  status: HugoStatus
  url: string | null
  reloadKey: number
  onDetach: () => void
  mode: PreviewMode
  onMode: (mode: PreviewMode) => void
  // The open file's text; a change means the server is about to render anew.
  content: string
}

// A page's markdown twin lives at its URL plus index.html.md; llms.txt is text as it is.
function textUrlFor(url: string): string {
  return url.endsWith('.txt') ? url : url.replace(/\/?$/, '/') + 'index.html.md'
}

export default function Preview(props: Props): React.JSX.Element {
  const { status, url, reloadKey, onDetach, mode, onMode, content } = props
  const view = useRef<WebviewElement>(null)
  const plainFile = url?.endsWith('.txt') ?? false
  const textMode = plainFile || mode === 'markdown'
  const shownUrl = url && textMode ? textUrlFor(url) : url

  useEffect(() => {
    if (reloadKey) view.current?.reload()
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
      onShow((target) => {
        pending.current = target
        run(target)
      }),
    []
  )
  useEffect(() => {
    const el = view.current
    if (!el) return
    const onLoad = (): void => {
      if (pending.current) run(pending.current)
    }
    el.addEventListener('did-finish-load', onLoad)
    return () => el.removeEventListener('did-finish-load', onLoad)
  }, [url])

  return (
    <div className="preview">
      <div className="pane-bar">
        <span className={`dot ${status.state}`} />
        <span className="pane-title">{shownUrl ?? statusText(status)}</span>
        {url && !plainFile && (
          <span className="segmented" title="The page as rendered, or its markdown for LLMs">
            <button className={mode === 'html' ? 'on' : ''} onClick={() => onMode('html')}>
              HTML
            </button>
            <button className={mode === 'markdown' ? 'on' : ''} onClick={() => onMode('markdown')}>
              Markdown
            </button>
          </span>
        )}
        {url && !textMode && <button onClick={() => view.current?.reload()}>Reload</button>}
        {shownUrl && (
          <button onClick={() => window.api.openExternal(shownUrl)}>Open in browser</button>
        )}
        {url && !textMode && (
          <button onClick={onDetach} title="Move the preview into its own window">
            Separate window
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
      {shownUrl && textMode ? (
        <TextPreview url={shownUrl} content={content} reloadKey={reloadKey} />
      ) : url ? (
        <webview ref={view} src={url} className="webview" />
      ) : (
        <pre className="pane-empty">{status.message ?? statusText(status)}</pre>
      )}
    </div>
  )
}

// The text the server serves at a URL, fetched again a moment after the file changes and
// once more when Hugo has surely rebuilt.
function TextPreview(props: {
  url: string
  content: string
  reloadKey: number
}): React.JSX.Element {
  const { url, content, reloadKey } = props
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
  }, [url, content, reloadKey])
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
