import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FilePlus,
  FileText,
  Globe,
  Hand,
  ListChecks,
  LoaderCircle,
  Paperclip,
  Pencil,
  PencilLine,
  Plus,
  Search,
  Square,
  SquareTerminal,
  Users,
  X,
  Zap
} from 'lucide-react'
import type {
  ChatItem,
  ChatQuestion,
  ChatRequest,
  ChatStatus,
  ClaudeMode,
  ClaudeModel,
  Preferences
} from '../../../shared/types'
import { setClaudeInput, useFileDrop } from '../lib/claude'
import ContextMenu, { type MenuItem } from './ContextMenu'
import { TerminalView } from './ClaudeTerminal'

const toolIcons: Record<string, typeof FileText> = {
  Read: FileText,
  Edit: Pencil,
  NotebookEdit: Pencil,
  Write: FilePlus,
  Glob: Search,
  Grep: Search,
  Bash: SquareTerminal,
  WebFetch: Globe,
  WebSearch: Globe,
  Skill: BookOpen,
  TodoWrite: ListChecks,
  Agent: Users,
  Task: Users
}

const modes: { mode: ClaudeMode; label: string; description: string; icon: typeof Zap }[] = [
  {
    mode: 'auto',
    label: 'Auto',
    description: 'Claude goes ahead with what is safe and asks when it is unsure.',
    icon: Zap
  },
  {
    mode: 'acceptEdits',
    label: 'Ask before commands',
    description: 'Claude changes files freely and asks before running anything.',
    icon: PencilLine
  },
  {
    mode: 'default',
    label: 'Ask before changes',
    description: 'Claude asks before every change to a file and every command.',
    icon: Hand
  }
]

const models: { model: ClaudeModel; label: string; description: string }[] = [
  { model: 'opus', label: 'Opus', description: 'The most careful.' },
  { model: 'sonnet', label: 'Sonnet', description: 'Quicker.' },
  { model: 'default', label: 'As set in Claude Code', description: 'Claude Code’s own choice.' }
]

