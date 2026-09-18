import { existsSync, promises as fs } from 'fs'
import { basename, extname, join } from 'path'
import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'
import { isRecord } from '../shared/fields'
import type { SiteInfo } from '../shared/types'

const names = ['hugo', 'config']
const exts = ['yaml', 'yml', 'toml', 'json']

// The site's main Hugo config file: hugo.* or config.* at the root or under config/_default.
export function findConfig(root: string): string | null {
  for (const dir of ['', join('config', '_default')]) {
    for (const name of names) {
      for (const ext of exts) {
        const file = join(root, dir, `${name}.${ext}`)
        if (existsSync(file)) return file
      }
    }
  }
  return null
}

export function parse(file: string, text: string): unknown {
  switch (extname(file)) {
    case '.toml':
      return parseToml(text)
    case '.json':
      return JSON.parse(text)
    default:
      return parseYaml(text)
  }
}

// The merged base config. In a config directory every other file holds one top-level
// key, named after the file, e.g. config/_default/params.yaml.
export async function loadConfig(root: string): Promise<Record<string, unknown>> {
  const main = findConfig(root)
  if (!main) return {}
  const read = async (file: string): Promise<unknown> => {
    try {
      return parse(file, await fs.readFile(file, 'utf8'))
    } catch {
      return null
    }
  }
  const config = await read(main)
  const out: Record<string, unknown> = isRecord(config) ? { ...config } : {}
  const dir = join(root, 'config', '_default')
  if (main.startsWith(dir)) {
    for (const entry of await fs.readdir(dir).catch(() => [] as string[])) {
      const key = basename(entry, extname(entry))
      if (names.includes(key) || !exts.includes(extname(entry).slice(1))) continue
      const value = await read(join(dir, entry))
      if (value !== null && !(key in out)) out[key] = value
    }
  }
  return out
}

const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v ? v : fallback)
const lower = (v: unknown): string => (typeof v === 'string' ? v.toLowerCase() : '')

// What Galley needs to know about a site, all of it read from the Hugo config or
// found in the checkout.
export async function siteInfo(root: string): Promise<SiteInfo> {
  const config = await loadConfig(root)
  const contentDir = str(config.contentDir, 'content')
  const staticDirs = Array.isArray(config.staticDir) ? config.staticDir : [config.staticDir]
  const staticDir = str(staticDirs[0], 'static')
  const formats = isRecord(config.outputFormats) ? config.outputFormats : {}
  const outputs = isRecord(config.outputs) ? config.outputs : {}
  const listed = (kind: string): string[] => {
    const list = outputs[kind]
    return Array.isArray(list) ? list.map(lower) : []
  }
  const format = (name: string): Record<string, unknown> => {
    const key = Object.keys(formats).find((k) => k.toLowerCase() === name)
    const f = key === undefined ? undefined : formats[key]
    return isRecord(f) ? f : {}
  }
  const everywhere = new Set(Object.keys(outputs).flatMap(listed))
  let markdownSuffix: string | null = null
  for (const name of everywhere) {
    const f = format(name)
    if (lower(f.mediaType) === 'text/markdown') markdownSuffix = `${str(f.baseName, 'index')}.md`
  }
  const textPreviews: Record<string, string> = {}
  for (const name of listed('home')) {
    const f = format(name)
    if (lower(f.mediaType) !== 'text/plain') continue
    for (const ext of exts) {
      const data = join('data', `${name}.${ext}`)
      if (existsSync(join(root, data))) textPreviews[data] = `/${str(f.baseName, 'index')}.txt`
    }
  }
  return {
    name: str(config.title, basename(root)),
    contentDir,
    staticDir,
    imagesDir: `${staticDir}/images`,
    imagesUrl: '/images',
    componentsDir: componentsDir(root, config),
    markdownSuffix,
    textPreviews
  }
}

// The folder mounted as the component partials, else the conventional folders.
function componentsDir(root: string, config: Record<string, unknown>): string {
  const mounts =
    isRecord(config.module) && Array.isArray(config.module.mounts) ? config.module.mounts : []
  for (const m of mounts) {
    if (isRecord(m) && m.target === 'layouts/partials/components' && typeof m.source === 'string') {
      return m.source
    }
  }
  const fallback = ['components', 'component-library/components']
  return fallback.find((d) => existsSync(join(root, d))) ?? fallback[0]
}
