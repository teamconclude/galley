import { execFile } from 'child_process'
import { FSWatcher, existsSync, promises as fs, watch } from 'fs'
import { basename, dirname, extname, join, resolve, sep } from 'path'
import { parse as parseYaml } from 'yaml'
import type {
  ComponentLibrary,
  ComponentSchema,
  DataLists,
  DirEntry,
  FieldDef,
  FieldType,
  RepoInfo,
  SiteInfo
} from '../shared/types'
import { fieldTypes, humanize, inferField, isRecord } from '../shared/fields'
import { findHugo, listPages } from './hugo'
import { findConfig, siteInfo } from './hugoConfig'

const hiddenAtRoot = new Set(['node_modules', 'public', 'resources', 'bin'])
export const componentDirs = ['components', 'component-library/components']
export const isComponentFile = (rel: string): boolean =>
  componentDirs.some((d) => rel.startsWith(d + '/'))
const isConfigFile = (rel: string): boolean =>
  rel.startsWith('config/') ||
  /^(hugo|config)\.(ya?ml|toml|json)$/.test(rel) ||
  rel.startsWith('data/')
const ignoredChanges = /^(public|resources|node_modules|\.git)(\/|$)/
const imageFile = /\.(png|jpe?g|gif|webp|svg|avif)$/i

export class Repo {
  private watcher: FSWatcher | null = null
  private pages = new Map<string, string>()
  private pending = new Set<string>()
  private structureChanged = false
  private timer: NodeJS.Timeout | null = null
  private componentCache: ComponentLibrary | null = null
  private siteCache: Promise<SiteInfo> | null = null
  private dataCache: DataLists | null = null
  private imageCache: string[] | null = null
  private ownRenames = new Set<string>()

  constructor(
    readonly path: string,
    private onChange: (paths: string[]) => void
  ) {}

  static isSite(path: string): boolean {
    return findConfig(path) !== null
  }

