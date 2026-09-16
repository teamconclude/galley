import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

interface Props {
  repoPath: string
}

// VS Code's light terminal palette: every ANSI colour stays readable on white.
const lightTheme = {
  background: '#ffffff',
  foreground: '#1f1f1f',
  cursor: '#1f1f1f',
  cursorAccent: '#ffffff',
  selectionBackground: 'rgba(0, 0, 0, 0.15)',
  black: '#000000',
  red: '#cd3131',
  green: '#107c10',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5'
}

export default function ClaudePane({ repoPath }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    const el = host.current!
    const term = new Terminal({
      fontFamily: 'Menlo, Monaco, monospace',
      fontSize: 13,
      cursorBlink: true,
      macOptionIsMeta: true,
      theme: lightTheme
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    window.api.terminal.start(term.cols, term.rows)
    const offData = window.api.terminal.onData((data) => term.write(data))
    const offExit = window.api.terminal.onExit((code) => setExitCode(code))
    const input = term.onData((data) => window.api.terminal.write(data))
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === 0 || el.clientHeight === 0) return
      const before = `${term.cols}x${term.rows}`
      fit.fit()
      if (`${term.cols}x${term.rows}` !== before) window.api.terminal.resize(term.cols, term.rows)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      input.dispose()
      offData()
      offExit()
      term.dispose()
      window.api.terminal.kill()
    }
  }, [repoPath, generation])

  const restart = (): void => {
    setExitCode(null)
    setGeneration((g) => g + 1)
  }

  return (
    <div className="claude">
      <div className="pane-bar">
        <span className="pane-title">Claude</span>
        <button onClick={restart}>Restart</button>
      </div>
      <div className="terminal-host" ref={host} />
      {exitCode !== null && (
        <div className="terminal-exited">
          Claude exited (code {exitCode}). <button onClick={restart}>Start again</button>
        </div>
      )}
    </div>
  )
}