// claude-opus-5-5 reads as Opus 5.5.
function modelName(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(id)
  if (!m) return id
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}`
}

const fileName = (path: string): string => path.split('/').pop() ?? path

// An entry replaces the one with its id, or joins the end.
function upsert(items: ChatItem[], item: ChatItem): ChatItem[] {
  const i = items.findIndex((x) => x.id === item.id)
  if (i < 0) return [...items, item]
  const next = items.slice()
  next[i] = item
  return next
}

function Reply({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="chat-reply">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href && /^https?:/.test(href)) window.api.openExternal(href)
              }}
            >
              {children}
            </a>
          )
        }}
      >
        {text}
      </Markdown>
    </div>
  )
}

// One thing Claude did, in a line; what it changed or ran opens on a click.
function Step({ item }: { item: ChatItem & { kind: 'step' } }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const Icon = toolIcons[item.tool] ?? ChevronRight
  return (
    <div className={`chat-step ${item.state}`}>
      <button
        className="chat-step-line"
        disabled={!item.detail}
        onClick={() => setOpen(!open)}
        title={item.detail ? (open ? 'Hide details' : 'Show details') : undefined}
      >
        <Icon size={13} className="chat-step-icon" />
        <span className="chat-step-summary">{item.summary}</span>
        {item.state === 'running' && <LoaderCircle size={12} className="spin" />}
        {item.state === 'failed' && <X size={12} className="chat-step-failed" />}
      </button>
      {open && item.detail && <pre className="chat-step-detail">{item.detail}</pre>}
    </div>
  )
}

function PermissionCard({
  request
}: {
  request: ChatRequest & { kind: 'permission' }
}): React.JSX.Element {
  const answer = (allow: boolean, always = false): void =>
    window.api.chat.answer(request.id, { kind: 'permission', allow, always })
  return (
    <div className="chat-card">
      <div className="chat-card-title">{request.title}</div>
      {request.detail && <pre className="chat-step-detail">{request.detail}</pre>}
      <div className="chat-card-buttons">
        <button className="primary" onClick={() => answer(true)}>
          Allow
        </button>
        {request.canAlways && (
          <button onClick={() => answer(true, true)}>Allow for this conversation</button>
        )}
        <button onClick={() => answer(false)}>Don’t allow</button>
      </div>
    </div>
  )
}

// Claude's questions with their choices. A single question with one answer is answered
// by its choice; otherwise the editor picks and sends.
function QuestionCard({
  request
}: {
  request: ChatRequest & { kind: 'question' }
}): React.JSX.Element {
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})
  const single = request.questions.length === 1 && !request.questions[0].multiSelect

  const answerOf = (q: ChatQuestion): string =>
    [...(picked[q.question] ?? []), other[q.question]?.trim()].filter(Boolean).join(', ')
  const send = (answers: Record<string, string> | null): void =>
    window.api.chat.answer(request.id, { kind: 'question', answers })
  const pick = (q: ChatQuestion, label: string): void => {
    if (single) return send({ [q.question]: label })
    const now = picked[q.question] ?? []
    const next = q.multiSelect
      ? now.includes(label)
        ? now.filter((l) => l !== label)
        : [...now, label]
      : [label]
    setPicked({ ...picked, [q.question]: next })
  }
  const complete = request.questions.every((q) => answerOf(q))

  return (
    <div className="chat-card">
      {request.questions.map((q) => (
        <div key={q.question} className="chat-question">
          {q.header && <span className="chat-chip">{q.header}</span>}
          <div className="chat-card-title">{q.question}</div>
          <div className="chat-options">
            {q.options.map((o) => (
              <button
                key={o.label}
                className={(picked[q.question] ?? []).includes(o.label) ? 'on' : ''}
                onClick={() => pick(q, o.label)}
              >
                <strong>{o.label}</strong>
                {o.description && <small>{o.description}</small>}
              </button>
            ))}
          </div>
          <input
            className="chat-other"
            placeholder="Something else…"
            value={other[q.question] ?? ''}
            onChange={(e) => setOther({ ...other, [q.question]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && single && answerOf(q)) send({ [q.question]: answerOf(q) })
            }}
          />
        </div>
      ))}
      <div className="chat-card-buttons">
        {!single && (
          <button
            className="primary"
            disabled={!complete}
            onClick={() =>
              send(Object.fromEntries(request.questions.map((q) => [q.question, answerOf(q)])))
            }
          >
            Send answers
          </button>
        )}
        {single && other[request.questions[0].question]?.trim() && (
          <button
            className="primary"
            onClick={() =>
              send({ [request.questions[0].question]: answerOf(request.questions[0]) })
            }
          >
            Send
          </button>
        )}
        <button onClick={() => send(null)}>Skip</button>
      </div>
    </div>
  )
}

interface Props {
  prefs: Preferences
  onPrefs: (prefs: Preferences) => void
  // The file open in the editor, which goes along with each message unless left out.
  openFile: string | null
}

// The pane as a chat with Claude: the editor's messages and Claude's replies, a line for
// each thing Claude does, and its requests for leave or answers as cards to click.
export default function ClaudeChat({ prefs, onPrefs, openFile }: Props): React.JSX.Element {
  const [status, setStatus] = useState<ChatStatus>({ state: 'starting' })
  const [items, setItems] = useState<ChatItem[]>([])
  const [requests, setRequests] = useState<ChatRequest[]>([])
  const [conversation, setConversation] = useState(0)
  const [signingIn, setSigningIn] = useState(false)
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<string[]>([])
  // The page the editor left out of the context; another page goes along again.
  const [leftOut, setLeftOut] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  // Whether the conversation follows its end, which it stops doing once scrolled up.
  const following = useRef(true)

  useEffect(() => {
    const offs = [
      window.api.chat.onStatus(setStatus),
      window.api.chat.onItem((item) => setItems((all) => upsert(all, item))),
      window.api.chat.onRequest((r) => setRequests((all) => [...all, r])),
      window.api.chat.onSettled((id) => setRequests((all) => all.filter((r) => r.id !== id)))
    ]
    window.api.chat.start()
    return () => {
      offs.forEach((off) => off())
      window.api.chat.stop()
    }
  }, [conversation])

  const live = status.state === 'ready' || status.state === 'busy'
  const busy = status.state === 'busy'

  const page = openFile && openFile !== leftOut ? openFile : null
  const sendRequest = useEffectEvent((text: string) => window.api.chat.send(text, [], page))
  useEffect(() => (live ? setClaudeInput((text) => sendRequest(text)) : undefined), [live])

  // Opens a menu just above the button that asks for it.
  const openMenu = (e: React.MouseEvent, items: MenuItem[]): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMenu({ x: rect.left, y: rect.top - 4, items })
  }
  const mode = modes.find((m) => m.mode === (status.mode ?? prefs.claudeMode)) ?? modes[0]
  const modeMenu = (e: React.MouseEvent): void =>
    openMenu(
      e,
      modes
        .filter((m) => m.mode !== 'auto' || status.auto !== false)
        .map((m) => ({
          label: m.label,
          description: m.description,
          checked: m.mode === mode.mode,
          onClick: () => {
            onPrefs({ ...prefs, claudeMode: m.mode })
            window.api.chat.setMode(m.mode)
          }
        }))
    )
  const modelMenu = (e: React.MouseEvent): void =>
    openMenu(
      e,
      models.map((m) => ({
        label: m.label,
        description: m.description,
        checked: m.model === prefs.claudeModel,
        onClick: () => {
          onPrefs({ ...prefs, claudeModel: m.model })
          window.api.chat.setModel(m.model === 'default' ? null : m.model)
        }
      }))
    )
  const model = status.model
    ? modelName(status.model)
    : (models.find((m) => m.model === prefs.claudeModel)?.label ?? '')
  const helpers = items.filter(
    (i) => i.kind === 'step' && i.state === 'running' && (i.tool === 'Agent' || i.tool === 'Task')
  ).length

  useLayoutEffect(() => {
    const el = log.current
    if (el && following.current) el.scrollTop = el.scrollHeight
  }, [items, requests, busy])

  const restart = (): void => {
    setItems([])
    setRequests([])
    setStatus({ state: 'starting' })
    following.current = true
    setConversation((c) => c + 1)
  }

  const { dropping, handlers } = useFileDrop((copies) => {
    setFiles((now) => [...now, ...copies.filter((c) => !now.includes(c))])
    input.current?.focus()
  })

  const submit = (): void => {
    const text = draft.trim()
    if (!live || (!text && files.length === 0)) return
    window.api.chat.send(text || 'Here are the files.', files, page)
    setDraft('')
    setFiles([])
    following.current = true
  }

  const body = (): React.JSX.Element => {
    if (signingIn) {
      return (
        <>
          <div className="chat-banner">
            Sign in with your Claude account in the browser window that opens. Back here, follow
            what Claude Code asks below.
          </div>
          <TerminalView
            login
            onExit={() => {
              setSigningIn(false)
              restart()
            }}
          />
        </>
      )
    }
    if (status.state === 'missing') {
      return (
        <div className="chat-empty">
          Claude Code is not installed on this Mac. Choose Setup… in the Galley menu to install it.
        </div>
      )
    }
    if (status.state === 'signed-out') {
      return (
        <div className="chat-empty">
          <p>Claude needs you to sign in with your Claude account.</p>
          <button className="primary" onClick={() => setSigningIn(true)}>
            Sign in…
          </button>
        </div>
      )
    }
    return (
      <>
        <div
          className="chat-log"
          ref={log}
          onScroll={(e) => {
            const el = e.currentTarget
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
        >
          {items.length === 0 && status.state !== 'stopped' && (
            <div className="chat-hint">
              {status.state === 'starting'
                ? 'Starting Claude…'
                : 'Ask Claude to write or change pages. “This page” means the one that is open. Drop documents or pictures here to hand them over.'}
            </div>
          )}
          {items.map((item) =>
            item.kind === 'user' ? (
              <div key={item.id} className="chat-user">
                {item.text}
                {(item.files.length > 0 || item.page) && (
                  <div className="chat-files">
                    {item.page && (
                      <span className="chat-chip" title={item.page}>
                        <FileText size={11} /> {fileName(item.page)}
                      </span>
                    )}
                    {item.files.map((f) => (
                      <span key={f} className="chat-chip">
                        <Paperclip size={11} /> {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : item.kind === 'text' ? (
              <Reply key={item.id} text={item.text} />
            ) : item.kind === 'step' ? (
              <Step key={item.id} item={item} />
            ) : (
              <div key={item.id} className={'chat-notice' + (item.error ? ' error' : '')}>
                {item.error && <CircleAlert size={13} />} {item.text}
              </div>
            )
          )}
          {requests.map((r) =>
            r.kind === 'permission' ? (
              <PermissionCard key={r.id} request={r} />
            ) : (
              <QuestionCard key={r.id} request={r} />
            )
          )}
          {busy && requests.length === 0 && (
            <div className="chat-working">
              <LoaderCircle size={13} className="spin" /> Working…
            </div>
          )}
          {status.state === 'stopped' && (
            <div className="chat-notice error">
              <CircleAlert size={13} /> Claude stopped{status.error ? `: ${status.error}` : '.'}{' '}
              <button onClick={restart}>Start again</button>
            </div>
          )}
        </div>
        <div className="chat-composer">
          <div className="chat-input">
            {files.length > 0 && (
              <div className="chat-files">
                {files.map((f) => (
                  <span key={f} className="chat-chip">
                    <Paperclip size={11} /> {fileName(f)}
                    <button
                      title="Remove"
                      onClick={() => setFiles((now) => now.filter((x) => x !== f))}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={input}
              rows={1}
              value={draft}
              disabled={!live}
              placeholder={live ? 'Ask Claude…' : ''}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                } else if (e.key === 'Escape' && busy) {
                  e.preventDefault()
                  window.api.chat.interrupt()
                }
              }}
            />
            <div className="chat-toolbar">
              <button
                className="chat-tool"
                title="Hand Claude files (or drop them here)"
                disabled={!live}
                onClick={async () => {
                  const picked = await window.api.chat.pick()
                  setFiles((now) => [...now, ...picked.filter((c) => !now.includes(c))])
                  input.current?.focus()
                }}
              >
                <Plus size={14} />
              </button>
              {openFile &&
                (page ? (
                  <span className="chat-chip" title={`Claude is told that ${openFile} is open`}>
                    <FileText size={11} /> {fileName(openFile)}
                    <button title="Leave this page out" onClick={() => setLeftOut(openFile)}>
                      <X size={11} />
                    </button>
                  </span>
                ) : (
                  <button
                    className="chat-chip off"
                    title="Tell Claude which page is open"
                    onClick={() => setLeftOut(null)}
                  >
                    <FileText size={11} /> {fileName(openFile)}
                  </button>
                ))}
              {helpers > 0 && (
                <span className="chat-chip">
                  <Users size={11} /> {helpers === 1 ? '1 helper' : `${helpers} helpers`} working
                </span>
              )}
              <button className="chat-tool" title="Model" onClick={modelMenu}>
                {model} <ChevronDown size={12} />
              </button>
              <span className="chat-spacer" />
              <button className="chat-tool" title={mode.description} onClick={modeMenu}>
                <mode.icon size={13} /> {mode.label}
              </button>
              {busy && !draft.trim() && files.length === 0 ? (
                <button
                  className="chat-send"
                  title="Stop (Esc)"
                  onClick={() => window.api.chat.interrupt()}
                >
                  <Square size={12} fill="currentColor" />
                </button>
              ) : (
                <button
                  className="chat-send primary"
                  title="Send (Enter)"
                  disabled={!live || (!draft.trim() && files.length === 0)}
                  onClick={submit}
                >
                  <ArrowUp size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
        {menu && <ContextMenu {...menu} above onClose={() => setMenu(null)} />}
      </>
    )
  }

  return (
    <div className={'claude chat' + (dropping ? ' dropping' : '')} {...handlers}>
      <div className="pane-bar">
        <span className="pane-title">
          Claude
          {status.account && <span className="chat-account"> · {status.account}</span>}
        </span>
        {items.length > 0 && !signingIn && (
          <button onClick={restart} title="Start a new conversation">
            New conversation
          </button>
        )}
      </div>
      {body()}
    </div>
  )
}
