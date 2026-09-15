import { useEffect, useRef } from 'react'
import type { HugoStatus } from '../../../shared/types'
import type { WebviewElement } from '../env'

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
