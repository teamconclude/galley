import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

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
  td.use(gfm)
  td.remove(['style', 'script', 'meta', 'title', 'head', 'noscript'])
  // One space after the list marker, as people write lists, instead of turndown's three.
  td.addRule('listItem', {
    filter: 'li',
    replacement(content, node) {
      const parent = node.parentNode as HTMLElement | null
      let prefix = '- '
      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? 1)
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `
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
      const inHeading = !!(node as HTMLElement).closest?.('h1, h2, h3, h4, h5, h6')
      const bold = !inHeading && /font-weight:\s*(bold|[6-9]00)/.test(style)
      const italic = /font-style:\s*italic/.test(style)
      const [lead, core, trail] = content.match(/^(\s*)([\s\S]*?)(\s*)$/)!.slice(1)
      const mark = (bold ? '**' : '') + (italic ? '*' : '')
      const close = (italic ? '*' : '') + (bold ? '**' : '')
      return lead + mark + core + close + trail
    }
  })
  return td
}

// Google rewrites links in some copies as https://www.google.com/url?q=<target>&…
function cleanHref(href: string): string {
  const m = href.match(/^https?:\/\/(?:www\.)?google\.com\/url\?(?:.*&)?q=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : href
}

export function htmlToMarkdown(html: string): string {
  const td = service()
  td.addRule('link', {
    filter: (node) => node.nodeName === 'A' && !!(node as HTMLElement).getAttribute('href'),
    replacement(content, node) {
      const href = cleanHref((node as HTMLElement).getAttribute('href') ?? '')
      const title = (node as HTMLElement).getAttribute('title')
      if (!content.trim()) return content
      return `[${content}](${href}${title ? ` "${title.replace(/"/g, '\\"')}"` : ''})`
    }
  })
  return (
    td
      .turndown(html)
      // Word keeps empty paragraphs styled as headings; they carry nothing. A picture on
      // its own in such a paragraph is a picture, not a heading.
      .replace(/^#{1,6}[ \t]*$/gm, '')
      .replace(/^#{1,6}[ \t]+(!\[[^\]]*\]\([^)]*\))[ \t]*$/gm, '$1')
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
