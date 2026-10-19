import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { basename, extname, join } from 'path'
import type { ImportedDocument } from '../shared/types'
import mammoth from 'mammoth'
import { htmlToMarkdown } from '../shared/markdown'

// Converts a Word document into <dir>/<name>.md, its pictures into <name>-image-<n>.<ext>
// beside it, and returns the Markdown file's path.
export async function docxToMarkdown(src: string, dir: string): Promise<string> {
  // Plain names, so the Markdown can refer to the pictures without quoting.
  const name =
    basename(src, extname(src))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'document'
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
  // Pictures without a description in the document get the placeholder Galley uses for
  // dropped pictures, so the missing description stands out.
  await fs.writeFile(out, htmlToMarkdown(result.value).replace(/!\[\]\(/g, '![Description]('))
  return out
}

// A document for a new page, converted in a folder of its own under the temp folder.
export async function importDocument(src: string): Promise<ImportedDocument> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'galley-import-'))
  const ext = extname(src).toLowerCase()
  const md =
    ext === '.docx'
      ? await docxToMarkdown(src, dir)
      : ext === '.html' || ext === '.htm'
        ? await htmlFileToMarkdown(src, dir)
        : src
  const images = (await fs.readdir(dir)).filter((f) => f !== basename(md)).map((f) => join(dir, f))
  return { name: basename(src, extname(src)), markdown: await fs.readFile(md, 'utf8'), images }
}

export async function htmlFileToMarkdown(src: string, dir: string): Promise<string> {
  const out = join(dir, `${basename(src, extname(src))}.md`)
  await fs.writeFile(out, htmlToMarkdown(await fs.readFile(src, 'utf8')))
  return out
}
