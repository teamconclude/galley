import { useEffect, useState } from 'react'
import { pageAddress, parseReviewLink } from '../../../shared/reviewLink'
import type { PageInfo } from '../../../shared/types'

// The site's pages by path, loaded when the site opens and again after changes to its
// content, which may rename, retitle or reschedule pages.
export function usePages(repoPath: string | null, contentDir: string): Map<string, PageInfo> {
  const [pages, setPages] = useState<Map<string, PageInfo>>(new Map())
  useEffect(() => {
    if (!repoPath) return
    let live = true
    let timer: number | undefined
    const load = (): void => {
      void window.api.repo
        .pages()
        .then((list) => live && setPages(new Map(list.map((p) => [p.path, p]))))
        .catch(() => undefined)
    }
    load()
    const off = window.api.repo.onChanged((paths) => {
      if (!paths.some((p) => p.startsWith(contentDir + '/'))) return
      window.clearTimeout(timer)
      timer = window.setTimeout(load, 1000)
    })
    return () => {
      live = false
      off()
      window.clearTimeout(timer)
    }
  }, [repoPath, contentDir])
  return pages
}

export type PageState = 'draft' | 'scheduled' | 'expired'

// Whether a page is off the live site, and why. A future publish date, or date where it
// sets none, keeps a page back until then.
export function pageState(page: PageInfo, now = Date.now()): PageState | null {
  if (page.draft) return 'draft'
  const publish = page.publishDate ?? page.date
  if (publish && Date.parse(publish) > now) return 'scheduled'
  if (page.expiryDate && Date.parse(page.expiryDate) <= now) return 'expired'
  return null
}

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export const stateLabel: Record<PageState, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  expired: 'Expired'
}

// A sentence on the page's state for a tooltip, e.g. "Scheduled for 12 Nov 2026".
export function stateDetail(page: PageInfo): string | null {
  switch (pageState(page)) {
    case 'draft':
      return 'Draft: stays off the live site until Draft is switched off'
    case 'scheduled':
      return `Scheduled for ${day((page.publishDate ?? page.date)!)}`
    case 'expired':
      return `Expired on ${day(page.expiryDate!)}`
    default:
      return page.date ? `Published ${day(page.date)}` : null
  }
}

const fold = (text: string): string => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

const newest = (a: PageInfo, b: PageInfo): number =>
  (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title)

export interface PageMatch {
  page: PageInfo
  // The alias the query matched, when it matched nothing else.
  alias: string | null
}

// Pages whose title, address, aliases or file name hold every word of the query; matches
// in the title first, then the address, aliases and file name, newest first within each.
// An empty query lists the newest pages.
export function findPages(pages: Iterable<PageInfo>, text: string, limit = 50): PageMatch[] {
  const all = [...pages]
  // A pasted link is looked up by its address, and the page at it comes first.
  const link = linkAddress(text)
  const exact = link ? pageAt(all, link) : null
  const query = link ?? text
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return all
      .sort(newest)
      .slice(0, limit)
      .map((page) => ({ page, alias: null }))
  }
  const whole = fold(query.trim())
  const ranked: { match: PageMatch; rank: number }[] = []
  for (const page of all) {
    const title = fold(page.title)
    const url = fold(page.url)
    const aliases = page.aliases.map(fold)
    const file = fold(page.path)
    const has = (w: string): boolean =>
      title.includes(w) || url.includes(w) || file.includes(w) || aliases.some((a) => a.includes(w))
    if (!words.every(has)) continue
    if (page === exact?.page) {
      ranked.push({ match: exact, rank: -1 })
      continue
    }
    let rank = 5
    let alias: string | null = null
    if (title.startsWith(whole)) rank = 0
    else if (words.every((w) => title.includes(w))) rank = 1
    else if (words.every((w) => url.includes(w))) rank = 2
    else if (words.every((w) => file.includes(w))) rank = 4
    else {
      const i = aliases.findIndex((a) => words.every((w) => a.includes(w)))
      if (i >= 0) {
        rank = 3
        alias = page.aliases[i]
      }
    }
    ranked.push({ match: { page, alias }, rank })
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || newest(a.match.page, b.match.page))
    .slice(0, limit)
    .map((r) => r.match)
}

// The page at an address, or the one forwarding from it as an alias.
export function pageAt(pages: Iterable<PageInfo>, address: string): PageMatch | null {
  let forwarding: PageMatch | null = null
  for (const page of pages) {
    if (page.url === address) return { page, alias: null }
    if (!forwarding && page.aliases.includes(address)) forwarding = { page, alias: address }
  }
  return forwarding
}

// The page a changed file shows on: the page itself, or for a picture or other file in a
// page bundle, the bundle's page. Null for files no page is made of, e.g. layouts.
export function pageOfFile(pages: Map<string, PageInfo>, path: string): PageInfo | null {
  const own = pages.get(path)
  if (own) return own
  const dir = path.slice(0, path.lastIndexOf('/') + 1)
  if (!dir) return null
  for (const page of pages.values()) {
    if (page.path.startsWith(dir) && /^_?index\.[^/]+$/.test(page.path.slice(dir.length)))
      return page
  }
  return null
}

// The address a link to the site points at, whichever copy of the site it names: the
// live one, the preview or a review link. https://conclude.io/blog/x?ref=1#top gives
// /blog/x/. Null for text that is not a link.
export function linkAddress(text: string): string | null {
  const trimmed = text.trim()
  const review = parseReviewLink(trimmed)
  if (review) return review.url && pageAddress(review.url)
  // A link copied from the address bar may come without its scheme.
  const withScheme = /^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(trimmed)
    ? `https://${trimmed}`
    : trimmed
  if (!/^[a-z]+:\/\/\S+$/i.test(withScheme)) return null
  try {
    const path = decodeURI(new URL(withScheme).pathname).replace(/\/index\.html$/, '/')
    return pageAddress(path)
  } catch {
    return null
  }
}
