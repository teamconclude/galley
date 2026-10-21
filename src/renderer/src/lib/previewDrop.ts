import type { DropSpot } from '../../../shared/types'
import { plainText } from './previewScroll'

// A change to the body: text inserted or replacing a range, and what to select after.
export interface BodyEdit {
  from: number
  to: number
  insert: string
  select?: { from: number; to: number }
}

type TextSpot = Extract<DropSpot, { kind: 'text' }>

const placeholder = 'Description'
// Words as the page shows them, without the pipes of a Markdown table.
const squash = (s: string): string => s.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()
const listItem = /^(\s*)([-*+]|\d+[.)])(\s+)/
const headingLine = /^\s*(#{1,6}\s|<h[1-6]\b)/i
const blank = (line: string | undefined): boolean => line === undefined || line.trim() === ''
const indentOf = (line: string): number => line.match(/^\s*/)?.[0].length ?? 0

// The line a block of the page starts with: the one whose words begin the block's text,
// the longest if several do, the reverse of how the preview finds the cursor's line.
function lineOf(lines: string[], spot: TextSpot): number | null {
  const want = squash(spot.text)
  let found: number | null = null
  let length = 0
  lines.forEach((line, i) => {
    if (headingLine.test(line) !== spot.heading) return
    const words = squash(plainText(line)).slice(0, 80)
    if (words.length < 2 || !want.startsWith(words) || words.length <= length) return
    found = i
    length = words.length
  })
  return found
}

// The last line of the block starting at line i: a paragraph runs to a blank line, a list
// item also over the blank lines between its own indented paragraphs.
function blockEnd(lines: string[], i: number): number {
  const item = lines[i].match(listItem)
  const content = item ? item[0].length : Infinity
  let end = i
  for (let k = i + 1; k < lines.length; k++) {
    const line = lines[k]
    if (blank(line)) {
      if (!item) break
      const next = lines.slice(k + 1).find((l) => !blank(l))
      if (next === undefined || indentOf(next) < content) break
      continue
    }
    if (item ? indentOf(line) < content && listItem.test(line) : listItem.test(line)) break
    if (!item && headingLine.test(line)) break
    end = k
  }
  return end
}

// The list item just before item i, at the same depth, or null for a list's first item.
function previousItem(lines: string[], i: number): number | null {
  const indent = indentOf(lines[i])
  for (let p = i - 1; p >= 0; p--) {
    if (blank(lines[p]) || indentOf(lines[p]) > indent) continue
    const sibling = listItem.test(lines[p]) && indentOf(lines[p]) === indent
    return sibling && lines.slice(blockEnd(lines, p) + 1, i).every(blank) ? p : null
  }
  return null
}

// A picture placed before or after the block of the page under the pointer, as a
// paragraph of its own with blank lines around it. Next to a list item it goes inside an
// item, the one before for a drop above, so the list stays one and keeps counting. Null
// when the block is not in the body.
export function placeInBody(body: string, spot: TextSpot, url: string): BodyEdit | null {
  const lines = body.split('\n')
  const line = lineOf(lines, spot)
  if (line === null) return null
  const starts: number[] = []
  lines.reduce((at, line) => (starts.push(at), at + line.length + 1), 0)
  const image = (indent: number): string => `${' '.repeat(indent)}![${placeholder}](${url})`
  const above = !spot.after && listItem.test(lines[line]) ? previousItem(lines, line) : null
  const i = above ?? line
  if (spot.after || above !== null) {
    const end = blockEnd(lines, i)
    const item = lines[i].match(listItem)
    const indent = item ? item[0].length : indentOf(lines[i])
    const at = starts[end] + lines[end].length
    const insert = `\n\n${image(indent)}` + (blank(lines[end + 1]) ? '' : '\n')
    const from = at + 2 + indent + 2
    return { from: at, to: at, insert, select: { from, to: from + placeholder.length } }
  }
  const indent = indentOf(lines[i])
  const at = starts[i]
  const lead = i > 0 && !blank(lines[i - 1]) ? '\n' : ''
  const insert = `${lead}${image(indent)}\n\n`
  const from = at + lead.length + indent + 2
  return { from: at, to: at, insert, select: { from, to: from + placeholder.length } }
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Where an address stands as a picture's: in ![…](…), or as an <img>'s src.
const addressIn = (src: string): RegExp =>
  new RegExp(`(\\]\\(\\s*|\\bsrc\\s*=\\s*["']?)${escape(src)}(?=[\\s)"'?#>])`, 'g')

// The nth picture with this address in the body pointed at another, or null when the
// body shows no picture there. Past the last, the last one is taken: the page may show
// the same picture above the body too.
export function swapInBody(body: string, src: string, nth: number, url: string): BodyEdit | null {
  const hits = [...body.matchAll(addressIn(src))]
  if (hits.length === 0) return null
  const hit = hits[Math.min(Math.max(nth, 0), hits.length - 1)]
  const from = (hit.index ?? 0) + hit[1].length
  return { from, to: from + src.length, insert: url }
}

// The settings with the nth value that is exactly this address replaced, or null.
export function swapInSettings(
  frontmatter: string,
  src: string,
  nth: number,
  url: string
): string | null {
  const value = new RegExp(`((?::|^\\s*-)\\s*)(["']?)${escape(src)}\\2(?=\\s*(?:#.*)?$)`, 'gm')
  const hits = [...frontmatter.matchAll(value)]
  if (hits.length === 0) return null
  const hit = hits[Math.min(Math.max(nth, 0), hits.length - 1)]
  const at = (hit.index ?? 0) + hit[1].length + hit[2].length
  return frontmatter.slice(0, at) + url + frontmatter.slice(at + src.length)
}

// An <img> around a range of the body that gives a width and height: the edit to its
// height for a picture of this size, keeping the width; null when there is nothing to do.
export function resizeTag(
  body: string,
  at: number,
  size: { width: number; height: number }
): BodyEdit | null {
  const start = body.lastIndexOf('<img', at)
  const end = body.indexOf('>', at)
  if (start < 0 || end < 0 || body.lastIndexOf('>', at) > start) return null
  const tag = body.slice(start, end + 1)
  const width = tag.match(/(?<![\w-])width\s*=\s*["']?(\d+)/)
  const height = tag.match(/((?<![\w-])height\s*=\s*["']?)(\d+)/)
  if (!width || !height || height.index === undefined) return null
  const value = String(Math.round((Number(width[1]) * size.height) / size.width))
  const from = start + height.index + height[1].length
  return value === height[2] ? null : { from, to: from + height[2].length, insert: value }
}
