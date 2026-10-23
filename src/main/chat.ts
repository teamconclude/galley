import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { basename } from 'path'
import { z } from 'zod'
import type {
  CanUseTool,
  Options,
  PermissionResult,
  Query,
  SDKMessage,
  SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import type {
  ChatAnswer,
  ChatItem,
  ChatQuestion,
  ChatRequest,
  ChatStatus,
  ClaudeMode
} from '../shared/types'
import { pageContext, type ClaudeLaunch } from './claude'
import { log } from './log'
import { loginPath } from './shell'
import { claudeProcess, type ClaudeProcess } from './tools'

export interface ChatEvents {
  status: (status: ChatStatus) => void
  item: (item: ChatItem) => void
  request: (request: ChatRequest) => void
  // A request that no longer needs an answer, answered or not.
  settled: (id: string) => void
  // Claude asks Galley to commit, as the Commit button would; the answer is for Claude.
  commit: (message: string, files: string[] | null) => Promise<string>
}

// How a commit message reads, for the message Galley asks for and for commits Claude
// makes from the chat.
const commitStyle = `A commit message is for colleagues who edit the same site: a first line \
of at most 60 characters that says what changed on the site, in plain words and the \
imperative ("Add the pricing FAQ", "Fix the broken link on the about page"), and, when the \
change is more than one thing or the reason is not obvious, a blank line and a few short \
lines on what and why. No file paths unless they help, no technical terms, no emoji.`

// Galley commits for Claude, so that the branch on GitHub follows as it does after the
// Commit button, and the editor's checks apply.
const commitPrompt = `
- In this chat you can also commit for the editor: when they ask you to, use the commit \
tool of the galley server, never git. Without files it commits the changes ticked in the Changes panel; name files only \
when the editor wants just some of them. Look at the changes first (git status, git diff, \
and read new files) to write the message. ${commitStyle}`

// The SDK is an ES module; the main process loads it when the chat first starts.
type Sdk = typeof import('@anthropic-ai/claude-agent-sdk')
let sdk: Promise<Sdk> | null = null
const loadSdk = (): Promise<Sdk> => (sdk ??= import('@anthropic-ai/claude-agent-sdk'))

// The editor's messages, handed to Claude one by one as they are written.
class Outbox implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = []
  private wake: (() => void) | null = null
  private closed = false

  push(message: SDKUserMessage): void {
    this.queue.push(message)
    this.wake?.()
  }

  close(): void {
    this.closed = true
    this.wake?.()
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    while (!this.closed) {
      const next = this.queue.shift()
      if (next) yield next
      else await new Promise<void>((resolve) => (this.wake = resolve))
      this.wake = null
    }
  }
}

interface Account {
  loggedIn: boolean
  label?: string
}

