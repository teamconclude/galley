import { useCallback, useEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import type { HugoStatus, RepoInfo } from '../../shared/types'
import ClaudePane from './components/ClaudePane'
import Editor from './components/Editor'
import FileTree from './components/FileTree'
import Frontmatter from './components/Frontmatter'
import Preview from './components/Preview'
import Splitter from './components/Splitter'
import Toolbar from './components/Toolbar'
import Welcome from './components/Welcome'
import { join, split } from './lib/frontmatter'

interface OpenFile {
  path: string
  text: string
  saved: string
}

const imageFile = /\.(png|jpe?g|gif|webp|svg|ico|avif)$/i
const binaryFile = /\.(pdf|zip|gz|woff2?|ttf|otf|eot|mp4|mov|webm|mp3)$/i
const markdownFile = /\.(md|markdown)$/i
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export default function App(): React.JSX.Element | null {
  const [repo, setRepo] = useState<RepoInfo | null | undefined>(undefined)
  const [hugo, setHugo] = useState<HugoStatus>({ state: 'stopped' })
  const [file, setFile] = useState<OpenFile | null>(null)
  const [saving, setSaving] = useState(false)
  const [treeVersion, setTreeVersion] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [showPreview, setShowPreview] = useState(true)
  const [showClaude, setShowClaude] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [previewWidth, setPreviewWidth] = useState(600)
  const [claudeHeight, setClaudeHeight] = useState(300)
  const [view, setView] = useState<EditorView | null>(null)

  const fileRef = useRef(file)
  const saveTimer = useRef<number | null>(null)
  const lastWrite = useRef<{ path: string; time: number } | null>(null)

  useEffect(() => {
    fileRef.current = file
  }, [file])

  const loadRepo = useCallback(() => {
    void Promise.all([window.api.repo.get(), window.api.hugo.status()]).then(([r, h]) => {
      setRepo(r)
      setHugo(h)
    })
  }, [])

  useEffect(() => {
    loadRepo()
    const offs = [
      window.api.repo.onOpened(() => {
        setFile(null)
        loadRepo()
      }),
      window.api.hugo.onStatus(setHugo)
    ]
    return () => offs.forEach((off) => off())
  }, [loadRepo])

  const save = useCallback(async () => {
    const current = fileRef.current
    if (!current || current.text === current.saved) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    setSaving(true)
    lastWrite.current = { path: current.path, time: Date.now() }
    try {
      await window.api.repo.write(current.path, current.text)
      setFile((f) => (f && f.path === current.path ? { ...f, saved: current.text } : f))
    } finally {
      setSaving(false)
    }
  }, [])

  const changeText = (text: string): void => {
    setFile((f) => (f ? { ...f, text } : f))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void save(), 800)
  }

  const open = async (path: string): Promise<void> => {
    await save()
    if (imageFile.test(path) || binaryFile.test(path)) {
      setFile({ path, text: '', saved: '' })
      return
    }
    const text = await window.api.repo.read(path)
    setFile({ path, text, saved: text })
  }

  useEffect(
    () =>
      window.api.repo.onChanged((paths) => {
        setTreeVersion((v) => v + 1)
        const current = fileRef.current
        if (!current || !paths.includes(current.path)) return
        const own = lastWrite.current
        if (own && own.path === current.path && Date.now() - own.time < 2000) return
        if (current.text !== current.saved) return
        void window.api.repo.read(current.path).then((text) => {
          setFile((f) =>
            f && f.path === current.path && f.text === f.saved
              ? { path: f.path, text, saved: text }
              : f
          )
        })
      }),
    []
  )

  useEffect(
    () =>
      window.api.onMenu((command) => {
        switch (command) {
          case 'save':
            void save()
            break
          case 'toggle-preview':
            setShowPreview((p) => !p)
            break
          case 'toggle-terminal':
            setShowClaude((c) => !c)
            break
          case 'reload-preview':
            setReloadKey((k) => k + 1)
            break
        }
      }),
    [save]
  )

  if (repo === undefined) return null
  if (repo === null) return <Welcome />

  const isMarkdown = file ? markdownFile.test(file.path) : false
  const parts = file && isMarkdown ? split(file.text) : null
  const dirty = file ? file.text !== file.saved : false

  return (
    <div className="app">
      <header className="titlebar">
        <div className="title">
          <strong>{repo.name}</strong>
          {repo.branch && <span className="branch">{repo.branch}</span>}
        </div>
        <div className="title-file">{file?.path ?? ''}</div>
        <div className="title-right">
          <span className="save-state">
            {file ? (saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved') : ''}
          </span>
          <button className={showPreview ? 'on' : ''} onClick={() => setShowPreview(!showPreview)}>
            Preview
          </button>
          <button className={showClaude ? 'on' : ''} onClick={() => setShowClaude(!showClaude)}>
            Claude
          </button>
        </div>
      </header>
      <div className="body">
        <aside className="sidebar" style={{ width: sidebarWidth }}>
          <FileTree
            name={repo.name}
            selected={file?.path ?? null}
            onSelect={(path) => void open(path)}
            version={treeVersion}
          />
        </aside>
        <Splitter
          direction="horizontal"
          onDrag={(d) => setSidebarWidth((w) => clamp(w + d, 160, 500))}
        />
        <div className="center">
          <div className="upper">
            <main className="editor-column">
              {!file ? (
                <div className="pane-empty">Choose a page on the left.</div>
              ) : imageFile.test(file.path) ? (
                <div className="image-view">
                  <img src={`galley://repo/${file.path}`} alt={file.path} />
                </div>
              ) : binaryFile.test(file.path) ? (
                <div className="pane-empty">This file cannot be edited here.</div>
              ) : (
                <>
                  {parts && parts.frontmatter !== null && (
                    <Frontmatter
                      key={file.path}
                      text={parts.frontmatter}
                      onChange={(fm) => changeText(join(fm, parts.body))}
                    />
                  )}
                  {isMarkdown && <Toolbar view={view} />}
                  <Editor
                    key={file.path}
                    filename={file.path}
                    value={parts ? parts.body : file.text}
                    onChange={(body) => changeText(parts ? join(parts.frontmatter, body) : body)}
                    onSave={() => void save()}
                    onView={setView}
                  />
                </>
              )}
            </main>
            {showPreview && (
              <>
                <Splitter
                  direction="horizontal"
                  onDrag={(d) => setPreviewWidth((w) => clamp(w - d, 320, 1400))}
                />
                <section className="preview-column" style={{ width: previewWidth }}>
                  <Preview status={hugo} path={file?.path ?? null} reloadKey={reloadKey} />
                </section>
              </>
            )}
          </div>
          <Splitter
            direction="vertical"
            hidden={!showClaude}
            onDrag={(d) => setClaudeHeight((h) => clamp(h - d, 120, 900))}
          />
          <section className="claude-row" style={{ height: claudeHeight }} hidden={!showClaude}>
            <ClaudePane repoPath={repo.path} />
          </section>
        </div>
      </div>
    </div>
  )
}
