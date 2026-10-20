import TurndownService from 'turndown'
import { highlightedCodeBlock, strikethrough, taskListItems } from 'turndown-plugin-gfm'

// HTML becomes Markdown by rule, not by retyping: headings, lists, emphasis, tables and
// links come through exactly as written. Used for dropped documents in the main process
// and for pasted text in the editors.
function service(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    codeBlockStyle: 'fenced'
  })
  // GitHub's flavour, except tables, which follow their own rule below.
  td.use([highlightedCodeBlock, strikethrough, taskListItems])
  td.remove(['style', 'script', 'meta', 'title', 'head', 'noscript'])
  // One space after the list marker, as people write lists, instead of turndown's three.
  td.addRule('listItem', {
    filter: 'li',
    replacement(content, node) {
      const parent = node.parentNode as HTMLElement | null
      let prefix = '- '
      if (parent?.nodeName === 'OL') {
        prefix = `${listStart(parent) + Array.prototype.indexOf.call(parent.children, node)}. `
      }
      // Items wrapped in paragraphs, as Google Docs and Word copy them, stay a tight list.
      const text = content
        .replace(/^\s+|\s+$/g, '')
        .replace(/\n[ \t]*\n(?=\s*([-*+]|\d+\.) )/g, '\n')
        .replace(/\n/gm, '\n' + ' '.repeat(prefix.length))
      return prefix + text + (node.nextSibling ? '\n' : '')
    }
  })
  // Google Docs wraps a whole copy in <b style="font-weight:normal">, and marks bold and
  // italic with inline styles on spans instead of tags.
  td.addRule('styledSpan', {
    filter: (node) => {
      const style = (node as HTMLElement).getAttribute?.('style') ?? ''
      return (
        (node.nodeName === 'SPAN' || node.nodeName === 'B') && /font-(weight|style)/.test(style)
      )
    },
    replacement(content, node) {
      const style = (node as HTMLElement).getAttribute('style') ?? ''
      if (!content.trim()) return content
      // Headings are bold by their nature; Docs says so on every heading's span.
      const bold = !inHeading(node) && /font-weight:\s*(bold|[6-9]00)/.test(style)
      const italic = /font-style:\s*italic/.test(style)
      const [lead, core, trail] = content.match(/^(\s*)([\s\S]*?)(\s*)$/)!.slice(1)
      const mark = (bold ? '**' : '') + (italic ? '*' : '')
      const close = (italic ? '*' : '') + (bold ? '**' : '')
      return lead + mark + core + close + trail
    }
  })
  // A heading on several lines, e.g. split by a line break for the layout, stays one heading.
  td.addRule('heading', {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    replacement(content, node) {
      const text = content.replace(/\s*\n\s*/g, ' ').trim()
      return text ? `\n\n${'#'.repeat(Number(node.nodeName[1]))} ${text}\n\n` : ''
    }
  })
  // Word marks headings bold as well.
  td.addRule('headingBold', {
    filter: (node) => (node.nodeName === 'STRONG' || node.nodeName === 'B') && inHeading(node),
    replacement: (content) => content
  })
  // Tables become Markdown tables with the first row as their header, whatever the source
  // marks as header cells: Word marks every row or none. A table whose cells hold lists,
  // pictures or tables of their own stays HTML, on one line so Markdown keeps it whole.
  td.addRule('table', {
    filter: 'table',
    replacement(_content, node) {
      const table = node as HTMLElement
      const rows = tableRows(table)
      if (rows.length === 0) return ''
      if (table.querySelector('td table, th table, td ul, th ul, td ol, th ol, td img, th img')) {
        return '\n\n' + table.outerHTML.replace(/\s*\n\s*/g, ' ') + '\n\n'
      }
      const cells = rows.map((row) =>
        Array.from(row.children)
          .filter((c) => c.nodeName === 'TD' || c.nodeName === 'TH')
          .map((c) => cellText(c as HTMLElement))
      )
      const width = Math.max(...cells.map((r) => r.length))
      const line = (r: string[]): string =>
        '| ' + Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ') + ' |'
      const header = cells[0].map((c) => c.replace(/^\*\*([\s\S]*)\*\*$/, '$1'))
      const rule = '|' + ' --- |'.repeat(width)
      return '\n\n' + [line(header), rule, ...cells.slice(1).map(line)].join('\n') + '\n\n'
    }
  })
  return td
}

