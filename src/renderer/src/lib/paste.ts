import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { htmlToMarkdown, looksLikeMarkdown, onlyStylesText } from '../../../shared/markdown'
import { siteAddress, siteFile } from './linkCheck'

export interface PasteHooks {
  // Saves a pasted picture, given as data or by address, into the site and returns its
  // address there; without it, pictures pasted as data are left out.
  pasteImage?: (source: Blob | string) => Promise<string | null>
  // Takes a whole page, settings and text, pasted into an empty body; true when done.
  pasteDocument?: (frontmatter: string, body: string) => boolean
}

const fence = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

// Pasting into a Markdown editor: formatted text from Google Docs, Word or a web page
// becomes Markdown with its links; text that already is Markdown, or carries formatting
// that only styles it, pastes as it is; a pasted picture is saved into the site.
export function pasteMarkdown(hooks: { current: PasteHooks | undefined }): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const data = event.clipboardData
      if (!data) return false
      const html = data.getData('text/html')
      const plain = data.getData('text/plain')
      const pictures = [...data.files].filter((f) => f.type.startsWith('image/'))
      const { pasteImage, pasteDocument } = hooks.current ?? {}

      if (pictures.length > 0 && (!html || onlyPicture(html))) {
        if (!pasteImage) return false
        event.preventDefault()
        void insertAsync(view, async () => {
          const urls = await Promise.all(pictures.map((p) => pasteImage(p)))
          return urls
            .filter(Boolean)
            .map((u) => `![Description](${u})`)
            .join('\n')
        })
        return true
      }

      if (!html || looksLikeMarkdown(plain) || onlyStylesText(html)) {
        const page = plain.match(fence)
        if (page && pasteDocument && view.state.doc.toString().trim() === '') {
          if (pasteDocument(page[1], plain.slice(page[0].length))) {
            event.preventDefault()
            return true
          }
        }
        return false
      }

      event.preventDefault()
      void insertAsync(view, async () => {
        const doc = new DOMParser().parseFromString(html, 'text/html')
        // The site's own pictures are used where they are; others are saved once each.
        const saved = new Map<string, Promise<string | null>>()
        for (const img of [...doc.querySelectorAll('img')]) {
          const src = img.getAttribute('src') ?? ''
          const own = src ? siteFile(src) : null
          if (own === null && src && pasteImage && !saved.has(src)) {
            saved.set(
              src,
              pasteImage(src).catch(() => null)
            )
          }
          const result = own ?? (await saved.get(src)) ?? null
          if (result) img.setAttribute('src', result)
          else if (src.startsWith('data:') || !src) img.remove()
          if (!img.getAttribute('alt')) img.setAttribute('alt', 'Description')
        }
        return htmlToMarkdown(doc.body.innerHTML, { link: siteAddress }).trimEnd()
      })
      return true
    }
  })
}

const onlyPicture = (html: string): boolean =>
  html
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim() === ''

// Replaces the selection with text that takes a moment to produce, e.g. after saving
// pictures. The text goes where the paste happened, kept inside the text should it have
// become shorter in the meantime.
async function insertAsync(view: EditorView, produce: () => Promise<string>): Promise<void> {
  const { from, to } = view.state.selection.main
  const text = await produce()
  if (!text) return
  const length = view.state.doc.length
  const at = Math.min(from, length)
  view.dispatch({
    changes: { from: at, to: Math.min(to, length), insert: text },
    selection: { anchor: at + text.length },
    scrollIntoView: true
  })
  view.focus()
}
