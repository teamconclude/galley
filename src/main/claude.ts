import { app } from 'electron'
import { existsSync, promises as fs } from 'fs'
import { basename, extname, join } from 'path'
import type { ClaudeMode, Preferences, SiteInfo } from '../shared/types'
import { docxToMarkdown, htmlFileToMarkdown } from './convert'
import { isDev } from './env'

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

// Galley's manual and the site contract, which Claude reads to answer questions about Galley.
// The renderer bundles the manual's text, so the packaged app carries these two files in its
// resources as well (see electron-builder.yml).
const docsDir = (): string =>
  isDev ? join(app.getAppPath(), 'docs') : join(process.resourcesPath, 'docs')
const manualFile = (): string => join(docsDir(), 'manual', 'README.md')
const contractFile = (): string => join(docsDir(), 'site-contract.md')

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
- Galley's manual is ${manualFile()}. When the editor asks how to do something in Galley \
or why Galley behaves as it does, read the manual and answer from it, naming the buttons and \
menu items it names; do not guess at features it does not describe. What a site needs for \
Galley's features to work is in ${contractFile()}.
- Answer briefly and in plain words, without technical terms where possible.`
}

// What Claude may do without asking and what it may never do, in either form of the pane.
function rules(hosts: string[]): Record<string, unknown> {
  const rule = (dir: string): string => `//${dir.replace(/^\//, '')}/**`
  return {
    // The pane is white whatever theme the user's own Claude Code uses; a dark one draws
    // some text in white there.
    theme: 'light',
    permissions: {
      allow: [
        `Read(${rule(inbox())})`,
        `Read(${rule(docsDir())})`,
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
    }
  }
}

// The terminal hears which page is open from a hook on every prompt; the chat sends it with
// each message instead, where the editor sees it and can leave it out.
async function writeSettings(hosts: string[]): Promise<void> {
  const settings = {
    ...rules(hosts),
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

// What one start of the pane is given, for either of its two forms: the terminal passes it
// to the CLI as flags, the chat to the Agent SDK as options. Hosts are the site's own
// addresses, which Claude may fetch to compare with the live pages.
export interface ClaudeLaunch {
  settings: string
  // Folders outside the checkout Claude may read: the inbox and Galley's documentation.
  dirs: string[]
  // The settings' rules without the terminal's hook, for the chat.
  rules: Record<string, unknown>
  rolePrompt: string
  plugin: string | null
  model: string | null
  mode: ClaudeMode
}

export async function claudeLaunch(
  site: SiteInfo,
  prefs: Preferences,
  hosts: string[]
): Promise<ClaudeLaunch> {
  await fs.mkdir(inbox(), { recursive: true })
  await Promise.all([writeSettings(hosts), tidyInbox()])
  return {
    settings: settingsFile(),
    rules: rules(hosts),
    dirs: [inbox(), docsDir()],
    rolePrompt: rolePrompt(site),
    plugin: existsSync(pluginDir()) ? pluginDir() : null,
    model: prefs.claudeModel === 'default' ? null : prefs.claudeModel,
    mode: prefs.claudeMode
  }
}

// The command-line arguments for the terminal.
export function claudeArgs(launch: ClaudeLaunch): string[] {
  const args = [
    '--settings',
    launch.settings,
    '--permission-mode',
    'acceptEdits',
    '--add-dir',
    ...launch.dirs,
    '--append-system-prompt',
    launch.rolePrompt
  ]
  if (launch.plugin) args.push('--plugin-dir', launch.plugin)
  if (launch.model) args.push('--model', launch.model)
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
  await fs.writeFile(contextFile(), path ? pageContext(path, url) + '\n' : '')
}

// What Claude is told about the page the editor has open.
export const pageContext = (path: string, url: string | null): string =>
  `The editor has ${path} open in Galley${url ? `; on the site it is ${url}` : ''}. ` +
  '"This page" means that file.'