// Where a numbered list starts. Word continues numbered steps across a picture between
// them, which arrives as separate lists; a list right after another with only pictures in
// between continues its count.
function listStart(ol: HTMLElement): number {
  const start = ol.getAttribute('start')
  if (start) return Number(start)
  let prev = ol.previousSibling
  while (prev && isPictureOnly(prev)) prev = prev.previousSibling
  if (prev?.nodeName !== 'OL') return 1
  const items = Array.from((prev as HTMLElement).children).filter((c) => c.nodeName === 'LI')
  return listStart(prev as HTMLElement) + items.length
}

function isPictureOnly(node: Node): boolean {
  if (node.nodeType === 3) return !(node.textContent ?? '').trim()
  const el = node as HTMLElement
  return (
    el.nodeName === 'IMG' ||
    (el.nodeName === 'P' && !!el.querySelector?.('img') && !el.textContent?.trim())
  )
}

function inHeading(node: Node): boolean {
  for (let n = node.parentNode; n; n = n.parentNode) if (/^H[1-6]$/.test(n.nodeName)) return true
  return false
}

// The rows of a table itself, not of tables inside its cells.
function tableRows(table: HTMLElement): HTMLElement[] {
  const rows: HTMLElement[] = []
  for (const child of Array.from(table.children)) {
    if (child.nodeName === 'TR') rows.push(child as HTMLElement)
    else if (/^(THEAD|TBODY|TFOOT)$/.test(child.nodeName)) {
      for (const row of Array.from(child.children))
        if (row.nodeName === 'TR') rows.push(row as HTMLElement)
    }
  }
  return rows
}

// A cell's text as Markdown on one line: paragraphs joined by line breaks, pipes escaped.
function cellText(cell: HTMLElement): string {
  return service()
    .turndown(cell.innerHTML)
    .trim()
    .replace(/\n{2,}/g, '<br>')
    .replace(/\n/g, ' ')
    .replace(/\|/g, '\\|')
}

// Google rewrites links in some copies as https://www.google.com/url?q=<target>&…
function cleanHref(href: string): string {
  const m = href.match(/^https?:\/\/(?:www\.)?google\.com\/url\?(?:.*&)?q=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : href
}

// Pasting can map addresses, e.g. full addresses of the site's own pages to the paths
// its pages use.
export interface MarkdownOptions {
  link?: (href: string) => string
}

export function htmlToMarkdown(html: string, options: MarkdownOptions = {}): string {
  const td = service()
  td.addRule('link', {
    filter: (node) => node.nodeName === 'A' && !!(node as HTMLElement).getAttribute('href'),
    replacement(content, node) {
      const raw = cleanHref((node as HTMLElement).getAttribute('href') ?? '')
      const href = options.link ? options.link(raw) : raw
      const title = (node as HTMLElement).getAttribute('title')
      // A link around blocks, such as a button holding a paragraph, keeps its text on one
      // line; a break inside the brackets would end the link.
      const text = content.replace(/\s*\n\s*/g, ' ').trim()
      if (!text) return content
      return `[${text}](${href}${title ? ` "${title.replace(/"/g, '\\"')}"` : ''})`
    }
  })
  return (
    td
      .turndown(html)
      // Word keeps empty paragraphs styled as headings; they carry nothing. A picture on
      // its own in such a paragraph is a picture, not a heading.
      .replace(/^#{1,6}[ \t]*$/gm, '')
      .replace(/^#{1,6}[ \t]+(!\[[^\]]*\]\([^)]*\))[ \t]*$/gm, '$1')
      // A number opening a heading needs no escaping; in a paragraph it would be a list.
      .replace(/^(#{1,6} +\d+)\\\./gm, '$1.')
      // Bullets typed by hand, one paragraph each, become a list.
      .replace(/^[•●▪◦][ \t]*/gm, '- ')
      .replace(/^(- .*)\n\n(?=- )/gm, '$1\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

// Whether plain text is already Markdown worth keeping as it is: copies from code
// editors, chat apps or Google Docs' "Copy as Markdown" carry HTML that only styles it.
export function looksLikeMarkdown(text: string): boolean {
  return (
    /\[[^\]\n]+\]\([^)\s]+\)/.test(text) ||
    /^#{1,6} \S/m.test(text) ||
    /^(\s*[-*+] |\s*\d+\. ).+\n(\s*[-*+] |\s*\d+\. )/m.test(text) ||
    /\*\*[^*\n]+\*\*/.test(text)
  )
}

// HTML that adds no structure to its plain text: only containers, spans, line breaks and
// preformatted blocks, as code editors put on the clipboard.
export function onlyStylesText(html: string): boolean {
  const tags = html.match(/<\/?([a-z0-9]+)/gi) ?? []
  return tags.every((t) => /^<\/?(html|head|body|meta|style|div|span|br|pre|code|font)$/i.test(t))
}
