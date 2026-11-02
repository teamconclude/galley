import { Component, useEffect, useRef, useState, type ErrorInfo } from 'react'
import { reportError } from '../lib/errors'
import { closeAllToolWindows } from '../lib/toolWindows'

interface GuardState {
  failed: boolean
}

// An error while drawing the page would otherwise leave the window blank. It is logged,
// with where in the page it happened, and the page says what happened instead.
export class CrashGuard extends Component<{ children: React.ReactNode }, GuardState> {
  state: GuardState = { failed: false }

  static getDerivedStateFromError(): GuardState {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportError(error, info.componentStack ?? '')
    closeAllToolWindows()
  }

  render(): React.ReactNode {
    return this.state.failed ? <Crashed /> : this.props.children
  }
}

// What a window that failed shows: that it did, a way back, and the end of Galley's log
// to copy into a message to support. It is also the page at #crashed, which the main
// process loads when the window's process died.
export function Crashed(): React.JSX.Element {
  const [log, setLog] = useState<{ path: string; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    void window.api.log
      .read()
      .then(setLog)
      .catch(() => setLog({ path: '', text: '' }))
  }, [])
  // The newest lines, about what just happened, are at the end.
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [log])
  const copy = (): void => {
    if (!log) return
    void navigator.clipboard.writeText(log.text).then(() => setCopied(true))
  }
  // Without the hash, should the page be #crashed.
  const reload = (): void => window.location.replace(window.location.href.replace(/#.*$/, ''))

  return (
    <div className="crashed">
      <div className="crashed-bar" />
      <div className="crashed-body">
        <h1>Something went wrong</h1>
        <p>
          Galley ran into a problem and stopped showing your site. Pages are saved as you type, so
          at most what you typed in the last moment may be missing. Reload to carry on.
        </p>
        <p>
          If it happens again, copy the log below and send it to whoever looks after Galley for you.
          It says what went wrong.
        </p>
        <div className="crashed-actions">
          <button className="primary" onClick={reload}>
            Reload
          </button>
          <button onClick={copy} disabled={!log?.text}>
            {copied ? 'Copied' : 'Copy log'}
          </button>
        </div>
        <textarea
          ref={box}
          className="crashed-log"
          readOnly
          spellCheck={false}
          value={log ? log.text || 'The log is empty.' : 'Reading the log…'}
        />
        {log?.path && <div className="crashed-path">{log.path}</div>}
      </div>
    </div>
  )
}
