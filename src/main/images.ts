import { promises as fs } from 'fs'
import { basename, dirname, extname, join } from 'path'
import { shell } from 'electron'
import type { ImageReplacement, ImageSize, ImageUse, SiteInfo } from '../shared/types'
import type { Git } from './git'
import { environmentSites } from './hugoConfig'
import type { Repo } from './repo'
import { listFiles, readText } from './search'

// How the site's text names an image. One under the static or assets folder goes by its
// path below that folder, written as /images/x.png, images/x.png, /static/images/x.png
// or with one of the site's hosts in front. One in a page bundle goes by its file name,
// in that bundle's pages.
export interface ImageAddress {
  // Where uses are looked for.
  dirs: string[]
  // What may come before the name, as a regular expression without groups.
  prefix: string
  name: string
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function imageAddress(rel: string, site: SiteInfo, hosts: string[]): ImageAddress {
  if (rel.startsWith(site.contentDir + '/')) {
    return { dirs: [dirname(rel)], prefix: '(?:\\./)?', name: basename(rel) }
  }
  const root = [site.staticDir, 'assets'].find((d) => rel.startsWith(d + '/'))
  const host = hosts.length > 0 ? `(?:(?:https?:)?//(?:${hosts.map(escape).join('|')}))?` : ''
  return {
    dirs: [''],
    prefix: `${host}(?:/?${escape(site.staticDir)})?/?`,
    name: root ? rel.slice(root.length + 1) : rel
  }
}

// The address as written, with what comes before the name in the first group. Neither
// side may continue a longer name: /images/x.png is not in /fr/images/x.png or
// /images/x.png.bak.
function addressPattern(address: ImageAddress): RegExp {
  return new RegExp(`(?<![\\w./-])(${address.prefix})${escape(address.name)}(?![\\w.-])`, 'g')
}

// Tags that may give a picture's size: HTML images and shortcodes.
const sizedTag = /<img\b[^>]*>|\{\{[<%][\s\S]*?[>%]\}\}/g
const widthAttr = /(?<![\w-])width\s*=\s*["']?(\d+)/
const heightAttr = /((?<![\w-])height\s*=\s*["']?)(\d+)/

const hasSize = (tag: string): boolean => widthAttr.test(tag) && heightAttr.test(tag)

export async function findUses(root: string, address: ImageAddress): Promise<ImageUse[]> {
  const pattern = addressPattern(address)
  const uses: ImageUse[] = []
  for (const rel of await listFiles(root, address.dirs)) {
    const text = await readText(join(root, rel))
    if (text === null) continue
    const count = text.match(pattern)?.length ?? 0
    if (count === 0) continue
    const sized = (text.match(sizedTag) ?? []).filter(
      (tag) => tag.match(pattern) !== null && hasSize(tag)
    ).length
    uses.push({ path: rel, count, sized })
  }
  return uses
}

// Points every use at the new name. A tag that gives a width and height keeps its width
// and takes the height from the picture's proportions, when they are known.
export function rewrite(
  text: string,
  address: ImageAddress,
  name: string,
  size: ImageSize | null
): string {
  const pattern = addressPattern(address)
  const resized = size
    ? text.replace(sizedTag, (tag) => {
        const width = tag.match(widthAttr)
        if (!width || !heightAttr.test(tag) || tag.match(pattern) === null) return tag
        const height = Math.round((Number(width[1]) * size.height) / size.width)
        return tag.replace(heightAttr, `$1${height}`)
      })
    : text
  return resized.replace(pattern, (_, before: string) => before + name)
}

// The name a replacement gets: the same one for a picture never published, else the next
// -v2, -v3 that is free. The extension is the new file's.
export function replacementName(
  current: string,
  ext: string,
  published: boolean,
  taken: Set<string>
): string {
  const stem = basename(current, extname(current))
  const same = stem + ext
  if (!published && (same === current || !taken.has(same))) return same
  const root = stem.replace(/-v\d+$/, '')
  let n = Number(stem.match(/-v(\d+)$/)?.[1] ?? 1) + 1
  while (taken.has(`${root}-v${n}${ext}`)) n++
  return `${root}-v${n}${ext}`
}

const imageTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif'
}

// A picture's size from its header, for the formats a site uses; null for anything else.
export function imageSize(data: Buffer): ImageSize | null {
  const ascii = (from: number, to: number): string => data.toString('latin1', from, to)
  if (data.length < 24) return null
  if (data.readUInt32BE(0) === 0x89504e47) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
  }
  if (ascii(0, 4) === 'GIF8') return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) }
  if (data[0] === 0xff && data[1] === 0xd8) return jpegSize(data)
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' && data.length >= 30) {
    const chunk = ascii(12, 16)
    if (chunk === 'VP8 ') {
      return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff }
    }
    if (chunk === 'VP8L') {
      const bits = data.readUInt32LE(21)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X') {
      return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1 }
    }
    return null
  }
  // An AVIF made of tiles gives each tile's size too; the whole picture is the largest.
  if (ascii(4, 8) === 'ftyp') {
    let best: ImageSize | null = null
    for (let at = data.indexOf('ispe'); at > 0; at = data.indexOf('ispe', at + 4)) {
      if (at + 16 > data.length) break
      const size = { width: data.readUInt32BE(at + 8), height: data.readUInt32BE(at + 12) }
      if (!best || size.width * size.height > best.width * best.height) best = size
    }
    return best
  }
  return svgSize(data.toString('utf8', 0, Math.min(data.length, 4096)))
}

