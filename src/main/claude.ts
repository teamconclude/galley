import { app } from 'electron'
import { existsSync, promises as fs } from 'fs'
import { basename, extname, join } from 'path'
import type { Preferences, SiteInfo } from '../shared/types'
import { docxToMarkdown, htmlFileToMarkdown } from './convert'

// What the Claude pane is started with: the editor's role, permissions that suit it, the
// files dropped on the pane, the page that is open, and Galley's own skills. Everything
// lives under Galley's user data, so the site checkout gets no files of Galley's.
const folder = (): string => join(app.getPath('userData'), 'claude')
const inbox = (): string => join(folder(), 'inbox')
const contextFile = (): string => join(folder(), 'context.md')
const settingsFile = (): string => join(folder(), 'settings.json')
const inboxDays = 14

// Galley's plugin ships in resources/, which the packaged app keeps outside the asar.
const pluginDir = (): string =>
  join(app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'), 'resources', 'claude-plugin')

export const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

function rolePrompt(site: SiteInfo): string {
  return `You are working inside Galley, the desktop editor for this Hugo site, for a content \
editor who writes and publishes pages but is not a developer.

- Galley handles branches, commits, pushing, merging and publishing in its Changes tab. Do \
not run git commands that change anything and do not use GitHub. When the editor wants to \
save, share or publish work, point them to the Changes tab.
- Do exactly what is asked and nothing more. Text from a document is copied with the same \
wording, headings and links. Never add, remove or change a link unless asked; if a link \
looks wrong, say so instead of fixing it.
- Pages live in ${site.contentDir}/. Images live in ${site.imagesDir}/<section>/ and pages \
refer to them as ${site.imagesUrl}/<section>/<file>. File names are lowercase with hyphens.
- Galley previews the open page and saves edits as they happen, so there is no need to run \
Hugo or a server.
- Files the editor drops on this pane arrive in ${inbox()}. Word and web documents arrive \
converted to Markdown, with the same text and links; work from that file.
- Answer briefly and in plain words, without technical terms where possible.`
}

async function writeSettings(hosts: string[]): Promise<void> {
  const inboxRule = `//${inbox().replace(/^\//, '')}/**`
  const settings = {
    // The pane is white whatever theme the user's own Claude Code uses; a dark one draws
    // some text in white there.
    theme: 'light',
    permissions: {
      allow: [
        `Read(${inboxRule})`,
        'Bash(hugo list *)',
        'Bash(git status *)',
        'Bash(git diff *)',
        'Bash(git log *)',
        'Bash(git show *)',
        'Bash(sips *)',
        ...hosts.map((h) => `WebFetch(domain:${h})`)
      ],
      deny: [
        'Bash(git add *)',
        'Bash(git commit *)',
        'Bash(git push *)',
        'Bash(git pull *)',
        'Bash(git fetch *)',
        'Bash(git merge *)',
        'Bash(git rebase *)',
        'Bash(git reset *)',
        'Bash(git restore *)',
        'Bash(git checkout *)',
        'Bash(git switch *)',
        'Bash(git branch *)',
        'Bash(git stash *)',
        'Bash(git tag *)',
        'Bash(git cherry-pick *)',
        'Bash(git revert *)',
        'Bash(gh *)',
        'Bash(curl *)'
      ]
    },
    hooks: {
      UserPromptSubmit: [
        {
          hooks: [
            { type: 'command', command: `cat ${shellQuote(contextFile())} 2>/dev/null || true` }
          ]
        }
      ]
    }
  }
  await fs.writeFile(settingsFile(), JSON.stringify(settings, null, 2))
}

// Dropped files from earlier sessions are cleared after a while.
async function tidyInbox(): Promise<void> {
  const cutoff = Date.now() - inboxDays * 24 * 3600_000
  for (const name of await fs.readdir(inbox()).catch(() => [] as string[])) {
    const path = join(inbox(), name)
    const stat = await fs.stat(path).catch(() => null)
    if (stat && stat.mtimeMs < cutoff) await fs.rm(path, { recursive: true, force: true })
  }
}

// The command-line arguments for one start of the pane. Hosts are the site's own addresses,
// which Claude may fetch to compare with the live pages.
export async function claudeArgs(
  site: SiteInfo,
  prefs: Preferences,
  hosts: string[]
): Promise<string[]> {
  await fs.mkdir(inbox(), { recursive: true })
  await Promise.all([writeSettings(hosts), tidyInbox()])
  const args = [
    '--settings',
    settingsFile(),
    '--permission-mode',
    'acceptEdits',
    '--add-dir',
    inbox(),
    '--append-system-prompt',
    rolePrompt(site)
  ]
  if (existsSync(pluginDir())) args.push('--plugin-dir', pluginDir())
  if (prefs.claudeModel !== 'default') args.push('--model', prefs.claudeModel)
  return args
}

// Word and web documents are handed over as Markdown, converted by rule so their words
// and links arrive exactly; the original stays beside it.
async function asMarkdown(path: string): Promise<string> {
  const ext = extname(path).toLowerCase()
  if (ext === '.docx') return docxToMarkdown(path, inbox())
  if (ext === '.html' || ext === '.htm') return htmlFileToMarkdown(path, inbox())
  return path
}

// Copies dropped files into the inbox under plain names, so the paths need no quoting and
// Claude reads them without asking.
export async function receiveDrops(paths: string[]): Promise<string[]> {
  await fs.mkdir(inbox(), { recursive: true })
  const out: string[] = []
  for (const src of paths) {
    const ext = extname(src).toLowerCase()
    const base =
      basename(src, extname(src))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'file'
    let name = base + ext
    for (let i = 2; existsSync(join(inbox(), name)); i++) name = `${base}-${i}${ext}`
    const copy = join(inbox(), name)
    await fs.cp(src, copy, { recursive: true })
    out.push(await asMarkdown(copy).catch(() => copy))
  }
  return out
}

// What the prompt hook tells Claude about the editor's screen.
export async function setContext(path: string | null, url: string | null): Promise<void> {
  await fs.mkdir(folder(), { recursive: true })
  const text = path
    ? `The editor has ${path} open in Galley${url ? `; on the site it is ${url}` : ''}. ` +
      '"This page" means that file.\n'
    : ''
  await fs.writeFile(contextFile(), text)
}