// Asks the installed Claude Code whose account it is signed in to. Galley never reads the
// credentials themselves; signing in happens in Claude Code's own flow.
function account(proc: ClaudeProcess): Promise<Account> {
  return new Promise((resolve) => {
    execFile(
      proc.bin!,
      ['auth', 'status', '--json'],
      { env: proc.env, timeout: 20_000 },
      (_err, stdout) => {
        try {
          const s = JSON.parse(stdout) as { loggedIn?: boolean; email?: string; orgName?: string }
          const label = s.email ? s.email + (s.orgName ? ` (${s.orgName})` : '') : undefined
          resolve({ loggedIn: s.loggedIn !== false, label })
        } catch {
          // An older Claude Code without the command: let the session find out.
          resolve({ loggedIn: true })
        }
      }
    )
  })
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// The file a tool call is about, relative to the checkout.
function fileOf(input: Record<string, unknown>, cwd: string): string {
  const path = str(input['file_path'] ?? input['notebook_path'] ?? input['path'])
  return path.startsWith(cwd + '/') ? path.slice(cwd.length + 1) : basename(path)
}

const commitTool = 'mcp__galley__commit'
const firstLine = (input: Record<string, unknown>): string => str(input['message']).split('\n')[0]
const committed = (input: Record<string, unknown>): string => {
  const files = Array.isArray(input['files']) ? input['files'].length : 0
  return files === 0 ? 'the ticked changes' : files === 1 ? '1 file' : `${files} files`
}

// What Claude asks leave for, to follow "Claude wants to".
function asking(tool: string, input: Record<string, unknown>, cwd: string): string {
  switch (tool) {
    case 'Read':
      return `read ${fileOf(input, cwd)}`
    case 'Edit':
    case 'NotebookEdit':
      return `change ${fileOf(input, cwd)}`
    case 'Write':
      return `write ${fileOf(input, cwd)}`
    case 'Bash': {
      const what = str(input['description'])
      return what ? what[0].toLowerCase() + what.slice(1) : 'run a command'
    }
    case commitTool:
      return `commit ${committed(input)} with the message “${firstLine(input)}”`
    case 'WebFetch':
      return `open ${str(input['url'])}`
    case 'WebSearch':
      return `search the web for “${str(input['query'])}”`
    default:
      return `use ${tool}`
  }
}

// Claude's tool calls in the editor's words, with what is worth a look on request.
function describe(
  tool: string,
  input: Record<string, unknown>,
  cwd: string
): { summary: string; detail?: string } {
  const file = (): string => fileOf(input, cwd)
  switch (tool) {
    case 'Read':
      return { summary: `Read ${file()}` }
    case 'Edit': {
      const lines = (text: string, mark: string): string =>
        text
          .split('\n')
          .map((l) => mark + l)
          .join('\n')
      return {
        summary: `Edited ${file()}`,
        detail: `${lines(str(input['old_string']), '- ')}\n${lines(str(input['new_string']), '+ ')}`
      }
    }
    case 'Write':
      return { summary: `Wrote ${file()}` }
    case 'NotebookEdit':
      return { summary: `Edited ${file()}` }
    case 'Glob':
      return { summary: `Looked for files named ${str(input['pattern'])}` }
    case 'Grep':
      return { summary: `Searched for “${str(input['pattern'])}”` }
    case 'Bash':
      return {
        summary: str(input['description']) || 'Ran a command',
        detail: str(input['command'])
      }
    case 'WebFetch':
      return { summary: `Opened ${str(input['url'])}` }
    case 'WebSearch':
      return { summary: `Searched the web for “${str(input['query'])}”` }
    case 'Skill':
      return { summary: `Followed the ${str(input['skill']).replace(/^.*:/, '')} instructions` }
    case commitTool:
      return {
        summary: `Asked Galley to commit ${committed(input)}`,
        detail: str(input['message'])
      }
    case 'TodoWrite': {
      const todos = Array.isArray(input['todos'])
        ? (input['todos'] as Record<string, unknown>[])
        : []
      const mark = (s: unknown): string =>
        s === 'completed' ? '✓' : s === 'in_progress' ? '›' : '·'
      return {
        summary: 'Updated its plan',
        detail: todos.map((t) => `${mark(t['status'])} ${str(t['content'])}`).join('\n')
      }
    }
    case 'Agent':
    case 'Task':
      return { summary: `Handed a part to a helper: ${str(input['description'])}` }
    default:
      return { summary: tool }
  }
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((b: { type?: string; text?: string }) => (b.type === 'text' ? (b.text ?? '') : ''))
    .join('\n')
}

// Claude in the pane as a chat: the installed Claude Code, signed in to the editor's own
// account, driven through the Agent SDK. Galley shows what it says and does, and asks the
// editor when Claude needs leave or an answer.
export class ClaudeChat {
  private query: Query | null = null
  private outbox: Outbox | null = null
  // Bumped on every start and stop, so a session that was replaced goes quiet.
  private generation = 0
  private status: ChatStatus = { state: 'stopped' }
  private cwd = ''
  private pending = new Map<string, (answer: ChatAnswer) => void>()
  private steps = new Map<string, ChatItem & { kind: 'step' }>()
  // The reply being written, as stream events: its message and its text blocks by index.
  private writing = ''
  private texts = new Map<number, ChatItem & { kind: 'text' }>()
  private streamed = new Set<string>()
  // The editor stopped Claude, so the turn's end is no error.
  private interrupted = false
  // The mode the editor chose, which the session reports back at each turn.
  private mode: ClaudeMode = 'auto'

  constructor(private events: ChatEvents) {}

  async start(cwd: string, launch: () => Promise<ClaudeLaunch>): Promise<void> {
    this.stop()
    const generation = this.generation
    const current = (): boolean => generation === this.generation
    this.cwd = cwd
    this.setStatus({ state: 'starting' })
    try {
      const proc = await claudeProcess()
      if (!current()) return
      if (!proc.bin) return this.setStatus({ state: 'missing' })
      proc.env.PATH = [...proc.path, await loginPath()].join(':')
      const signedIn = await account(proc)
      if (!current()) return
      if (!signedIn.loggedIn) return this.setStatus({ state: 'signed-out' })
      const [{ query, createSdkMcpServer, tool }, l] = await Promise.all([loadSdk(), launch()])
      if (!current()) return
      const outbox = new Outbox()
      const galley = createSdkMcpServer({
        name: 'galley',
        tools: [
          tool(
            'commit',
            'Commits changes in Galley, which then brings the branch on GitHub up to date. ' +
              'Without files, the changes ticked in the Changes panel are committed.',
            {
              message: z.string().describe('The commit message'),
              files: z
                .array(z.string())
                .optional()
                .describe('Paths relative to the checkout, when only some changes go in')
            },
            async ({ message, files }) => ({
              content: [{ type: 'text', text: await this.events.commit(message, files ?? null) }]
            }),
            // Offered from the start, rather than found through a tool search first.
            { alwaysLoad: true }
          )
        ]
      })
      const q = query({
        prompt: outbox,
        options: {
          cwd,
          // The editor's own Claude Code, never a copy of Galley's.
          pathToClaudeCodeExecutable: proc.bin,
          env: proc.env,
          settings: l.rules as Options['settings'],
          permissionMode: l.mode,
          additionalDirectories: l.dirs,
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            append: l.rolePrompt + commitPrompt
          },
          mcpServers: { galley },
          plugins: l.plugin ? [{ type: 'local', path: l.plugin }] : [],
          model: l.model ?? undefined,
          includePartialMessages: true,
          canUseTool: this.canUseTool,
          stderr: (data) => log('claude:', data.trim())
        }
      })
      this.query = q
      this.outbox = outbox
      this.mode = l.mode
      this.setStatus({ state: 'ready', account: signedIn.label, mode: l.mode })
      void this.read(q, current)
      // Which model answers is known before the first message, from the session's models.
      void q
        .initializationResult()
        .then((r) => {
          const wanted = r.models.find((m) => m.value === (l.model ?? 'default'))
          const model = wanted?.resolvedModel ?? wanted?.displayName
          if (current() && model && !this.status.model) this.setStatus({ ...this.status, model })
        })
        .catch(() => {})
    } catch (e) {
      if (current()) this.setStatus({ state: 'stopped', error: (e as Error).message })
    }
  }

  // The open page goes along as a note ahead of the message, unless the editor left it out.
  send(text: string, files: string[], page: { path: string; url: string | null } | null): void {
    if (!this.outbox) return
    const id = randomUUID()
    this.events.item({
      kind: 'user',
      id,
      text,
      files: files.map((f) => basename(f)),
      page: page?.path
    })
    const content = [
      page && `<context>${pageContext(page.path, page.url)}</context>`,
      text,
      files.length && `Files I handed you:\n${files.join('\n')}`
    ]
      .filter(Boolean)
      .join('\n\n')
    this.outbox.push({
      type: 'user',
      message: { role: 'user', content },
      parent_tool_use_id: null,
      uuid: id as SDKUserMessage['uuid']
    })
    this.setStatus({ ...this.status, state: 'busy' })
  }

  setMode(mode: ClaudeMode): void {
    this.mode = mode
    this.setStatus({ ...this.status, mode })
    void this.query?.setPermissionMode(mode).catch(() => {})
  }

  // A model name such as 'opus', or null for Claude Code's own choice.
  setModel(model: string | null): void {
    if (!this.query) return
    this.setStatus({ ...this.status, model: undefined })
    void this.query.setModel(model ?? undefined).catch(() => {})
  }

  answer(id: string, answer: ChatAnswer): void {
    this.pending.get(id)?.(answer)
  }

  interrupt(): void {
    if (!this.query || this.status.state !== 'busy') return
    this.interrupted = true
    void this.query.interrupt().catch(() => {})
  }

  stop(): void {
    this.generation++
    for (const settle of [...this.pending.values()]) settle({ kind: 'permission', allow: false })
    this.outbox?.close()
    this.query?.close()
    this.query = null
    this.outbox = null
    this.steps.clear()
    this.texts.clear()
    this.streamed.clear()
  }

  private setStatus(status: ChatStatus): void {
    this.status = status
    this.events.status(status)
  }

  private async read(q: Query, current: () => boolean): Promise<void> {
    try {
      for await (const message of q) {
        if (!current()) return
        this.handle(message)
      }
      if (current()) this.setStatus({ state: 'stopped', account: this.status.account })
    } catch (e) {
      if (current()) {
        this.setStatus({
          state: 'stopped',
          account: this.status.account,
          error: (e as Error).message
        })
      }
    }
  }

  private handle(m: SDKMessage): void {
    // A helper's own steps stay inside its one line.
    if ('parent_tool_use_id' in m && m.parent_tool_use_id) return
    switch (m.type) {
      case 'stream_event': {
        const e = m.event
        if (e.type === 'message_start') {
          this.writing = e.message.id
          this.texts.clear()
        } else if (e.type === 'content_block_start' && e.content_block.type === 'text') {
          const item = {
            kind: 'text' as const,
            id: `${this.writing}:${e.index}`,
            text: e.content_block.text
          }
          this.texts.set(e.index, item)
          this.streamed.add(this.writing)
          this.events.item(item)
        } else if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') {
          const item = this.texts.get(e.index)
          if (!item) return
          item.text += e.delta.text
          this.events.item({ ...item })
        }
        return
      }
      case 'assistant': {
        if (m.error === 'authentication_failed' || m.error === 'oauth_org_not_allowed') {
          this.stop()
          this.setStatus({ state: 'signed-out' })
          return
        }
        m.message.content.forEach((block, i) => {
          if (block.type === 'text' && !this.streamed.has(m.message.id)) {
            this.events.item({ kind: 'text', id: `${m.uuid}:${i}`, text: block.text })
          } else if (block.type === 'tool_use' && block.name !== 'AskUserQuestion') {
            const input = (block.input ?? {}) as Record<string, unknown>
            const step = {
              kind: 'step' as const,
              id: block.id,
              tool: block.name,
              ...describe(block.name, input, this.cwd),
              state: 'running' as const
            }
            this.steps.set(block.id, step)
            this.events.item(step)
          }
        })
        return
      }
      case 'user': {
        const content = m.message.content
        if (!Array.isArray(content)) return
        for (const block of content) {
          if (block.type !== 'tool_result') continue
          const step = this.steps.get(block.tool_use_id)
          if (!step) continue
          this.steps.delete(block.tool_use_id)
          const failed = block.is_error === true
          const why = failed ? resultText(block.content).slice(0, 600) : ''
          this.events.item({
            ...step,
            state: failed ? 'failed' : 'done',
            detail: failed ? [step.detail, why].filter(Boolean).join('\n\n') : step.detail
          })
        }
        return
      }
      case 'system': {
        if (m.subtype === 'init') {
          let mode = m.permissionMode as ClaudeMode
          let auto = this.status.auto
          // An account without auto mode starts in the default mode, which asks even before
          // edits; asking before commands only is what the terminal does.
          if (this.mode === 'auto' && mode !== 'auto') {
            auto = false
            mode = this.mode = 'acceptEdits'
            void this.query?.setPermissionMode(mode).catch(() => {})
          }
          this.setStatus({ ...this.status, model: m.model, mode, auto })
        } else if (m.subtype === 'status' && m.permissionMode) {
          this.setStatus({ ...this.status, mode: m.permissionMode as ClaudeMode })
        }
        return
      }
      case 'result': {
        if (this.interrupted) {
          this.events.item({ kind: 'notice', id: m.uuid, text: 'Stopped.' })
        } else if (m.is_error) {
          const text = m.subtype === 'success' ? m.result : 'Claude stopped before it was done.'
          this.events.item({ kind: 'notice', id: m.uuid, text, error: true })
        }
        this.interrupted = false
        const more = m.subtype === 'success' && (m.queued_turn_count ?? 0) > 0
        this.setStatus({ ...this.status, state: more ? 'busy' : 'ready' })
        return
      }
    }
  }

  // Claude asks before doing something its rules do not already allow, and asks the editor
  // its questions the same way.
  private canUseTool: CanUseTool = (tool, input, { signal, title, suggestions }) =>
    new Promise<PermissionResult>((resolve) => {
      const id = randomUUID()
      const done = (result: PermissionResult): void => {
        if (!this.pending.delete(id)) return
        signal.removeEventListener('abort', abort)
        this.events.settled(id)
        resolve(result)
      }
      const abort = (): void => done({ behavior: 'deny', message: 'Stopped by the editor.' })
      signal.addEventListener('abort', abort, { once: true })
      if (tool === 'AskUserQuestion') {
        this.pending.set(id, (a) => {
          if (a.kind === 'question' && a.answers) {
            done({ behavior: 'allow', updatedInput: { ...input, answers: a.answers } })
          } else done({ behavior: 'deny', message: 'The editor closed the questions unanswered.' })
        })
        this.events.request({
          kind: 'question',
          id,
          questions: (Array.isArray(input['questions']) ? input['questions'] : []) as ChatQuestion[]
        })
        return
      }
      this.pending.set(id, (a) => {
        if (a.kind !== 'permission' || !a.allow) {
          return done({ behavior: 'deny', message: 'The editor said no.' })
        }
        // "Always" lasts for this conversation only; the checkout gets no settings of ours.
        const always = a.always
          ? suggestions?.map((s) => ({ ...s, destination: 'session' as const }))
          : undefined
        done({ behavior: 'allow', updatedInput: input, updatedPermissions: always })
      })
      const { summary, detail } = describe(tool, input, this.cwd)
      this.events.request({
        kind: 'permission',
        id,
        title: title ?? `Claude wants to ${asking(tool, input, this.cwd)}`,
        detail: detail ?? (summary === tool ? JSON.stringify(input, null, 2) : summary),
        canAlways: !!suggestions?.length
      })
    })
}

