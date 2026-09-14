import { ChildProcess, execFile, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import type { HugoStatus } from '../shared/types'
import { resolveCommand } from './shell'

export async function findHugo(repo: string): Promise<string | null> {
  const local = join(repo, 'bin', 'hugo')
  return existsSync(local) ? local : resolveCommand('hugo')
}

export class HugoServer {
  private proc: ChildProcess | null = null
  status: HugoStatus = { state: 'stopped' }

  constructor(private onStatus: (status: HugoStatus) => void) {}

  async start(repo: string): Promise<void> {
    this.stop()
    const bin = await findHugo(repo)
    if (!bin) {
      this.set({
        state: 'error',
        message: 'Hugo not found. Run scripts/setup in the site checkout.'
      })
      return
    }
    this.set({ state: 'starting' })
    const proc = spawn(bin, ['server', '-D'], { cwd: repo })
    this.proc = proc
    let output = ''
    const onOutput = (chunk: Buffer): void => {
      if (this.proc !== proc) return
      output = (output + chunk.toString()).slice(-4000)
      // Hugo prints "//localhost:1313/" when the configured baseURL has no scheme.
      const m = output.match(/available at (?:https?:)?(\/\/[^\s/]+)/)
      if (m && this.status.state !== 'running') this.set({ state: 'running', url: `http:${m[1]}` })
    }
    proc.stdout?.on('data', onOutput)
    proc.stderr?.on('data', onOutput)
    proc.on('exit', (code) => {
      if (this.proc !== proc) return
      this.proc = null
      const tail = output.trim().split('\n').slice(-3).join('\n')
      this.set({ state: 'error', message: `Hugo exited (code ${code}).\n${tail}` })
    })
    proc.on('error', (err) => {
      if (this.proc !== proc) return
      this.proc = null
      this.set({ state: 'error', message: err.message })
    })
  }

  stop(): void {
    const proc = this.proc
    this.proc = null
    proc?.kill()
    if (proc) this.set({ state: 'stopped' })
  }

  private set(status: HugoStatus): void {
    this.status = status
    this.onStatus(status)
  }
}

// Maps content file paths to their URL paths, from `hugo list all`.
export function listPages(bin: string, repo: string): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    const opts = { cwd: repo, maxBuffer: 16 * 1024 * 1024 }
    execFile(bin, ['list', 'all'], opts, (err, stdout) => {
      const map = new Map<string, string>()
      if (err) return resolve(map)
      const [header, ...rows] = stdout.split('\n')
      const cols = parseCsvLine(header)
      const pathCol = cols.indexOf('path')
      const urlCol = cols.indexOf('permalink')
      if (pathCol < 0 || urlCol < 0) return resolve(map)
      for (const row of rows) {
        const f = parseCsvLine(row)
        if (f[pathCol] && f[urlCol]) map.set(f[pathCol], f[urlCol].replace(/^https?:\/\/[^/]+/, ''))
      }
      resolve(map)
    })
  })
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}
