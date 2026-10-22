import * as pty from 'node-pty'
import { shellQuote } from './claude'
import { claudeProcess } from './tools'

export class ClaudeTerminal {
  private proc: pty.IPty | null = null
  // The pane's latest size, kept while Claude is still being started so it begins with
  // the size the pane has by then rather than the one it asked with.
  private size = { cols: 80, rows: 24 }

  constructor(
    private onData: (data: string) => void,
    private onExit: (code: number) => void
  ) {}

  async start(cwd: string, args: string[] = []): Promise<void> {
    this.kill()
    const { bin, env, path } = await claudeProcess()
    env.TERM = 'xterm-256color'
    env.COLORTERM = 'truecolor'
    // The pane is white on white; Claude Code reads this to pick its light theme.
    env.COLORFGBG = '0;15'
    const command = `export PATH="${path.join(':')}:$PATH"; exec ${[bin ? shellQuote(bin) : 'claude', ...args.map(shellQuote)].join(' ')}`
    // The login shell supplies the user's PATH, which a GUI app does not inherit.
    const proc = pty.spawn('/bin/zsh', ['-lc', command], {
      name: 'xterm-256color',
      cols: Math.max(this.size.cols, 2),
      rows: Math.max(this.size.rows, 1),
      cwd,
      env
    })
    this.proc = proc
    proc.onData((data) => {
      if (this.proc === proc) this.onData(data)
    })
    proc.onExit(({ exitCode }) => {
      if (this.proc !== proc) return
      this.proc = null
      this.onExit(exitCode)
    })
  }

  write(data: string): void {
    this.proc?.write(data)
  }

  resize(cols: number, rows: number): void {
    if (cols < 2 || rows < 1) return
    this.size = { cols, rows }
    this.proc?.resize(cols, rows)
  }

  kill(): void {
    const proc = this.proc
    this.proc = null
    proc?.kill()
  }
}