// A commit message for the files about to be committed, from a session of its own that
// nobody sees: Claude looks at the changes in the checkout, without leave to change
// anything, and answers with the message alone.
export async function writeCommitMessage(
  cwd: string,
  files: string[],
  launch: ClaudeLaunch
): Promise<string> {
  const proc = await claudeProcess()
  if (!proc.bin) throw new Error('Claude Code is not installed')
  proc.env.PATH = [...proc.path, await loginPath()].join(':')
  const { query } = await loadSdk()
  const prompt =
    'Write the commit message for these changes in the checkout:\n\n' +
    files.map((f) => `- ${f}`).join('\n') +
    '\n\nLook at them first: git diff for changed files (git diff HEAD -- <file>), and ' +
    'read new ones. Answer with the message only, nothing before or after it.'
  const q = query({
    prompt,
    options: {
      cwd,
      pathToClaudeCodeExecutable: proc.bin,
      env: proc.env,
      settings: launch.rules as Options['settings'],
      model: launch.model ?? undefined,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: commitStyle },
      tools: ['Read', 'Glob', 'Grep', 'Bash'],
      allowedTools: [
        'Read',
        'Glob',
        'Grep',
        'Bash(git diff *)',
        'Bash(git status *)',
        'Bash(git log *)',
        'Bash(git show *)'
      ],
      // Anything not allowed above is refused without asking anyone.
      permissionMode: 'dontAsk',
      persistSession: false,
      maxTurns: 20,
      stderr: (data) => log('claude (commit message):', data.trim())
    }
  })
  for await (const m of q) {
    if (m.type !== 'result') continue
    if (m.subtype !== 'success') throw new Error('Claude could not write a message')
    // The changes are the editor's; Claude only wrote the message, so it signs nothing.
    return m.result
      .trim()
      .replace(/^```\w*\n?|\n?```$/g, '')
      .replace(/(\n\s*Co-Authored-By:.*)+$/i, '')
      .trim()
  }
  throw new Error('Claude could not write a message')
}
