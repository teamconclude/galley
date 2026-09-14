import { useEffect, useRef, useState } from 'react'
import type { HugoStatus } from '../../../shared/types'
import type { WebviewElement } from '../env'

interface Props {
  status: HugoStatus
  path: string | null
  reloadKey: number
}

export default function Preview({ status, path, reloadKey }: Props): React.JSX.Element {
  const [pagePath, setPagePath] = useState('/')
  const view = useRef<WebviewElement>(null)

  useEffect(() => {
    if (!path) return
    let live = true
    void window.api.repo.pageUrl(path).then((url) => {
      if (live && url) setPagePath(url)
    })
    return () => {
      live = false
    }
  }, [path])

  useEffect(() => {
    if (reloadKey) view.current?.reload()
  }, [reloadKey])

  const url = status.state === 'running' && status.url ? status.url + pagePath : null
  return (
    <div className="preview">
      <div className="pane-bar">
        <span className={`dot ${status.state}`} />
        <span className="pane-title">{url ?? statusText(status)}</span>
        {url && <button onClick={() => view.current?.reload()}>Reload</button>}
        {url && <button onClick={() => window.api.openExternal(url)}>Open in browser</button>}
        {status.state === 'error' && (
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
