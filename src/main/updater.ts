import { app, dialog, net } from 'electron'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { constants, createWriteStream, promises as fs } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { parse as parseYaml } from 'yaml'
import type { UpdateStatus } from '../shared/types'
import { isDev } from './env'

const repoUrl = 'https://github.com/teamconclude/galley'
const feed = process.env['GALLEY_UPDATE_FEED']
const checkInterval = 6 * 60 * 60 * 1000

interface Manifest {
  version: string
  files: { url: string; sha512: string; size?: number }[]
}

interface Found {
  version: string
  url: string
  sha512: string
  size: number
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// True when `a` is a higher release number than `b`.
export function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

// Downloads new releases from GitHub and swaps the running bundle for the new one. Nothing
// here depends on a Developer ID: the download carries no quarantine flag, and the zip is
// checked against the SHA-512 in the release manifest instead of a signature.
export class Updater {
  status: UpdateStatus = { state: 'idle' }
  private found: Found | null = null
  private staged: { dir: string; bundle: string } | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(private notify: (status: UpdateStatus) => void) {}

  start(): void {
    if (isDev) return
    setTimeout(() => void this.check(false), 3000)
    this.timer = setInterval(() => void this.check(false), checkInterval)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.notify(status)
  }

  // An interactive check, from the menu, reports "up to date" and failures in a dialog.
  async check(interactive: boolean): Promise<void> {
    if (this.status.state === 'downloading' || this.status.state === 'ready') return
    this.set({ state: 'checking' })
    try {
      const found = await this.latest()
      if (!found) {
        this.set({ state: 'idle' })
        if (interactive) {
          void dialog.showMessageBox({
            message: 'Galley is up to date',
            detail: `Version ${app.getVersion()} is the newest release.`
          })
        }
        return
      }
      this.found = found
      const problem = await this.cannotInstall()
      if (problem) {
        this.set({
          state: 'manual',
          version: found.version,
          url: `${repoUrl}/releases/latest`,
          problem
        })
      } else {
        this.set({ state: 'available', version: found.version })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.set({ state: 'error', message })
      if (interactive) dialog.showErrorBox('Could not check for updates', message)
    }
  }

  private async latest(): Promise<Found | null> {
    const base = feed ?? `${repoUrl}/releases/latest/download`
    const res = await net.fetch(`${base}/latest-mac.yml`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Release manifest: ${res.status} ${res.statusText}`)
    const manifest: unknown = parseYaml(await res.text())
    if (
      !isRecord(manifest) ||
      typeof manifest.version !== 'string' ||
      !Array.isArray(manifest.files)
    ) {
      throw new Error('Release manifest is malformed')
    }
    const { version, files } = manifest as unknown as Manifest
    if (!isNewer(version, app.getVersion())) return null
    const wantArm = process.arch === 'arm64'
    const file = files.find((f) => f.url.endsWith('.zip') && f.url.includes('arm64') === wantArm)
    if (!file) throw new Error(`Release ${version} has no build for this Mac`)
    const assets = feed ?? `${repoUrl}/releases/download/v${version}`
    return { version, url: `${assets}/${file.url}`, sha512: file.sha512, size: file.size ?? 0 }
  }

  // The bundle must be replaceable in place: not the randomised copy macOS runs a
  // quarantined app from, and in a folder the user can write to.
  private async cannotInstall(): Promise<string | null> {
    const bundle = this.bundlePath()
    if (!bundle) return 'Galley is not running from an app bundle'
    if (bundle.includes('/AppTranslocation/')) return 'Move Galley to the Applications folder first'
    try {
      await fs.access(dirname(bundle), constants.W_OK)
      return null
    } catch {
      return `The folder ${dirname(bundle)} is not writable`
    }
  }

  private bundlePath(): string | null {
    const bundle = resolve(app.getPath('exe'), '..', '..', '..')
    return bundle.endsWith('.app') ? bundle : null
  }

  async download(): Promise<void> {
    const found = this.found
    if (!found || this.status.state !== 'available') return
    this.set({ state: 'downloading', version: found.version, percent: 0 })
    const dir = join(app.getPath('temp'), `galley-update-${found.version}`)
    try {
      await fs.rm(dir, { recursive: true, force: true })
      await fs.mkdir(dir, { recursive: true })
      const zip = join(dir, basename(found.url))
      await this.fetchTo(found, zip)
      await run('ditto', ['-x', '-k', zip, join(dir, 'unpacked')])
      const bundle = join(dir, 'unpacked', 'Galley.app')
      await fs.access(join(bundle, 'Contents', 'Info.plist'))
      this.staged = { dir, bundle }
      this.set({ state: 'ready', version: found.version })
    } catch (err) {
      await fs.rm(dir, { recursive: true, force: true })
      this.set({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async fetchTo(found: Found, path: string): Promise<void> {
    const res = await net.fetch(found.url)
    if (!res.ok || !res.body) throw new Error(`Download: ${res.status} ${res.statusText}`)
    const total = Number(res.headers.get('content-length')) || found.size
    const hash = createHash('sha512')
    const out = createWriteStream(path)
    let received = 0
    let lastPercent = -1
    for await (const chunk of res.body) {
      hash.update(chunk)
      received += chunk.length
      if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()))
      const percent = total ? Math.floor((received / total) * 100) : 0
      if (percent !== lastPercent) {
        lastPercent = percent
        this.set({ state: 'downloading', version: found.version, percent })
      }
    }
    await new Promise<void>((r, j) => out.end((e: Error | null | undefined) => (e ? j(e) : r())))
    if (hash.digest('base64') !== found.sha512)
      throw new Error('The download did not match the release checksum')
  }

  // A detached shell waits for this process to exit, swaps the bundles and starts the new
  // one; moving the running bundle from under Electron is not safe.
  install(): void {
    const bundle = this.bundlePath()
    if (!this.staged || !bundle) return
    const script = [
      'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done',
      'old="$2.old"; rm -rf "$old"',
      'if mv "$2" "$old" && mv "$3" "$2"; then rm -rf "$old"; else [ -d "$2" ] || mv "$old" "$2"; fi',
      'rm -rf "$4"',
      'open "$2"'
    ].join('\n')
    const child = spawn(
      '/bin/sh',
      ['-c', script, 'sh', String(process.pid), bundle, this.staged.bundle, this.staged.dir],
      {
        detached: true,
        stdio: 'ignore'
      }
    )
    child.unref()
    app.quit()
  }
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr.on('data', (d: Buffer) => (err += d.toString()))
    proc.on('error', reject)
    proc.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(err.trim() || `${cmd} failed`))
    )
  })
}
