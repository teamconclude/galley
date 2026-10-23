import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { setClaudeInput, useFileDrop } from '../lib/claude'

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

// VS Code's dark terminal palette, on the window's own dark background.
const darkTheme = {
  background: '#1a1a1a',
  foreground: '#cccccc',
  cursor: '#cccccc',
  cursorAccent: '#1a1a1a',
  selectionBackground: 'rgba(255, 255, 255, 0.2)',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5'
}

const dark = window.matchMedia('(prefers-color-scheme: dark)')
const theme = (): typeof lightTheme => (dark.matches ? darkTheme : lightTheme)

interface ViewProps {
  // Claude Code's sign-in instead of Claude Code itself.
  login?: boolean
  onExit: (code: number) => void
  // The running terminal, and null once it is gone.
  onTerminal?: (term: Terminal | null) => void
}

// Claude Code's own screen. A new key starts it afresh.
export function TerminalView({ login, onExit, onTerminal }: ViewProps): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const exited = useEffectEvent(onExit)
  const report = useEffectEvent((term: Terminal | null) => onTerminal?.(term))

  useEffect(() => {
    const el = host.current!
    const term = new Terminal({
      fontFamily: 'Menlo, Monaco, monospace',
      fontSize: 13,
      cursorBlink: true,
      macOptionIsMeta: true,
      theme: theme()
    })
    const recolour = (): void => {
      term.options.theme = theme()
    }
    dark.addEventListener('change', recolour)
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    report(term)
    fit.fit()
    window.api.terminal.start(term.cols, term.rows, login)
    const offData = window.api.terminal.onData((data) => term.write(data))
    const offExit = window.api.terminal.onExit((code) => exited(code))
    const input = term.onData((data) => window.api.terminal.write(data))
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === 0 || el.clientHeight === 0) return
      const before = `${term.cols}x${term.rows}`
      fit.fit()
      if (`${term.cols}x${term.rows}` !== before) window.api.terminal.resize(term.cols, term.rows)
    })
    observer.observe(el)
    term.focus()
    return () => {
      dark.removeEventListener('change', recolour)
      observer.disconnect()
      input.dispose()
      offData()
      offExit()
      report(null)
      term.dispose()
      window.api.terminal.kill()
    }
  }, [login])

  return <div className="terminal-host" ref={host} />
}

// The pane as Claude Code's terminal, the way it was before the chat.
export default function ClaudeTerminal(): React.JSX.Element {
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [generation, setGeneration] = useState(0)
  const termRef = useRef<Terminal | null>(null)
  const withdraw = useRef<(() => void) | null>(null)

  const restart = (): void => {
    setExitCode(null)
    setGeneration((g) => g + 1)
  }

  // Dropped files' paths are pasted at the prompt as a paste, which is how Claude Code
  // recognises images.
  const { dropping, handlers } = useFileDrop((copies) => {
    termRef.current?.paste(copies.join(' ') + ' ')
    termRef.current?.focus()
  })

  // A request from elsewhere is pasted, which keeps several lines in one piece, and Enter
  // follows once Claude has taken it in.
  const onTerminal = (term: Terminal | null): void => {
    termRef.current = term
    withdraw.current?.()
    withdraw.current = term
      ? setClaudeInput((text) => {
          term.paste(text)
          window.setTimeout(() => window.api.terminal.write('\r'), 300)
          term.focus()
        })
      : null
  }

  return (
    <div className={'claude' + (dropping ? ' dropping' : '')} {...handlers}>
      <div className="pane-bar">
        <span className="pane-title">Claude</span>
        <button onClick={restart}>Restart</button>
      </div>
      <TerminalView key={generation} onExit={setExitCode} onTerminal={onTerminal} />
      {exitCode !== null && (
        <div className="terminal-exited">
          Claude exited (code {exitCode}). <button onClick={restart}>Start again</button>
        </div>
      )}
    </div>
  )
}
