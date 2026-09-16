import { useEffect, useRef } from 'react'
import type { HugoStatus, PreviewTarget } from '../../../shared/types'
import type { WebviewElement } from '../env'
import { previewScript } from '../../../shared/previewScript'
import { onShow } from '../lib/previewScroll'

interface Props {
  status: HugoStatus
  url: string | null
  reloadKey: number
  onDetach: () => void
}

export default function Preview({ status, url, reloadKey, onDetach }: Props): React.JSX.Element {
  const view = useRef<WebviewElement>(null)

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
        <span className="pane-title">{url ?? statusText(status)}</span>
        {url && <button onClick={() => view.current?.reload()}>Reload</button>}
        {url && <button onClick={() => window.api.openExternal(url)}>Open in browser</button>}
        {url && (
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
      {url ? (
        <webview ref={view} src={url} className="webview" />
      ) : (
        <pre className="pane-empty">{status.message ?? statusText(status)}</pre>
      )}
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
