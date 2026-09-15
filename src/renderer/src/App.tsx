import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Change,
  DirEntry,
  GitStatus,
  SetupStatus,
  HugoStatus,
  Identity,
  RepoInfo,
  ReleaseStep,
  Preferences
} from '../../shared/types'
import ChangesPanel from './components/ChangesPanel'
import ClaudePane from './components/ClaudePane'
import ContextMenu, { type MenuItem } from './components/ContextMenu'
import { NewPageDialog, PromptDialog } from './components/Dialogs'
import DiffView from './components/DiffView'
import Editor from './components/Editor'
import FileTree from './components/FileTree'
import {
  ConfirmDialog,
  IdentityDialog,
  NewBranchDialog,
  SwitchBranchDialog
} from './components/GitDialogs'
import Frontmatter from './components/Frontmatter'
import Preview from './components/Preview'
import { SchemaProvider } from './components/SchemaContext'
import Splitter from './components/Splitter'
import { loadLayout, saveLayout } from './lib/layout'
import Toolbar from './components/Toolbar'
import SetupDialog from './components/SetupDialog'
import SettingsDialog from './components/SettingsDialog'
import { UpdateButton } from './components/UpdateButton'
import Welcome from './components/Welcome'
import { join, split } from './lib/frontmatter'
import { newPageText } from './lib/newPage'

interface OpenFile {
  path: string
  text: string
  saved: string
}

type DialogState =
  | { kind: 'new-page'; dir: string }
  | { kind: 'new-folder'; dir: string }
  | { kind: 'rename'; entry: DirEntry }
  | { kind: 'duplicate'; entry: DirEntry }

const imageFile = /\.(png|jpe?g|gif|webp|svg|ico|avif)$/i
const binaryFile = /\.(pdf|zip|gz|woff2?|ttf|otf|eot|mp4|mov|webm|mp3)$/i
const markdownFile = /\.(md|markdown)$/i
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const parentOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
const inDir = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name)
// File and folder names stay lowercase with hyphens, as the site's URLs expect.
const normalizeName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, '-')
const copyName = (name: string): string => name.replace(/(\.[^.]+)?$/, '-copy$1')
// Errors from the main process arrive wrapped by Electron's IPC.
const fail = (e: unknown): void =>
  window.alert(
    (e instanceof Error ? e.message : String(e)).replace(
      /^Error invoking remote method '[^']+': (?:Error: )?/,
      ''
    )
  )

