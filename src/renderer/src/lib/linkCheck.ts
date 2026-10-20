import { RangeSetBuilder, StateEffect, type Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'

// The addresses links within the site may point to, loaded from the main process, and the
// site's own hosts, whose full addresses count as links within the site.
let targets: Set<string> | null = null
let hosts: string[] = []
const views = new Set<EditorView>()
const refresh = StateEffect.define<null>()

export function setLinkTargets(list: string[], siteHosts: string[]): void {
  targets = list.length > 0 ? new Set(list) : null
  hosts = siteHosts
  for (const view of views) {
    setTimeout(() => views.has(view) && view.dispatch({ effects: refresh.of(null) }))
  }
}

const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

// A full address on one of the site's hosts, or on the local preview, as the path the
// site's pages use; other addresses as they are. Copies from a browser carry full
// addresses even where the page wrote paths.
export function siteAddress(url: string): string {
  const full = url.match(/^https?:\/\/([^/?#]+)([^#]*?)?(#.*)?$/i)
  if (!full) return url
  const host = full[1].toLowerCase().replace(/^www\./, '')
  if (!hosts.includes(host) && !localHost.test(host)) return url
  return (full[2] || '/') + (full[3] ?? '')
}

// The site's own file a picture address names, e.g. /images/logo.webp, or null.
export function siteFile(url: string): string | null {
  const path = siteAddress(url).replace(/[?#].*$/, '')
  return path.startsWith('/') && targets?.has(path) ? path : null
}

// The path a link leads to within the site, or null for links elsewhere and anchors.
function sitePath(url: string): string | null {
  let path = url
  const full = url.match(/^https?:\/\/([^/]+)(\/.*)?$/i)
  if (full) {
    const host = full[1].toLowerCase().replace(/^www\./, '')
    if (!hosts.includes(host) && !localHost.test(host)) return null
    path = full[2] ?? '/'
  }
  if (!path.startsWith('/') || path.startsWith('//')) return null
  path = path.replace(/[?#].*$/, '')
  return /\/$|\.[a-z0-9]+$/i.test(path) ? path : path + '/'
}

const broken = (path: string): Decoration =>
  Decoration.mark({
    class: 'cm-broken-link',
    attributes: { title: `No page or file at ${path}` }
  })

// Markdown links, images and href attributes.
const linkPattern = /\]\(\s*<?([^)\s>]+)|href="([^"]+)"/g

function decorate(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  if (!targets) return builder.finish()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    for (const m of text.matchAll(linkPattern)) {
      const url = m[1] ?? m[2]
      const path = sitePath(url)
      if (!path || targets.has(path)) continue
      const start = from + m.index! + m[0].indexOf(url)
      builder.add(start, start + url.length, broken(path))
    }
  }
  return builder.finish()
}

// Underlines links within the site that lead nowhere, e.g. a mistyped or made-up address.
export function linkCheck(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(readonly view: EditorView) {
        views.add(view)
        this.decorations = decorate(view)
      }
      update(update: ViewUpdate): void {
        const refreshed = update.transactions.some((t) => t.effects.some((e) => e.is(refresh)))
        if (update.docChanged || update.viewportChanged || refreshed) {
          this.decorations = decorate(update.view)
        }
      }
      destroy(): void {
        views.delete(this.view)
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
}