  async site(): Promise<SiteInfo> {
    this.siteCache ??= siteInfo(this.path)
    return this.siteCache
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

  // The file appears in one step, so a watcher such as Hugo's never reads it half written.
  async write(rel: string, text: string): Promise<void> {
    const abs = this.absolute(rel)
    const tmp = join(dirname(abs), `.${basename(abs)}.galley~`)
    await fs.writeFile(tmp, text)
    this.ownRenames.add(rel)
    await fs.rename(tmp, abs)
  }

  async pageUrl(rel: string): Promise<string | null> {
    if (!rel.startsWith('content/')) return null
    if (this.pages.size === 0) await this.refreshPages()
    return this.pages.get(rel) ?? guessUrl(rel)
  }

  // A checkout has either <name>.yml files under components/ or, while the site still
  // uses Bookshop, <name>.bookshop.yml files under component-library/components/; the
  // latter are normalised to the same shape.
  async components(): Promise<ComponentLibrary> {
    if (this.componentCache) return this.componentCache
    const dir =
      componentDirs.map((d) => join(this.path, d)).find((d) => existsSync(d)) ??
      join(this.path, componentDirs[0])
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    const names = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
    const load = async (suffix: string): Promise<RawComponent[]> => {
      const out: RawComponent[] = []
      for (const name of names) {
        const raw = await readYaml(join(dir, name, `${name}${suffix}`))
        if (raw) out.push({ name, raw })
      }
      return out
    }
    const own = await load('.yml')
    this.componentCache =
      own.length > 0
        ? { blockKey: 'component', listKey: 'blocks', components: own.map(fromSchema) }
        : {
            blockKey: '_bookshop_name',
            listKey: 'content_blocks',
            components: fromBookshop(await load('.bookshop.yml'))
          }
    return this.componentCache
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

  // Copies a file into <dir> under a lowercase, unique name and returns its path.
  async importFile(src: string, dir: string): Promise<string> {
    const folder = this.absolute(dir)
    await fs.mkdir(folder, { recursive: true })
    const ext = extname(src).toLowerCase()
    const base =
      basename(src, extname(src))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'file'
    let name = base + ext
    for (let i = 2; existsSync(join(folder, name)); i++) name = `${base}-${i}${ext}`
    await fs.copyFile(src, join(folder, name))
    if (dir.startsWith('static/images')) this.imageCache = null
    return `${dir}/${name}`
  }

  // Same, for an image addressed by its URL path under static/.
  async importImage(src: string, dir: string): Promise<string> {
    const rel = await this.importFile(src, join('static', dir))
    return '/' + rel.replace(/^static\//, '')
  }

  async create(rel: string, text: string): Promise<void> {
    if (existsSync(this.absolute(rel))) throw new Error(`${rel} already exists`)
    await fs.writeFile(this.absolute(rel), text, { flag: 'wx' })
  }

  async mkdir(rel: string): Promise<void> {
    await fs.mkdir(this.absolute(rel), { recursive: true })
  }

  async rename(from: string, to: string): Promise<void> {
    if (existsSync(this.absolute(to))) throw new Error(`${to} already exists`)
    await fs.rename(this.absolute(from), this.absolute(to))
  }

  // The newest page in a directory, by frontmatter date, else by modification time.
  async newest(dirRel: string): Promise<string | null> {
    const dir = this.absolute(dirRel)
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    const pages = entries.filter(
      (e) => e.isFile() && e.name.endsWith('.md') && !/^_?index\.md$/.test(e.name)
    )
    let best: { date: string | null; mtime: number; text: string } | null = null
    for (const page of pages) {
      const file = join(dir, page.name)
      const text = await fs.readFile(file, 'utf8')
      const date = text.match(/^date:\s*['"]?(\d{4}-\d{2}-\d{2}[^'"\n]*)/m)?.[1] ?? null
      const mtime = (await fs.stat(file)).mtimeMs
      const newer =
        !best ||
        (date !== null && (best.date === null || date > best.date)) ||
        (date === null && best.date === null && mtime > best.mtime)
      if (newer) best = { date, mtime, text }
    }
    return best?.text ?? null
  }

  private async refreshPages(): Promise<void> {
    const bin = await findHugo(this.path)
    if (bin) this.pages = await listPages(bin, this.path)
  }

  watch(): void {
    this.watcher = watch(this.path, { recursive: true }, (event, file) => {
      const rel = file?.toString()
      if (!rel || ignoredChanges.test(rel) || rel.endsWith('.galley~')) return
      this.pending.add(rel)
      // Galley's own saves arrive as renames too, but move no page.
      if (event === 'rename' && rel.startsWith('content/') && !this.ownRenames.has(rel)) {
        this.structureChanged = true
      }
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => this.flush(), 300)
    })
  }

  private flush(): void {
    const paths = [...this.pending]
    this.pending.clear()
    this.ownRenames.clear()
    if (this.structureChanged) {
      this.structureChanged = false
      void this.refreshPages()
    }
    if (paths.some(isComponentFile)) this.componentCache = null
    if (paths.some(isConfigFile)) this.siteCache = null
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

interface RawComponent {
  name: string
  raw: Record<string, unknown>
}

async function readYaml(path: string): Promise<Record<string, unknown> | null> {
  const text = await fs.readFile(path, 'utf8').catch(() => null)
  if (text === null) return null
  try {
    const raw: unknown = parseYaml(text)
    return isRecord(raw) ? raw : null
  } catch {
    return null
  }
}

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)

function fromSchema({ name, raw }: RawComponent): ComponentSchema {
  return {
    name,
    label: str(raw.label, name),
    description: str(raw.description, ''),
    standalone: raw.standalone !== false,
    fields: parseFields(raw.fields)
  }
}

// `fields` is a map of key to definition; a definition without a type is a text field.
function parseFields(v: unknown): FieldDef[] {
  if (!isRecord(v)) return []
  return Object.entries(v).map(([key, raw]) => {
    const d = isRecord(raw) ? raw : {}
    const type = fieldTypes.has(d.type as FieldType) ? (d.type as FieldType) : 'text'
    const out: FieldDef = { key, type, label: str(d.label, humanize(key)) }
    if (typeof d.placeholder === 'string') out.placeholder = d.placeholder
    if (typeof d.help === 'string') out.help = d.help
    if (d.default !== undefined) out.default = d.default
    if (d.required === true) out.required = true
    if (Array.isArray(d.options)) out.options = d.options.map(String)
    if (d.fields !== undefined) out.fields = parseFields(d.fields)
    if (typeof d.component === 'string') out.component = d.component
    if (Array.isArray(d.components)) out.components = d.components.map(String)
    return out
  })
}

// Bookshop blueprints reference components as `bookshop:<name>` (one nested block),
// `[bookshop:<name>]` (a list of that component) or `[bookshop:structure:<structure>]`
// (a list of every component declaring that structure in spec.structures). Field types
// come from the CloudCannon `_inputs` hints, matched by key at any depth, else from the
// blueprint value, which also serves as the default and placeholder.
function fromBookshop(entries: RawComponent[]): ComponentSchema[] {
  const spec = (raw: Record<string, unknown>): Record<string, unknown> =>
    isRecord(raw.spec) ? raw.spec : {}
  const structuresOf = (raw: Record<string, unknown>): string[] => {
    const list = spec(raw).structures
    return Array.isArray(list) ? list.map(String) : []
  }
  const members = new Map<string, string[]>()
  for (const { name, raw } of entries) {
    for (const s of structuresOf(raw)) members.set(s, [...(members.get(s) ?? []), name])
  }
  const ref = (v: unknown): string | null =>
    typeof v === 'string' && v.startsWith('bookshop:') ? v.slice('bookshop:'.length) : null
  const blockList = (v: unknown): string[] | null | undefined => {
    const listed = Array.isArray(v) && v.length === 1 ? ref(v[0]) : null
    if (listed === null) return undefined
    if (!listed.startsWith('structure:')) return [listed]
    const structure = listed.slice('structure:'.length)
    return structure === 'content_blocks' ? null : (members.get(structure) ?? [])
  }
  const convert = (
    inputs: Record<string, unknown>
  ): ((obj: Record<string, unknown>) => FieldDef[]) => {
    const field = (key: string, value: unknown): FieldDef => {
      const hint = isRecord(inputs[key]) ? inputs[key] : {}
      const base = { key, label: str(hint.label, humanize(key)) }
      if (typeof hint.comment === 'string') Object.assign(base, { help: hint.comment })
      const single = ref(value)
      if (single !== null) return { ...base, type: 'block', component: single }
      const allowed = blockList(value)
      if (allowed !== undefined) {
        return allowed
          ? { ...base, type: 'blocks', components: allowed }
          : { ...base, type: 'blocks' }
      }
      const withDefault = (def: FieldDef): FieldDef => {
        if (typeof value === 'string' && value)
          return { ...def, default: value, placeholder: value }
        if (typeof value === 'boolean' || typeof value === 'number')
          return { ...def, default: value }
        return def
      }
      switch (hint.type) {
        case 'text':
        case 'url':
        case 'color':
          return withDefault({ ...base, type: 'text' })
        case 'markdown':
          return withDefault({ ...base, type: 'markdown' })
        case 'image':
          return withDefault({ ...base, type: 'image' })
        case 'checkbox':
        case 'switch':
          return withDefault({ ...base, type: 'boolean' })
        case 'number':
          return withDefault({ ...base, type: 'number' })
        case 'array':
          return { ...base, type: 'list' }
        case 'select': {
          const options = isRecord(hint.options) ? hint.options : {}
          const values = Array.isArray(options.values) ? options.values.map(String) : []
          const def: FieldDef = { ...base, type: 'select', options: values }
          if (options.allow_empty !== true) def.required = true
          return withDefault(def)
        }
      }
      if (Array.isArray(value) && isRecord(value[0])) {
        return { ...base, type: 'list', fields: fields(value[0]) }
      }
      if (isRecord(value)) return { ...base, type: 'object', fields: fields(value) }
      return withDefault(inferField(key, value, '_bookshop_name'))
    }
    const fields = (obj: Record<string, unknown>): FieldDef[] =>
      Object.entries(obj).map(([k, v]) => field(k, v))
    return fields
  }
  return entries.map(({ name, raw }) => ({
    name,
    label: str(spec(raw).label, name),
    description: str(spec(raw).description, ''),
    standalone: structuresOf(raw).includes('content_blocks'),
    fields: convert(isRecord(raw._inputs) ? raw._inputs : {})(
      isRecord(raw.blueprint) ? raw.blueprint : {}
    )
  }))
}