export default function App(): React.JSX.Element | null {
  const [repo, setRepo] = useState<RepoInfo | null | undefined>(undefined)
  const [hugo, setHugo] = useState<HugoStatus>({ state: 'stopped' })
  const [file, setFile] = useState<OpenFile | null>(null)
  const [saving, setSaving] = useState(false)
  const [treeVersion, setTreeVersion] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [layout] = useState(loadLayout)
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [showSetup, setShowSetup] = useState<boolean | null>(null)
  const [showPreview, setShowPreview] = useState(layout.showPreview)
  const [detached, setDetached] = useState(layout.detached)
  const [pagePath, setPagePath] = useState('/')
  const [showClaude, setShowClaude] = useState(layout.showClaude)
  const [sidebarWidth, setSidebarWidth] = useState(layout.sidebarWidth)
  const [previewWidth, setPreviewWidth] = useState(layout.previewWidth)
  const [claudeHeight, setClaudeHeight] = useState(layout.claudeHeight)
  const [showAllFiles, setShowAllFiles] = useState(layout.showAllFiles)
  const [bodyShownFor, setBodyShownFor] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['content']))
  const [menu, setMenu] = useState<{ x: number; y: number; entry: DirEntry } | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'files' | 'changes'>(layout.sidebarTab)
  const [diff, setDiff] = useState<{ change: Change; text: string | null } | null>(null)
  const [gitDialog, setGitDialog] = useState<
    'new-branch' | 'switch-branch' | 'identity' | 'merge' | null
  >(null)
  const [releaseDialog, setReleaseDialog] = useState<ReleaseStep | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  useEffect(() => {
    void window.api.prefs.get().then(setPrefs)
  }, [])
  const [branches, setBranches] = useState<string[]>([])
  const [pendingCommit, setPendingCommit] = useState<{ message: string; paths: string[] } | null>(
    null
  )

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
    setDiff(null)
    if (imageFile.test(path) || binaryFile.test(path)) {
      setFile({ path, text: '', saved: '' })
      return
    }
    const text = await window.api.repo.read(path)
    setFile({ path, text, saved: text })
  }

  const toggleDir = (path: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const reveal = (path: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      const parts = path.split('/')
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'))
      return next
    })

  const createPage = async (dir: string, title: string, filename: string): Promise<void> => {
    const path = inDir(dir, filename)
    try {
      const template = await window.api.repo.newest(dir)
      await window.api.repo.create(path, newPageText(template, title))
      reveal(path)
      await open(path)
    } catch (e) {
      fail(e)
    }
  }

  const createFolder = async (dir: string, name: string): Promise<void> => {
    const path = inDir(dir, normalizeName(name))
    try {
      await window.api.repo.mkdir(path)
      reveal(path)
    } catch (e) {
      fail(e)
    }
  }

  const renameEntry = async (entry: DirEntry, name: string): Promise<void> => {
    const target = inDir(parentOf(entry.path), normalizeName(name))
    if (target === entry.path) return
    try {
      await window.api.repo.rename(entry.path, target)
      if (file?.path === entry.path) setFile({ ...file, path: target })
      else if (file?.path.startsWith(entry.path + '/')) {
        setFile({ ...file, path: target + file.path.slice(entry.path.length) })
      }
      reveal(target)
    } catch (e) {
      fail(e)
    }
  }

  const duplicateFile = async (entry: DirEntry, name: string): Promise<void> => {
    const target = inDir(parentOf(entry.path), normalizeName(name))
    try {
      await window.api.repo.create(target, await window.api.repo.read(entry.path))
      await open(target)
    } catch (e) {
      fail(e)
    }
  }

  const trashEntry = async (entry: DirEntry): Promise<void> => {
    const what = entry.isDir ? `the folder ${entry.name} and everything in it` : entry.name
    if (!window.confirm(`Move ${what} to the Trash?`)) return
    try {
      await window.api.repo.trash(entry.path)
      if (file && (file.path === entry.path || file.path.startsWith(entry.path + '/'))) {
        setFile(null)
      }
    } catch (e) {
      fail(e)
    }
  }

  const dropFiles = async (dir: string, files: File[]): Promise<void> => {
    try {
      for (const f of files) await window.api.repo.importFile(window.api.files.pathFor(f), dir)
      reveal(inDir(dir, 'x'))
    } catch (e) {
      fail(e)
    }
  }

  // Images dropped into a page body land in static/images/<section> of that page.
  const importImages = async (files: File[]): Promise<string[]> => {
    const parts = file?.path.split('/') ?? []
    const section = parts[0] === 'content' && parts.length > 2 ? parts[1] : 'pages'
    const urls: string[] = []
    for (const f of files) {
      const rel = await window.api.repo.importFile(
        window.api.files.pathFor(f),
        `static/images/${section}`
      )
      urls.push('/' + rel.replace(/^static\//, ''))
    }
    return urls
  }

  const menuItems = (entry: DirEntry): MenuItem[] =>
    entry.isDir
      ? [
          { label: 'New page…', onClick: () => setDialog({ kind: 'new-page', dir: entry.path }) },
          {
            label: 'New folder…',
            onClick: () => setDialog({ kind: 'new-folder', dir: entry.path })
          },
          { label: 'Rename…', onClick: () => setDialog({ kind: 'rename', entry }) },
          { label: 'Move to Trash', danger: true, onClick: () => void trashEntry(entry) }
        ]
      : [
          { label: 'Rename…', onClick: () => setDialog({ kind: 'rename', entry }) },
          { label: 'Duplicate…', onClick: () => setDialog({ kind: 'duplicate', entry }) },
          { label: 'Move to Trash', danger: true, onClick: () => void trashEntry(entry) }
        ]

  const repoPath = repo?.path
  useEffect(() => {
    if (!repoPath) return
    void window.api.git.status().then(setGitStatus)
    void window.api.git.identity().then(setIdentity)
    return window.api.git.onStatus(setGitStatus)
  }, [repoPath])

  const gitAction = async (fn: () => Promise<void>): Promise<void> => {
    try {
      await fn()
    } catch (e) {
      fail(e)
    }
  }

  const showDiff = async (change: Change): Promise<void> => {
    setDiff({ change, text: null })
    try {
      const text = await window.api.git.diff(change.path)
      setDiff((d) => (d && d.change.path === change.path ? { change, text } : d))
    } catch (e) {
      fail(e)
    }
  }

  // Commits need a name and email; ask once and keep the commit waiting.
  const commit = async (message: string, paths: string[]): Promise<boolean> => {
    await save()
    if (!identity) {
      const found = await window.api.git.identity()
      if (!found) {
        setPendingCommit({ message, paths })
        setGitDialog('identity')
        return false
      }
      setIdentity(found)
    }
    try {
      await window.api.git.commit(message, paths)
      setDiff(null)
      return true
    } catch (e) {
      fail(e)
      return false
    }
  }

  const saveIdentity = async (id: Identity): Promise<void> => {
    setGitDialog(null)
    try {
      await window.api.git.setIdentity(id)
      setIdentity(id)
    } catch (e) {
      fail(e)
      return
    }
    if (pendingCommit) {
      setPendingCommit(null)
      void commit(pendingCommit.message, pendingCommit.paths)
    }
  }

  const discardChange = async (change: Change): Promise<void> => {
    const question =
      change.kind === 'untracked'
        ? `Move the new file ${change.path} to the Trash?`
        : `Discard the changes to ${change.path}?`
    if (!window.confirm(question)) return
    await save()
    await gitAction(() => window.api.git.discard(change.path, change.kind === 'untracked'))
    if (diff?.change.path === change.path) setDiff(null)
    if (file?.path === change.path) await reopen(change.path)
  }

  const discardAll = async (changes: Change[]): Promise<void> => {
    const question = `Discard all ${changes.length} changes? New files move to the Trash.`
    if (!window.confirm(question)) return
    await save()
    for (const change of changes) {
      await gitAction(() => window.api.git.discard(change.path, change.kind === 'untracked'))
    }
    setDiff(null)
    if (file) await reopen(file.path)
  }

  const mergeToBase = async (): Promise<void> => {
    setGitDialog(null)
    await save()
    await gitAction(() => window.api.git.mergeToBase())
    setDiff(null)
    if (file) await reopen(file.path)
  }

  const runRelease = async (step: ReleaseStep): Promise<void> => {
    setReleaseDialog(null)
    if (step.to !== 'production') {
      await gitAction(() => window.api.git.release(step.from, step.to))
      return
    }
    try {
      const result = await window.api.git.publish(step.from, step.to)
      if (!result.merged) {
        window.alert(
          `${result.error ?? 'The pull request is waiting'}. Finish publishing on GitHub.`
        )
        window.api.openExternal(result.url)
      }
    } catch (e) {
      fail(e)
    }
  }

  const revertHunk = async (change: Change, index: number): Promise<void> => {
    if (!window.confirm('Revert this change?')) return
    await save()
    await gitAction(() => window.api.git.revertHunk(change.path, index))
    const text = await window.api.git.diff(change.path).catch(() => '')
    setDiff(text.trim() === '' ? null : { change, text })
    if (file?.path === change.path) await reopen(change.path)
  }

  const reopen = async (path: string): Promise<void> => {
    const text = await window.api.repo.read(path).catch(() => null)
    setFile(text === null ? null : { path, text, saved: text })
  }

  const switchBranch = async (name: string): Promise<void> => {
    await save()
    await gitAction(() => window.api.git.switchBranch(name))
    setDiff(null)
    if (file) await reopen(file.path)
  }

  const openSwitchBranch = async (): Promise<void> => {
    try {
      setBranches(await window.api.git.branches())
      setGitDialog('switch-branch')
    } catch (e) {
      fail(e)
    }
  }

  const branchPrefix =
    (identity?.email.split('@')[0] ?? 'me').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '/'

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

  const filePath = file?.path ?? null
  useEffect(() => {
    if (!filePath) return
    let live = true
    void window.api.repo.pageUrl(filePath).then((url) => {
      if (live && url) setPagePath(url)
    })
    return () => {
      live = false
    }
  }, [filePath])

  const previewUrl = hugo.state === 'running' && hugo.url ? hugo.url + pagePath : null

  // The setup dialog appears by itself only when a step downloads, fails or needs the
  // user; quick checks that pass leave it closed.
  useEffect(() => {
    const apply = (s: SetupStatus): void => {
      setSetup(s)
      const busy = s.steps.some((step) => ['running', 'failed', 'action'].includes(step.state))
      setShowSetup((shown) => (shown === null && busy ? true : shown))
    }
    void window.api.setup.status().then(apply)
    return window.api.setup.onStatus(apply)
  }, [])

  useEffect(() => {
    saveLayout({
      showPreview,
      showClaude,
      detached,
      sidebarWidth,
      previewWidth,
      claudeHeight,
      sidebarTab,
      showAllFiles
    })
  }, [
    showPreview,
    showClaude,
    detached,
    sidebarWidth,
    previewWidth,
    claudeHeight,
    sidebarTab,
    showAllFiles
  ])

  // A preview that was in its own window when Galley closed reopens there.
  useEffect(() => {
    if (detached && previewUrl) window.api.preview.detach(previewUrl)
  }, [detached, previewUrl])

  const toggleDetached = useCallback(() => {
    if (detached) {
      window.api.preview.attach()
    } else if (previewUrl) {
      window.api.preview.detach(previewUrl)
      setDetached(true)
    }
  }, [detached, previewUrl])

  useEffect(() => window.api.preview.onClosed(() => setDetached(false)), [])

  useEffect(() => {
    if (detached && reloadKey) window.api.preview.reload()
  }, [detached, reloadKey])

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
          case 'setup':
            setShowSetup(true)
            break
          case 'settings':
            setShowSettings(true)
            break
          case 'detach-preview':
            toggleDetached()
            break
          case 'toggle-terminal':
            setShowClaude((c) => !c)
            break
          case 'reload-preview':
            setReloadKey((k) => k + 1)
            break
        }
      }),
    [save, toggleDetached]
  )

  if (repo === undefined) return null
  if (repo === null) return <Welcome />

  const isMarkdown = file ? markdownFile.test(file.path) : false
  const parts = file && isMarkdown ? split(file.text) : null
  const dirty = file ? file.text !== file.saved : false
  // Pages built from components have no prose, so the settings form gets the whole column.
  const blocksPage =
    parts?.frontmatter != null &&
    /^content_blocks:/m.test(parts.frontmatter) &&
    parts.body.trim() === ''
  const showBody = !blocksPage || bodyShownFor === file?.path
  const newPageDir = file?.path.startsWith('content/') ? parentOf(file.path) : 'content/blog'

  return (
    <SchemaProvider repoPath={repo.path}>
      <div
        className="app"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      >
        <header className="titlebar">
          <div className="title">
            <strong>{repo.name}</strong>
            <span className="branch">{gitStatus?.branch ?? repo.branch}</span>
          </div>
          <div className="title-file">{file?.path ?? ''}</div>
          <div className="title-right">
            <span className="save-state">
              {file ? (saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved') : ''}
            </span>
            <UpdateButton />
            <button
              className={showPreview || detached ? 'on' : ''}
              title={
                detached ? 'Bring the preview back into this window' : 'Show or hide the preview'
              }
              onClick={() => (detached ? toggleDetached() : setShowPreview(!showPreview))}
            >
              {detached ? 'Preview ↗' : 'Preview'}
            </button>
            <button className={showClaude ? 'on' : ''} onClick={() => setShowClaude(!showClaude)}>
              Claude
            </button>
          </div>
        </header>
        <div className="body">
          <aside className="sidebar" style={{ width: sidebarWidth }}>
            <div className="sidebar-tabs">
              <button
                className={sidebarTab === 'files' ? 'on' : ''}
                onClick={() => setSidebarTab('files')}
              >
                Files
              </button>
              <button
                className={sidebarTab === 'changes' ? 'on' : ''}
                onClick={() => setSidebarTab('changes')}
              >
                Changes
                {gitStatus && gitStatus.changes.length > 0 && (
                  <span className="badge">{gitStatus.changes.length}</span>
                )}
              </button>
            </div>
            {sidebarTab === 'files' ? (
              <FileTree
                name={repo.name}
                selected={file?.path ?? null}
                expanded={expanded}
                onToggle={toggleDir}
                onSelect={(path) => void open(path)}
                onContextMenu={(entry, x, y) => setMenu({ x, y, entry })}
                onDropFiles={(dir, files) => void dropFiles(dir, files)}
                onNewPage={() => setDialog({ kind: 'new-page', dir: newPageDir })}
                onNewFolder={() => setDialog({ kind: 'new-folder', dir: newPageDir })}
                onRefresh={() => setTreeVersion((v) => v + 1)}
                onCollapseAll={() => setExpanded(new Set())}
                showAll={showAllFiles}
                onToggleShowAll={() => setShowAllFiles(!showAllFiles)}
                version={treeVersion}
              />
            ) : (
              <ChangesPanel
                status={gitStatus}
                selected={diff?.change.path ?? null}
                onShowDiff={(c) => void showDiff(c)}
                onDiscard={(c) => void discardChange(c)}
                onDiscardAll={(cs) => void discardAll(cs)}
                onCommit={commit}
                onPush={() => void save().then(() => gitAction(() => window.api.git.push()))}
                onPull={() => void save().then(() => gitAction(() => window.api.git.pull()))}
                onUpdate={() => void save().then(() => gitAction(() => window.api.git.update()))}
                onFetch={() => void gitAction(() => window.api.git.fetch())}
                onNewBranch={() => setGitDialog('new-branch')}
                onMerge={() => setGitDialog('merge')}
                onRelease={setReleaseDialog}
                onPublish={setReleaseDialog}
                onSwitchBranch={() => void openSwitchBranch()}
              />
            )}
          </aside>
          <Splitter
            direction="horizontal"
            onDrag={(d) => setSidebarWidth((w) => clamp(w + d, 160, 500))}
          />
          <div className="center">
            <div className="upper">
              <main className="editor-column">
                {diff ? (
                  <DiffView
                    change={diff.change}
                    diff={diff.text}
                    onOpen={() => void open(diff.change.path)}
                    onDiscard={() => void discardChange(diff.change)}
                    onRevertHunk={(i) => void revertHunk(diff.change, i)}
                  />
                ) : !file ? (
                  <div className="pane-empty">Choose a page on the left.</div>
                ) : imageFile.test(file.path) ? (
                  <div className="image-view">
                    <img src={`galley://repo/${file.path}`} alt={file.path} />
                  </div>
                ) : binaryFile.test(file.path) ? (
                  <div className="pane-empty">This file cannot be edited here.</div>
                ) : (
                  <>
                    {isMarkdown && <Toolbar />}
                    {parts && parts.frontmatter !== null && (
                      <Frontmatter
                        key={`settings:${file.path}`}
                        text={parts.frontmatter}
                        onChange={(fm) => changeText(join(fm, parts.body))}
                        grow={blocksPage}
                      />
                    )}
                    {blocksPage && (
                      <button
                        className="body-toggle"
                        onClick={() => setBodyShownFor(showBody ? null : file.path)}
                      >
                        {showBody ? 'Hide body text' : 'Show body text (empty)'}
                      </button>
                    )}
                    {showBody && (
                      <>
                        <Editor
                          key={`body:${file.path}`}
                          filename={file.path}
                          value={parts ? parts.body : file.text}
                          onChange={(body) =>
                            changeText(parts ? join(parts.frontmatter, body) : body)
                          }
                          onSave={() => void save()}
                          importImages={isMarkdown ? importImages : undefined}
                          prose={isMarkdown}
                        />
                      </>
                    )}
                  </>
                )}
              </main>
              {showPreview && !detached && (
                <>
                  <Splitter
                    direction="horizontal"
                    onDrag={(d) => setPreviewWidth((w) => clamp(w - d, 320, 1400))}
                  />
                  <section className="preview-column" style={{ width: previewWidth }}>
                    <Preview
                      status={hugo}
                      url={previewUrl}
                      reloadKey={reloadKey}
                      onDetach={toggleDetached}
                    />
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
        {showSetup && setup && <SetupDialog status={setup} onClose={() => setShowSetup(false)} />}
        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={menuItems(menu.entry)}
            onClose={() => setMenu(null)}
          />
        )}
        {dialog?.kind === 'new-page' && (
          <NewPageDialog
            directory={dialog.dir}
            onCancel={() => setDialog(null)}
            onSubmit={(title, filename) => {
              setDialog(null)
              void createPage(dialog.dir, title, filename)
            }}
          />
        )}
        {dialog?.kind === 'new-folder' && (
          <PromptDialog
            title="New folder"
            label={`Name of the folder in ${dialog.dir}`}
            initial=""
            submitLabel="Create"
            onCancel={() => setDialog(null)}
            onSubmit={(name) => {
              setDialog(null)
              void createFolder(dialog.dir, name)
            }}
          />
        )}
        {dialog?.kind === 'rename' && (
          <PromptDialog
            title={`Rename ${dialog.entry.name}`}
            label="New name"
            initial={dialog.entry.name}
            submitLabel="Rename"
            onCancel={() => setDialog(null)}
            onSubmit={(name) => {
              setDialog(null)
              void renameEntry(dialog.entry, name)
            }}
          />
        )}
        {gitDialog === 'new-branch' && gitStatus && (
          <NewBranchDialog
            base={gitStatus.base}
            prefix={branchPrefix}
            onCancel={() => setGitDialog(null)}
            onSubmit={(name) => {
              setGitDialog(null)
              void save().then(() => gitAction(() => window.api.git.createBranch(name)))
            }}
          />
        )}
        {gitDialog === 'switch-branch' && gitStatus && (
          <SwitchBranchDialog
            branches={branches}
            current={gitStatus.branch}
            onCancel={() => setGitDialog(null)}
            onSubmit={(name) => {
              setGitDialog(null)
              void switchBranch(name)
            }}
          />
        )}
        {gitDialog === 'merge' && gitStatus && (
          <ConfirmDialog
            title={`Merge into ${gitStatus.base}`}
            action="Merge"
            onCancel={() => setGitDialog(null)}
            onConfirm={() => void mergeToBase()}
          >
            <p className="dialog-note">
              The {gitStatus.aheadOfBase} commit{gitStatus.aheadOfBase === 1 ? '' : 's'} on{' '}
              {gitStatus.branch} become part of {gitStatus.base} on GitHub.{' '}
              {prefs?.deleteMergedBranch === false
                ? 'The branch stays and you keep working on it.'
                : `The branch is then removed and you continue on ${gitStatus.base}.`}
            </p>
          </ConfirmDialog>
        )}
        {releaseDialog && (
          <ConfirmDialog
            title={
              releaseDialog.to === 'production'
                ? `Publish ${releaseDialog.from}`
                : `Merge ${releaseDialog.from} into ${releaseDialog.to}`
            }
            action={releaseDialog.to === 'production' ? 'Publish' : 'Merge'}
            onCancel={() => setReleaseDialog(null)}
            onConfirm={() => void runRelease(releaseDialog)}
          >
            <p className="dialog-note">
              {releaseDialog.count} change{releaseDialog.count === 1 ? '' : 's'} on{' '}
              {releaseDialog.from} go to {releaseDialog.to}.{' '}
              {releaseDialog.to === 'production'
                ? 'A pull request is opened and merged, and the live site updates a few minutes later.'
                : 'GitHub publishes the branch a few minutes later.'}
            </p>
          </ConfirmDialog>
        )}
        {showSettings && prefs && (
          <SettingsDialog
            prefs={prefs}
            onChange={(p) => {
              setPrefs(p)
              void window.api.prefs.set(p)
            }}
            onClose={() => setShowSettings(false)}
          />
        )}
        {gitDialog === 'identity' && (
          <IdentityDialog
            onCancel={() => {
              setGitDialog(null)
              setPendingCommit(null)
            }}
            onSubmit={(id) => void saveIdentity(id)}
          />
        )}
        {dialog?.kind === 'duplicate' && (
          <PromptDialog
            title={`Duplicate ${dialog.entry.name}`}
            label="Name of the copy"
            initial={copyName(dialog.entry.name)}
            submitLabel="Duplicate"
            onCancel={() => setDialog(null)}
            onSubmit={(name) => {
              setDialog(null)
              void duplicateFile(dialog.entry, name)
            }}
          />
        )}
      </div>
    </SchemaProvider>
  )
}
