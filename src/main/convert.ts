import { promises as fs } from 'fs'
import { basename, extname, join } from 'path'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

// Documents become Markdown by rule, not by retyping: headings, lists, emphasis, tables
// and links come through exactly as written.
function turndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    codeBlockStyle: 'fenced'
  })
  service.use(gfm)
  // One space after the list marker, as people write lists, instead of turndown's three.
  service.addRule('listItem', {
    filter: 'li',
    replacement(content, node) {
      const parent = node.parentNode as HTMLElement | null
      let prefix = '- '
      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? 1)
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `
      }
      const text = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/\n/gm, '\n' + ' '.repeat(prefix.length))
      return prefix + text + (node.nextSibling && !/\n$/.test(text) ? '\n' : '')
    }
  })
  return service
}

export function htmlToMarkdown(html: string): string {
  return (
    turndown()
      .turndown(html)
      // Word keeps empty paragraphs styled as headings; they carry nothing.
      .replace(/^#{1,6}[ \t]*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

// Converts a Word document into <dir>/<name>.md, its pictures into <name>-image-<n>.<ext>
// beside it, and returns the Markdown file's path.
export async function docxToMarkdown(src: string, dir: string): Promise<string> {
  const name = basename(src, extname(src))
  let count = 0
  const result = await mammoth.convertToHtml(
    { path: src },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const ext = (image.contentType.split('/')[1] ?? 'png').replace('jpeg', 'jpg')
        const file = `${name}-image-${++count}.${ext}`
        await fs.writeFile(join(dir, file), Buffer.from(await image.readAsBase64String(), 'base64'))
        return { src: file }
      })
    }
  )
  const out = join(dir, `${name}.md`)
  await fs.writeFile(out, htmlToMarkdown(result.value))
  return out
}

export async function htmlFileToMarkdown(src: string, dir: string): Promise<string> {
  const out = join(dir, `${basename(src, extname(src))}.md`)
  await fs.writeFile(out, htmlToMarkdown(await fs.readFile(src, 'utf8')))
  return out
}
