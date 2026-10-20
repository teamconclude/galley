import { useEffect, useState } from 'react'
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
export function findPages(pages: Iterable<PageInfo>, query: string, limit = 50): PageMatch[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const all = [...pages]
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