// The first frame header after the start of image.
function jpegSize(data: Buffer): ImageSize | null {
  let i = 2
  while (i + 9 < data.length) {
    if (data[i] !== 0xff) return null
    const marker = data[i + 1]
    if (marker === 0xff) {
      i++
      continue
    }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) }
    }
    i += 2 + data.readUInt16BE(i + 2)
  }
  return null
}

function svgSize(text: string): ImageSize | null {
  const tag = text.match(/<svg\b[^>]*>/)?.[0]
  if (!tag) return null
  const attr = (name: string): number | null => {
    const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`))
    return m ? Number(m[1]) : null
  }
  const [width, height] = [attr('width'), attr('height')]
  if (width && height) return { width, height }
  const box = tag.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/)
  return box ? { width: Number(box[1]), height: Number(box[2]) } : null
}

async function sizeOf(path: string): Promise<ImageSize | null> {
  const data = await fs.readFile(path).catch(() => null)
  return data && imageSize(data)
}

async function addressOf(repo: Repo, rel: string): Promise<ImageAddress> {
  return imageAddress(rel, await repo.site(), await environmentSites(repo.path))
}

export async function imageUses(repo: Repo, rel: string): Promise<ImageUse[]> {
  return findUses(repo.path, await addressOf(repo, rel))
}

// Everything the replace dialog shows, read before anything changes.
export async function planReplacement(
  repo: Repo,
  git: Git | null,
  rel: string,
  source: string
): Promise<ImageReplacement> {
  const address = await addressOf(repo, rel)
  const data = await fs.readFile(source)
  const ext = extname(source).toLowerCase()
  const published = (await git?.published(rel)) ?? false
  const taken = (await fs.readdir(repo.absolute(dirname(rel))).catch(() => [] as string[])).filter(
    (n) => !n.startsWith('.')
  )
  return {
    source,
    preview: `data:${imageTypes[ext] ?? 'application/octet-stream'};base64,${data.toString('base64')}`,
    size: imageSize(data),
    oldSize: await sizeOf(repo.absolute(rel)),
    uses: await findUses(repo.path, address),
    published,
    name: replacementName(basename(rel), ext, published, new Set(taken)),
    taken,
    keptFor: (await git?.branchesUsing(address.name, address.dirs)) ?? []
  }
}

// Writes the new picture as <name> beside the old one and points every use at it. The
// old file goes to the Trash unless another branch on GitHub uses it.
export async function replaceImage(
  repo: Repo,
  git: Git | null,
  rel: string,
  source: string,
  name: string
): Promise<void> {
  if (name.includes('/') || name.startsWith('.')) throw new Error(`${name} is not a file name`)
  const target = `${dirname(rel)}/${name}`
  const address = await addressOf(repo, rel)
  const uses = await findUses(repo.path, address)
  await repo.copyIn(source, target, target === rel)
  const size = await sizeOf(source)
  const newName = address.name.slice(0, address.name.length - basename(rel).length) + name
  for (const use of uses) {
    const text = await repo.read(use.path)
    const next = rewrite(text, address, newName, size)
    if (next !== text) await repo.write(use.path, next)
  }
  if (target === rel) return
  const kept = (await git?.branchesUsing(address.name, address.dirs)) ?? []
  if (kept.length === 0) await shell.trashItem(repo.absolute(rel))
}

// Renames an image and points every use at the new name; returns the files changed.
export async function renameImage(repo: Repo, from: string, to: string): Promise<number> {
  const address = await addressOf(repo, from)
  const uses = await findUses(repo.path, address)
  await repo.rename(from, to)
  const newName = address.name.slice(0, address.name.length - basename(from).length) + basename(to)
  let changed = 0
  for (const use of uses) {
    const text = await repo.read(use.path)
    const next = rewrite(text, address, newName, null)
    if (next === text) continue
    await repo.write(use.path, next)
    changed++
  }
  return changed
}
