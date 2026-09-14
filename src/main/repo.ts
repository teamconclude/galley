import { execFile } from 'child_process'
import { FSWatcher, existsSync, promises as fs, watch } from 'fs'
import { basename, join, resolve, sep } from 'path'
import type { DirEntry, RepoInfo } from '../shared/types'
import { findHugo, listPages } from './hugo'

const hiddenAtRoot = new Set(['node_modules', 'public', 'resources', 'bin'])
const ignoredChanges = /^(public|resources|node_modules|\.git)(\/|$)/

export class Repo {
  private watcher: FSWatcher | null = null
  private pages = new Map<string, string>()
  private pending = new Set<string>()
  private structureChanged = false
  private timer: NodeJS.Timeout | null = null

  constructor(
    readonly path: string,
    private onChange: (paths: string[]) => void
  ) {}

  static isSite(path: string): boolean {
    return existsSync(join(path, 'config', '_default', 'hugo.yaml'))
  }

  async info(): Promise<RepoInfo> {
    return { path: this.path, name: basename(this.path), branch: await this.branch() }
  }

  branch(): Promise<string> {
    return new Promise((res) => {
      const args = ['rev-parse', '--abbrev-ref', 'HEAD']
      execFile('git', args, { cwd: this.path }, (err, out) => res(err ? '' : out.trim()))
    })
  }

  absolute(rel: string): string {
    const abs = resolve(this.path, rel)
    if (abs !== this.path && !abs.startsWith(this.path + sep)) {
      throw new Error(`Path outside repository: ${rel}`)
    }
    return abs
  }

  async list(rel: string): Promise<DirEntry[]> {
    const entries = await fs.readdir(this.absolute(rel), { withFileTypes: true })
    return entries
      .filter((e) => !e.name.startsWith('.') && !(rel === '' && hiddenAtRoot.has(e.name)))
      .map((e) => ({
        name: e.name,
        path: rel ? `${rel}/${e.name}` : e.name,
        isDir: e.isDirectory()
      }))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
  }

  read(rel: string): Promise<string> {
    return fs.readFile(this.absolute(rel), 'utf8')
  }

  write(rel: string, text: string): Promise<void> {
    return fs.writeFile(this.absolute(rel), text)
  }

  async pageUrl(rel: string): Promise<string | null> {
    if (!rel.startsWith('content/')) return null
    if (this.pages.size === 0) await this.refreshPages()
    return this.pages.get(rel) ?? guessUrl(rel)
  }

  private async refreshPages(): Promise<void> {
    const bin = await findHugo(this.path)
    if (bin) this.pages = await listPages(bin, this.path)
  }

  watch(): void {
    this.watcher = watch(this.path, { recursive: true }, (event, file) => {
      const rel = file?.toString()
      if (!rel || ignoredChanges.test(rel)) return
      this.pending.add(rel)
      if (event === 'rename' && rel.startsWith('content/')) this.structureChanged = true
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => this.flush(), 300)
    })
  }

  private flush(): void {
    const paths = [...this.pending]
    this.pending.clear()
    if (this.structureChanged) {
      this.structureChanged = false
      void this.refreshPages()
    }
    this.onChange(paths)
  }

  close(): void {
    this.watcher?.close()
    this.watcher = null
  }
}

function guessUrl(rel: string): string {
  const path = rel
    .replace(/^content\//, '')
    .replace(/\.md$/, '')
    .replace(/\/?_?index$/, '')
  return path ? `/${path}/` : '/'
}
