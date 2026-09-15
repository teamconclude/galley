import { app, net } from 'electron'
import { ChildProcess, execFile, spawn } from 'child_process'
import { existsSync, promises as fs } from 'fs'
import { join } from 'path'
import type { HugoStatus } from '../shared/types'
import { resolveCommand } from './shell'

// Pinned so every editor previews with the same Hugo; CI builds with the latest release.
const hugoVersion = '0.165.0'

const ownHugo = (): string => join(app.getPath('userData'), 'hugo', hugoVersion, 'hugo')

// The checkout's own binary first, then whatever the login shell has (Homebrew), then the
// copy Galley downloaded.
export async function findHugo(repo: string): Promise<string | null> {
  const local = join(repo, 'bin', 'hugo')
  if (existsSync(local)) return local
  const onPath = await resolveCommand('hugo')
  if (onPath) return onPath
  return existsSync(ownHugo()) ? ownHugo() : null
}

// Hugo ships macOS builds only as a .pkg; pkgutil unpacks it without installing.
async function downloadHugo(progress: (percent: number) => void): Promise<string> {
  const asset = `hugo_extended_${hugoVersion}_darwin-universal.pkg`
  const url = `https://github.com/gohugoio/hugo/releases/download/v${hugoVersion}/${asset}`
  const tmp = await fs.mkdtemp(join(app.getPath('temp'), 'galley-hugo-'))
  try {
    const res = await net.fetch(url)
    if (!res.ok || !res.body)
      throw new Error(`Hugo download failed: ${res.status} ${res.statusText}`)
    const total = Number(res.headers.get('content-length'))
    const chunks: Buffer[] = []
    let received = 0
    let reported = -1
    for await (const chunk of res.body) {
      chunks.push(Buffer.from(chunk))
      received += chunk.length
      const percent = total ? Math.floor((received / total) * 100) : 0
      if (percent !== reported) progress((reported = percent))
    }
    const pkg = join(tmp, asset)
    await fs.writeFile(pkg, Buffer.concat(chunks))
    await run('pkgutil', ['--expand-full', pkg, join(tmp, 'pkg')])
    const found = await run('find', [join(tmp, 'pkg'), '-type', 'f', '-name', 'hugo'])
    const bin = found.trim().split('\n')[0]
    if (!bin) throw new Error('The Hugo package holds no hugo binary')
    const dest = ownHugo()
    await fs.mkdir(join(dest, '..'), { recursive: true })
    await fs.copyFile(bin, dest)
    await fs.chmod(dest, 0o755)
    return dest
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message))
      else resolve(stdout)
    })
  })
}

export class HugoServer {
  private proc: ChildProcess | null = null
  status: HugoStatus = { state: 'stopped' }

  constructor(private onStatus: (status: HugoStatus) => void) {}

  async start(repo: string): Promise<void> {
    this.stop()
    const bin = await findHugo(repo)
    if (!bin) {
      this.set({ state: 'error', message: 'Hugo is not installed.', missing: true })
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

  async install(repo: string): Promise<void> {
    this.stop()
    this.set({ state: 'starting', message: `Downloading Hugo ${hugoVersion}…` })
    try {
      await downloadHugo((percent) =>
        this.set({ state: 'starting', message: `Downloading Hugo ${hugoVersion}… ${percent}%` })
      )
    } catch (err) {
      this.set({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
        missing: true
      })
      return
    }
    await this.start(repo)
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
