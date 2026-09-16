import { promises as fs } from 'fs'
import { join } from 'path'
import { compile } from '../shared/search'
import type { ReplaceResult, SearchMatch, SearchOptions, SearchResults } from '../shared/types'

// Build output, dependencies and the vendored Hugo module hold nothing an editor looks for.
const skippedDirs = new Set(['node_modules', 'public', 'resources', 'bin', '_vendor'])
const binaryFile =
  /\.(png|jpe?g|gif|webp|svg|ico|avif|pdf|zip|gz|woff2?|ttf|otf|eot|mp4|mov|webm|mp3)$/i
const maxFileSize = 2 * 1024 * 1024
const maxMatches = 2000
const maxLineLength = 1000

export async function search(
  root: string,
  query: string,
  options: SearchOptions
): Promise<SearchResults> {
  const results: SearchResults = { files: [], total: 0, truncated: false }
  if (query === '') return results
  const pattern = compile(query, options)
  const files = await listFiles(root, options.contentOnly ? ['content'] : [''])
  for (const rel of files) {
    const text = await readText(join(root, rel))
    if (text === null) continue
    const matches = searchText(text, pattern, maxMatches - results.total)
    if (matches.length === 0) continue
    results.files.push({ path: rel, matches })
    results.total += matches.length
    if (results.total >= maxMatches) {
      results.truncated = true
      break
    }
  }
  return results
}

// Rewrites every hit in every file; a literal replacement is used as typed, one for an
// expression may refer to groups as $1.
export async function replace(
  root: string,
  query: string,
  options: SearchOptions,
  replacement: string
): Promise<ReplaceResult> {
  const result: ReplaceResult = { files: 0, matches: 0 }
  if (query === '') return result
  const pattern = compile(query, options)
  const files = await listFiles(root, options.contentOnly ? ['content'] : [''])
  for (const rel of files) {
    const path = join(root, rel)
    const text = await readText(path)
    if (text === null) continue
    let count = 0
    const next = text.replace(pattern, (...args) => {
      count++
      if (!options.regex) return replacement
      const hit = args[0] as string
      return hit.replace(compile(query, options, false), replacement)
    })
    if (count === 0) continue
    await fs.writeFile(path, next)
    result.files++
    result.matches += count
  }
  return result
}

export function searchText(text: string, pattern: RegExp, limit: number): SearchMatch[] {
  const matches: SearchMatch[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length && matches.length < limit; i++) {
    const line = lines[i]
    pattern.lastIndex = 0
    for (let m = pattern.exec(line); m && matches.length < limit; m = pattern.exec(line)) {
      matches.push({ line: i + 1, column: m.index, length: m[0].length, text: display(line) })
      if (m[0].length === 0) pattern.lastIndex++
    }
  }
  return matches
}

const display = (line: string): string =>
  line.length > maxLineLength ? line.slice(0, maxLineLength) : line

// Files in depth-first order, so results come out grouped as the file tree shows them.
async function listFiles(root: string, dirs: string[]): Promise<string[]> {
  const out: string[] = []
  const walk = async (rel: string): Promise<void> => {
    const entries = await fs.readdir(join(root, rel), { withFileTypes: true }).catch(() => [])
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (e.name.startsWith('.') || (rel === '' && skippedDirs.has(e.name))) continue
      const path = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(path)
      else if (e.isFile() && !binaryFile.test(e.name)) out.push(path)
    }
  }
  for (const dir of dirs) await walk(dir)
  return out
}

async function readText(path: string): Promise<string | null> {
  const stat = await fs.stat(path).catch(() => null)
  if (!stat || stat.size > maxFileSize) return null
  const buffer = await fs.readFile(path).catch(() => null)
  if (!buffer || buffer.subarray(0, 8000).includes(0)) return null
  return buffer.toString('utf8')
}
