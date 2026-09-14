import { execFile } from 'child_process'
import { FSWatcher, existsSync, promises as fs, watch } from 'fs'
import { basename, extname, join, resolve, sep } from 'path'
import { parse as parseYaml } from 'yaml'
import type { ComponentSchema, DataLists, DirEntry, InputHint, RepoInfo } from '../shared/types'
import { findHugo, listPages } from './hugo'

const hiddenAtRoot = new Set(['node_modules', 'public', 'resources', 'bin'])
const ignoredChanges = /^(public|resources|node_modules|\.git)(\/|$)/
const imageFile = /\.(png|jpe?g|gif|webp|svg|avif)$/i

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export class Repo {
  private watcher: FSWatcher | null = null
  private pages = new Map<string, string>()
  private pending = new Set<string>()
  private structureChanged = false
  private timer: NodeJS.Timeout | null = null
  private componentCache: ComponentSchema[] | null = null
  private dataCache: DataLists | null = null
  private imageCache: string[] | null = null

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

  async components(): Promise<ComponentSchema[]> {
    if (this.componentCache) return this.componentCache
    const dir = join(this.path, 'component-library', 'components')
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    const out: ComponentSchema[] = []
    for (const entry of entries.filter((e) => e.isDirectory()).sort()) {
      const name = entry.name
      const text = await fs.readFile(join(dir, name, `${name}.yml`), 'utf8').catch(() => null)
      if (text === null) continue
      let raw: unknown
      try {
        raw = parseYaml(text)
      } catch {
        continue
      }
      if (!isRecord(raw)) continue
      out.push({
        name,
        label: typeof raw.label === 'string' ? raw.label : name,
        description: typeof raw.description === 'string' ? raw.description : '',
        standalone: raw.standalone !== false,
        blueprint: isRecord(raw.blueprint) ? raw.blueprint : {},
        inputs: isRecord(raw.inputs) ? (raw.inputs as Record<string, InputHint>) : {}
      })
    }
    this.componentCache = out
    return out
  }

  async data(): Promise<DataLists> {
    if (this.dataCache) return this.dataCache
    const names = async (file: string): Promise<string[]> => {
      try {
        const list: unknown = parseYaml(await fs.readFile(join(this.path, 'data', file), 'utf8'))
        if (!Array.isArray(list)) return []
        return list
          .map((e) => (isRecord(e) ? e.name : undefined))
          .filter((n): n is string => typeof n === 'string')
      } catch {
        return []
      }
    }
    this.dataCache = {
      authors: await names('authors.yaml'),
      categories: await names('categories.yaml'),
      customercategories: await names('customercategories.yaml')
    }
    return this.dataCache
  }

  async images(): Promise<string[]> {
    if (this.imageCache) return this.imageCache
    const out: string[] = []
    const walk = async (dir: string, rel: string): Promise<void> => {
      for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (e.name.startsWith('.')) continue
        if (e.isDirectory()) await walk(join(dir, e.name), `${rel}/${e.name}`)
        else if (imageFile.test(e.name)) out.push(`${rel}/${e.name}`)
      }
    }
    await walk(join(this.path, 'static', 'images'), '/images')
    this.imageCache = out.sort()
    return this.imageCache
  }

  // Copies an image into static/<dir> under a lowercase, unique name and returns its URL path.
  async importImage(src: string, dir: string): Promise<string> {
    const folder = this.absolute(join('static', dir))
    await fs.mkdir(folder, { recursive: true })
    const ext = extname(src).toLowerCase()
    const base =
      basename(src, extname(src))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'image'
    let name = base + ext
    for (let i = 2; existsSync(join(folder, name)); i++) name = `${base}-${i}${ext}`
    await fs.copyFile(src, join(folder, name))
    this.imageCache = null
    return `${dir}/${name}`
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
    if (paths.some((p) => p.startsWith('component-library/'))) this.componentCache = null
    if (paths.some((p) => p.startsWith('data/'))) this.dataCache = null
    if (paths.some((p) => p.startsWith('static/images'))) this.imageCache = null
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
