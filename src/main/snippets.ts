import { promises as fs } from 'fs'
import { basename, join } from 'path'
import { humanize } from '../shared/fields'
import type { Snippet } from '../shared/types'

// Hugo's embedded shortcodes worth inserting; a site's own of the same name wins.
const embedded: Snippet[] = [
  { name: 'youtube', label: 'YouTube video', text: '{{< youtube VIDEO_ID >}}' },
  { name: 'vimeo', label: 'Vimeo video', text: '{{< vimeo VIDEO_ID >}}' },
  { name: 'x', label: 'X post', text: '{{< x user="" id="" >}}' },
  { name: 'figure', label: 'Figure', text: '{{< figure src="" alt="" caption="" >}}' },
  { name: 'details', label: 'Details', text: '{{< details summary="" >}}\n\n{{< /details >}}' }
]

// The site's shortcodes as insertable text: one empty argument per `.Get`, positional or
// named, and a closing tag when the template uses `.Inner`.
export async function snippets(root: string): Promise<Snippet[]> {
  const dir = join(root, 'layouts', 'shortcodes')
  const own = new Map<string, Snippet>()
  for (const entry of await fs.readdir(dir).catch(() => [] as string[])) {
    if (!entry.endsWith('.html')) continue
    const name = basename(entry, '.html')
    const text = await fs.readFile(join(dir, entry), 'utf8').catch(() => '')
    own.set(name, { name, label: humanize(name), text: snippetFor(name, text) })
  }
  const all = [...embedded.filter((s) => !own.has(s.name)), ...own.values()]
  return all.sort((a, b) => a.label.localeCompare(b.label))
}

function snippetFor(name: string, template: string): string {
  let positional = 0
  const named: string[] = []
  for (const m of template.matchAll(/\.Get\s+(?:(\d+)|"([^"]+)")/g)) {
    if (m[1] !== undefined) positional = Math.max(positional, Number(m[1]) + 1)
    else if (!named.includes(m[2])) named.push(m[2])
  }
  const args = [...Array<string>(positional).fill('""'), ...named.map((n) => `${n}=""`)]
  const open = `{{< ${[name, ...args].join(' ')} >}}`
  return /\.Inner\b/.test(template) ? `${open}text{{< /${name} >}}` : open
}
