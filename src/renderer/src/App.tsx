import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Change,
  DirEntry,
  GitStatus,
  SetupStatus,
  HugoStatus,
  Identity,
  ImportedDocument,
  MenuCommand,
  RepoInfo,
  OutsideEntry,
  RebaseState,
  ReleaseStep,
  Preferences,
  SearchMatch,
  SearchOptions,
  SidebarTab
} from '../../shared/types'
import { EditorView } from '@codemirror/view'
import ChangesPanel from './components/ChangesPanel'
import ClaudePane from './components/ClaudePane'
import ConflictEditor from './components/ConflictEditor'
import ContextMenu, { type MenuItem } from './components/ContextMenu'
import { NewPageDialog, PromptDialog, type NewPage } from './components/Dialogs'
import CommitList from './components/CommitList'
import DiffView from './components/DiffView'
import Editor, { type Selection } from './components/Editor'
import FileTree from './components/FileTree'
import {
  ConfirmDialog,
  IdentityDialog,
  NewSiteDialog,
  OpenSiteDialog,
  NewBranchDialog,
  SwitchBranchDialog,
  DeleteBranchDialog
} from './components/GitDialogs'
import Frontmatter from './components/Frontmatter'
import PageFinder from './components/PageFinder'
import ReviewDialog from './components/ReviewDialog'
import ShareButton, { type Shared } from './components/ShareButton'
import Preview from './components/Preview'
import { SchemaProvider } from './components/SchemaContext'
import { imagePath, imageUrl, sectionImageFolder, useSiteInfo } from './lib/site'
import SearchPanel, { type SearchRequest } from './components/SearchPanel'
import { BodyFollower } from './components/PreviewFollow'
import Splitter from './components/Splitter'
import { openFind } from './lib/findPanel'
import { forgetTarget, onShow } from './lib/previewScroll'
import { loadLayout, saveLayout } from './lib/layout'
import Toolbar from './components/Toolbar'
import SetupDialog from './components/SetupDialog'
import SettingsDialog from './components/SettingsDialog'
import { UpdateButton } from './components/UpdateButton'
import Welcome, { type SiteDialog } from './components/Welcome'
import { join, split } from './lib/frontmatter'
import { branchPrefix } from '../../shared/branchPrefix'
import { askClaude } from './lib/claudeTerminal'
import { mergeSettings, newPageText } from './lib/newPage'
import { setLinkTargets, siteFile } from './lib/linkCheck'
import { usePages } from './lib/pages'
import { pageAddress, reviewLink as makeReviewLink, type ReviewLink } from '../../shared/reviewLink'
import { currentListKey } from './lib/schema'

interface OpenFile {
  path: string
  text: string
  saved: string
}

interface SearchHit {
  path: string
  line: number
  column: number
}

// Text to select after opening a file: in the page body or in its settings as YAML.
interface Target extends Selection {
  path: string
  part: 'body' | 'frontmatter'
}

type DialogState =
  | { kind: 'new-page'; dir: string; document?: ImportedDocument }
  | { kind: 'new-folder'; dir: string }
  | { kind: 'rename'; entry: DirEntry }
  | { kind: 'duplicate'; entry: DirEntry }

const imageFile = /\.(png|jpe?g|gif|webp|svg|ico|avif)$/i
const binaryFile = /\.(pdf|zip|gz|woff2?|ttf|otf|eot|mp4|mov|webm|mp3)$/i
const markdownFile = /\.(md|markdown)$/i
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
// How to speak of an entry outside the site: a file, or a folder and what it holds.
const outsideWords = (entry: OutsideEntry): { what: string } => ({
  what: !entry.isDir
    ? 'it'
    : entry.files === 1
      ? 'the file in it'
      : `the ${entry.files} files in it`
})
const extensionFor = (type: string): string =>
  ({
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/avif': '.avif'
  })[type] ?? '.png'
const isNew = (change: Change): boolean => change.kind === 'untracked' || change.kind === 'added'
// The name a dropped file gets, as Repo.importFile makes it.
const importName = (name: string): string => {
  const dot = name.lastIndexOf('.')
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return (clean || 'file') + ext.toLowerCase()
}
// A cheap fingerprint of a text, to notice changes without carrying the text around.
function hashText(text: string): number {
  let h = text.length
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return h
}
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const parentOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
const inDir = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name)
// File and folder names stay lowercase with hyphens, as the site's URLs expect.
const normalizeName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, '-')
const copyName = (name: string): string => name.replace(/(\.[^.]+)?$/, '-copy$1')
const editorAt = (el: Element | null | undefined): EditorView | null =>
  el ? EditorView.findFromDOM(el as HTMLElement) : null
const focusedEditor = (): EditorView | null =>
  editorAt(document.activeElement?.closest('.cm-editor'))
const bodyEditor = (): EditorView | null =>
  editorAt(document.querySelector('.editor-column > .editor .cm-editor'))
const yamlEditor = (): EditorView | null =>
  editorAt(document.querySelector('.frontmatter-raw .cm-editor'))
// One line of selected text in the focused editor, to seed a search with.
const selectedText = (): string | null => {
  const view = focusedEditor()
  if (!view) return null
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to)
  return text !== '' && !text.includes('\n') ? text : null
}
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
  // New site or Clone, from the Welcome screen or the File menu.
  const [siteDialog, setSiteDialog] = useState<SiteDialog>(null)
  const [showPreview, setShowPreview] = useState(layout.showPreview)
  const [detached, setDetached] = useState(layout.detached)
  const [pagePath, setPagePath] = useState('/')
  const [showClaude, setShowClaude] = useState(layout.showClaude)
  const [sidebarWidth, setSidebarWidth] = useState(layout.sidebarWidth)
  const [previewWidth, setPreviewWidth] = useState(layout.previewWidth)
  const [claudeHeight, setClaudeHeight] = useState(layout.claudeHeight)
  const [frontmatterHeight, setFrontmatterHeight] = useState(layout.frontmatterHeight)
  const [showAllFiles, setShowAllFiles] = useState(layout.showAllFiles)
  const [showTitles, setShowTitles] = useState(layout.showTitles)
  const [previewMode, setPreviewMode] = useState(layout.previewMode)
  const [bodyShownFor, setBodyShownFor] = useState<string | null>(null)
  const site = useSiteInfo(repo?.path ?? null)
  const pages = usePages(repo?.path ?? null, site.contentDir)
  const [finding, setFinding] = useState(false)
  const [reviewLink, setReviewLink] = useState<ReviewLink | null>(null)
  const [pastingLink, setPastingLink] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['content']))
  const [menu, setMenu] = useState<{ x: number; y: number; entry: DirEntry } | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(layout.sidebarTab)
  const [searchRequest, setSearchRequest] = useState<SearchRequest | null>(null)
  const [searchHit, setSearchHit] = useState<SearchHit | null>(null)
  const [select, setSelect] = useState<Target | null>(null)
  const [bodyView, setBodyView] = useState<EditorView | null>(null)
  const [diff, setDiff] = useState<{ change: Change; text: string | null } | null>(null)
  const [gitDialog, setGitDialog] = useState<
    'new-branch' | 'move' | 'switch-branch' | 'delete-branch' | 'identity' | 'merge' | null
  >(null)
  const [releaseDialog, setReleaseDialog] = useState<ReleaseStep | null>(null)
  const [outsideDialog, setOutsideDialog] = useState<{
    entry: OutsideEntry
    action: 'include' | 'trash'
  } | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const claudeOn = prefs?.claude !== false
  const [showSettings, setShowSettings] = useState(false)
  useEffect(() => {
    void window.api.prefs.get().then(setPrefs)
  }, [])

  // Shifted variants of the text size shortcuts arrive as "+" and "_", which the menu's
  // accelerators do not match on every keyboard layout. A match in the menu never gets here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const step = ['+', '='].includes(e.key) ? 1 : ['-', '_'].includes(e.key) ? -1 : null
      if (step === null) return
      e.preventDefault()
      e.stopPropagation()
      window.api.zoom(step)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
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

  const open = async (path: string): Promise<string | null> => {
    await save()
    setDiff(null)
    if (imageFile.test(path) || binaryFile.test(path)) {
      setFile({ path, text: '', saved: '' })
      return null
    }
    const text = await window.api.repo.read(path)
    setFile({ path, text, saved: text })
    return text
  }

  // A hit is selected in the page body, or in the page settings shown as YAML.
  const openMatch = async (path: string, match: SearchMatch): Promise<void> => {
    setSearchHit({ path, line: match.line, column: match.column })
    const text = await open(path)
    if (text === null) return
    const lines = text.split('\n')
    const offset = lines.slice(0, match.line - 1).reduce((n, l) => n + l.length + 1, 0)
    const at = offset + match.column
    const tick = Date.now()
    const parts = markdownFile.test(path) ? split(text) : null
    if (!parts) return setSelect({ path, part: 'body', from: at, to: at + match.length, tick })
    const bodyStart = text.length - parts.body.length
    if (at >= bodyStart) {
      const from = at - bodyStart
      return setSelect({ path, part: 'body', from, to: from + match.length, tick })
    }
    if (parts.frontmatter === null) return
    const fmStart = text.match(/^---\r?\n/)?.[0].length ?? 0
    const from = at - fmStart
    if (from < 0 || from + match.length > parts.frontmatter.length) return
    setSelect({ path, part: 'frontmatter', from, to: from + match.length, tick })
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

  // A page made from a document gets its text, its settings if it brings any, and its
  // pictures, copied to the section's images folder under the page's name.
  const createPage = async (dir: string, page: NewPage): Promise<void> => {
    const path = inDir(dir, page.filename)
    try {
      const template = await window.api.repo.newest(dir)
      let text = newPageText(template, page.title, page.date)
      if (page.document) {
        const { parts, images } = page.document
        const slug = page.filename.replace(/\.md$/, '')
        const under = dir.startsWith(site.contentDir + '/')
          ? dir.slice(site.contentDir.length + 1)
          : ''
        const folder = `${site.imagesDir}/${under.split('/')[0] || 'pages'}`
        let body = parts.body
        for (const [i, src] of images.entries()) {
          const rel = await window.api.repo.importFile(src, folder, `${slug}-${i + 1}`)
          const name = src.split('/').pop()!
          body = body.split(`(${name})`).join(`(${imageUrl(site, rel)})`)
        }
        const own = split(text)
        const settings = parts.frontmatter
          ? (mergeSettings(own.frontmatter ?? '', parts.frontmatter) ?? own.frontmatter)
          : own.frontmatter
        text = join(settings, '\n' + body, own.format)
      }
      await window.api.repo.create(path, text)
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

  // Files dropped on the tree land in that folder, except images dropped among the pages,
  // which go to the images folder of the section; anything else out of place is asked about.
  const dropFiles = async (dir: string, files: File[]): Promise<void> => {
    try {
      let last: string | null = null
      for (const f of files) {
        const { warning, home } = await window.api.repo.placement(inDir(dir, importName(f.name)))
        if (warning && !home && !window.confirm(`${warning}\n\nAdd it here anyway?`)) continue
        last = await window.api.repo.importFile(window.api.files.pathFor(f), home ?? dir)
      }
      if (last) await open(last)
    } catch (e) {
      fail(e)
    }
  }

  // Images dropped or pasted into a page body land in the images folder of its section.
  const sectionImages = (): string => imagePath(site, sectionImageFolder(site, file?.path ?? null))

  const importImages = async (files: File[]): Promise<string[]> => {
    const urls: string[] = []
    for (const f of files) {
      const rel = await window.api.repo.importFile(window.api.files.pathFor(f), sectionImages())
      urls.push(imageUrl(site, rel))
    }
    return urls
  }

  // A pasted picture, as data or by address, is saved under the page's name. Pictures
  // already in the site stay where they are. One that cannot be saved keeps its address,
  // without a message for each of the many a pasted web page may hold.
  const pasteImage = async (source: Blob | string): Promise<string | null> => {
    if (typeof source === 'string') {
      const own = siteFile(source)
      if (own) return own
      if (source.startsWith(site.imagesUrl + '/')) return source
    }
    const dir = sectionImages()
    const name = (file?.path.split('/').pop() ?? 'image').replace(/\.[^.]+$/, '') + '-image'
    try {
      let rel: string
      if (typeof source !== 'string') {
        const data = new Uint8Array(await source.arrayBuffer())
        rel = await window.api.repo.importBytes(data, dir, name, extensionFor(source.type))
      } else if (source.startsWith('data:')) {
        const m = source.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/)
        if (!m) return null
        const data = m[2]
          ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0))
          : new TextEncoder().encode(decodeURIComponent(m[3]))
        rel = await window.api.repo.importBytes(data, dir, name, extensionFor(m[1]))
      } else if (/^https?:\/\//.test(source)) {
        rel = await window.api.repo.importUrl(source, dir, name)
      } else return null
      return imageUrl(site, rel)
    } catch (e) {
      console.warn('Pasted picture not saved:', e)
      return null
    }
  }

  // A whole page pasted into an empty body: its settings fill in the page's settings,
  // overriding the defaults the new page started with, and its text becomes the body.
  const pasteDocument = (frontmatter: string, body: string): boolean => {
    const current = fileRef.current
    if (!current) return false
    const page = split(current.text)
    if (page.format !== 'yaml') return false
    const merged = mergeSettings(page.frontmatter ?? '', frontmatter)
    if (merged === null) return false
    changeText(join(merged, '\n' + body.replace(/^\s*\n/, ''), 'yaml'))
    return true
  }

  // Paste as plain text: the clipboard's text exactly, into whatever has focus.
  const pastePlain = async (): Promise<void> => {
    const text = await window.api.clipboardText()
    const view = focusedEditor()
    if (view) {
      view.dispatch(view.state.replaceSelection(text))
      return
    }
    const el = document.activeElement
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      document.execCommand('insertText', false, text)
    }
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

  // Find works in the editor with focus, else in the page body or the settings as YAML;
  // without any editor, it searches the site.
  const findInSite = useCallback((replace: boolean): void => {
    setSidebarTab('search')
    setSearchRequest({ tick: Date.now(), text: selectedText(), replace })
  }, [])

  const find = useCallback(
    (replace: boolean): void => {
      const view = focusedEditor() ?? bodyEditor() ?? yamlEditor()
      if (view) openFind(view, replace)
      else findInSite(replace)
    },
    [findInSite]
  )

  // Every hit in the site is rewritten; the open page is read back afterwards.
  const replaceAll = async (
    query: string,
    options: SearchOptions,
    replacement: string
  ): Promise<void> => {
    await save()
    try {
      await window.api.repo.replace(query, options, replacement)
    } catch (e) {
      fail(e)
    }
    if (file) await reopen(file.path)
  }

  const repoPath = repo?.path
  // A new or cloned site opening ends its dialog.
  useEffect(() => window.api.repo.onOpened(() => setSiteDialog(null)), [])

  // Links in the editors are checked against the site's pages, reloaded after changes.
  useEffect(() => {
    if (!repoPath) return
    let timer: number | undefined
    const load = (): void => {
      void window.api.repo
        .linkTargets()
        .then(({ targets, hosts }) => setLinkTargets(targets, hosts))
        .catch(() => undefined)
    }
    load()
    const off = window.api.repo.onChanged(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(load, 2000)
    })
    return () => {
      off()
      window.clearTimeout(timer)
    }
  }, [repoPath])
  useEffect(() => {
    if (!repoPath) return
    void window.api.git.status().then(setGitStatus)
    void window.api.git.identity().then(setIdentity)
    return window.api.git.onStatus(setGitStatus)
  }, [repoPath])

  // Files an update or pull left with conflicts, while it waits on them: those still
  // with markers, and all of them, settled ones included, which keep their editor.
  const rebaseState = gitStatus?.rebase ?? null
  const ofKind = (...kinds: string[]): string[] =>
    rebaseState
      ? (gitStatus?.changes ?? []).filter((c) => kinds.includes(c.kind)).map((c) => c.path)
      : []
  const conflictPaths = ofKind('conflict')
  const conflictFiles = ofKind('conflict', 'resolved')
  const inConflict = (path: string | undefined): boolean =>
    path !== undefined && conflictFiles.includes(path)

  // When an update or pull stops on conflicts, the first conflicting file opens for
  // settling, once per stop; one already open stays. Settling one does not move on.
  const conflictKey = rebaseState ? `${rebaseState.edits}:${conflictFiles.join('\n')}` : ''
  const shownConflicts = useRef('')
  useEffect(() => {
    if (conflictKey === shownConflicts.current) return
    shownConflicts.current = conflictKey
    if (conflictPaths.length === 0) return
    if (inConflict(fileRef.current?.path)) setDiff(null)
    else void open(conflictPaths[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictKey])

  // Without a commit identity, the checkout asks for one on opening, once setup is not
  // busy: signing in to GitHub during setup provides it by itself.
  const setupBusy = setup?.steps.some((s) => ['running', 'action'].includes(s.state)) ?? true
  const identityChecked = useRef<string | null>(null)
  useEffect(() => {
    if (!repoPath || setupBusy || identityChecked.current === repoPath) return
    identityChecked.current = repoPath
    void window.api.git.identity().then((found) => {
      if (found) setIdentity(found)
      else setGitDialog((d) => d ?? 'identity')
    })
  }, [repoPath, setupBusy])

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
    const question = isNew(change)
      ? `Move the new file ${change.path} to the Trash?`
      : `Discard the changes to ${change.path}?`
    if (!window.confirm(question)) return
    await save()
    await gitAction(() => window.api.git.discard(change.path, isNew(change)))
    if (diff?.change.path === change.path) setDiff(null)
    if (file?.path === change.path) await reopen(change.path)
  }

  const discardAll = async (changes: Change[]): Promise<void> => {
    const question = `Discard all ${changes.length} changes? New files move to the Trash.`
    if (!window.confirm(question)) return
    await save()
    for (const change of changes) {
      await gitAction(() => window.api.git.discard(change.path, isNew(change)))
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

  const continueRebase = async (): Promise<void> => {
    await save()
    await gitAction(() => window.api.git.continueRebase())
    setDiff(null)
  }

  const cancelRebase = async (): Promise<void> => {
    const question =
      'Cancel bringing in the changes? Your branch and your edits go back to how they were before, and any conflicts you settled are lost.'
    if (!window.confirm(question)) return
    await save()
    await gitAction(() => window.api.git.abortRebase())
    setDiff(null)
  }

  // Claude settles the conflicts by editing the files; continuing stays the editor's call,
  // once they have looked at the result.
  const resolveWithClaude = (paths: string[], { from, edits }: RebaseState): void => {
    const where = from === 'GitHub' ? 'my branch on GitHub' : from
    const what = edits
      ? `Putting back my edits that were not committed yet, after bringing in the changes from ${where},`
      : `Bringing in the changes from ${where}`
    setShowClaude(true)
    const sent = askClaude(
      `${what} stopped on conflicts in ${paths.join(', ')}. In each file, the part between ` +
        `<<<<<<< and ======= is the version from ${where}, and the part between ======= and ` +
        `>>>>>>> is ${edits ? 'my edit' : 'mine'}. Combine the two so that what each side ` +
        'changed is kept, and remove the marker lines. Where they truly contradict each ' +
        'other, ask me which to keep. Only edit these files and do not run git commands that ' +
        'change anything. When you are done, tell me briefly what you combined, and that I ' +
        'should click Continue in the Changes tab.'
    )
    if (!sent) window.alert('Claude is not running. Open the Claude pane and try again.')
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

  // Review links: one Galley was opened with, one arriving later, or one pasted.
  useEffect(() => {
    const take = (): void => {
      void window.api.link.take().then((link) => link && setReviewLink(link))
    }
    take()
    return window.api.link.onArrived(take)
  }, [])

  // The page a review link names: its path, or the page or alias at its address.
  const linkedPage = (link: ReviewLink): string | null => {
    if (link.page) return link.page.startsWith(site.contentDir + '/') ? link.page : null
    if (!link.url) return null
    const url = pageAddress(link.url)
    const all = [...pages.values()]
    return (
      (all.find((p) => p.url === url) ?? all.find((p) => p.aliases.includes(url)))?.path ?? null
    )
  }

  // Commits the editor's own changes where they are, switches to the reviewed branch and
  // opens the linked page. Errors surface in the dialog.
  const openReview = async (link: ReviewLink): Promise<void> => {
    await save()
    const changes = (gitStatus?.changes ?? []).filter((c) => !c.warning)
    if (gitStatus?.branch !== link.branch) {
      if (changes.length > 0) {
        await window.api.git.commit(
          `Work in progress, before reviewing ${link.branch}`,
          changes.map((c) => c.path)
        )
      }
      await window.api.git.startReview(link.branch)
    }
    setReviewLink(null)
    setDiff(null)
    setSidebarTab('files')
    // The page may exist only on the branch just opened, so its address is looked up anew.
    const path =
      linkedPage(link) ?? (link.url ? await window.api.repo.pageAt(pageAddress(link.url)) : null)
    if (path) {
      reveal(path)
      await open(path)
    } else if (file) await reopen(file.path)
  }

  const endReview = async (): Promise<void> => {
    await save()
    await gitAction(() => window.api.git.endReview())
    setDiff(null)
    if (file) await reopen(file.path)
  }

  // A link to the branch on GitHub, and to the open page, for a colleague to review;
  // copied, and returned to show what was copied.
  // A branch GitHub lacks, or commits it has not had yet, are sent first, so the link
  // opens what the editor sees.
  const shareReview = async (): Promise<Shared | null> => {
    const status = gitStatus
    if (!status?.branch) return null
    const behindGitHub = !status.upstream || status.ahead > 0
    const pushed = behindGitHub && !status.protected
    if (pushed) {
      try {
        await window.api.git.push()
      } catch (e) {
        fail(e)
        return null
      }
    }
    const repoName = status.remoteUrl?.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/)?.[1]
    const page = file?.path.startsWith(site.contentDir + '/') ? file.path : null
    const link = makeReviewLink({ repo: repoName ?? null, branch: status.branch, page })
    await window.api.clipboardWrite(link)
    return { link, pushed }
  }

  const openSwitchBranch = async (): Promise<void> => {
    try {
      setBranches(await window.api.git.branches())
      setGitDialog('switch-branch')
    } catch (e) {
      fail(e)
    }
  }

  const openDeleteBranch = async (): Promise<void> => {
    try {
      setBranches(await window.api.git.ownBranches())
      setGitDialog('delete-branch')
    } catch (e) {
      fail(e)
    }
  }

  const deleteBranch = async (name: string, onGitHub: boolean): Promise<void> => {
    await save()
    await gitAction(() => window.api.git.deleteBranch(name, onGitHub))
    setDiff(null)
    if (file) await reopen(file.path)
  }

  const ownPrefix = branchPrefix(identity?.email)

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
  const textPreview = filePath ? site.textPreviews[filePath] : undefined
  useEffect(() => {
    forgetTarget()
    if (!filePath) return
    if (textPreview) return
    let live = true
    void window.api.repo.pageUrl(filePath).then((url) => {
      if (live && url) setPagePath(url)
    })
    return () => {
      live = false
    }
  }, [filePath, textPreview])

  // Claude hears which page is open, so "this page" means what the editor sees.
  useEffect(() => window.api.terminal.context(filePath), [filePath])

  // A data file the home page renders as text, e.g. llms.txt, is previewed as that text.
  const shownPath = textPreview ?? pagePath
  const previewUrl = hugo.state === 'running' && hugo.url ? hugo.url + shownPath : null

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
      frontmatterHeight,
      sidebarTab,
      showAllFiles,
      showTitles,
      previewMode
    })
  }, [
    showPreview,
    showClaude,
    detached,
    sidebarWidth,
    previewWidth,
    claudeHeight,
    frontmatterHeight,
    sidebarTab,
    showAllFiles,
    showTitles,
    previewMode
  ])

  // The text view fetches again when the file's text changes.
  const fileText = file?.text ?? ''
  const contentVersion = useMemo(() => hashText(fileText), [fileText])
  // Hugo cannot build a site with conflict markers in it, and its error would only confuse.
  const previewNotice =
    conflictPaths.length > 0
      ? 'The preview is paused while changes conflict.\n\nSettle the conflicts in the editor and click Continue; the preview comes back then.'
      : null
  const previewState = useMemo(
    () => ({
      url: previewUrl,
      mode: previewMode,
      version: contentVersion,
      status: hugo,
      markdownSuffix: site.markdownSuffix,
      notice: previewNotice
    }),
    [previewUrl, previewMode, contentVersion, hugo, site.markdownSuffix, previewNotice]
  )

  // A preview in its own window follows what the bar in this window says; one that was
  // detached when Galley closed reopens there.
  useEffect(() => {
    if (detached) window.api.preview.detach(previewState)
  }, [detached, previewState])

  const toggleDetached = useCallback(() => {
    if (detached) window.api.preview.attach()
    else setDetached(true)
  }, [detached])

  useEffect(() => window.api.preview.onClosed(() => setDetached(false)), [])
  useEffect(() => window.api.preview.onMode(setPreviewMode), [])

  useEffect(() => {
    if (detached && reloadKey) window.api.preview.reload()
  }, [detached, reloadKey])

  // The folder new pages go to: the open page's, else the content folder.
  const pageDir = (): string =>
    file?.path.startsWith(site.contentDir + '/') ? parentOf(file.path) : site.contentDir

  // The open file as the tree shows it, for the File menu's page commands.
  const openEntry = (): DirEntry | null =>
    file ? { name: file.path.split('/').pop() ?? file.path, path: file.path, isDir: false } : null

  const newPageFromDocument = async (): Promise<void> => {
    try {
      const document = await window.api.repo.chooseDocument()
      if (document) setDialog({ kind: 'new-page', dir: pageDir(), document })
    } catch (e) {
      fail(e)
    }
  }

  // Pictures picked from disk go to the section's images folder; the last one opens.
  const addImages = async (): Promise<void> => {
    try {
      let last: string | null = null
      for (const path of await window.api.repo.chooseImages()) {
        last = await window.api.repo.importFile(path, sectionImages())
      }
      if (last) await open(last)
    } catch (e) {
      fail(e)
    }
  }

  const onMenu = (command: MenuCommand): void => {
    const entry = openEntry()
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
      case 'new-site':
        setSiteDialog('new')
        break
      case 'open-site':
        setSiteDialog('open')
        break
      case 'settings':
        setShowSettings(true)
        break
      case 'detach-preview':
        toggleDetached()
        break
      case 'toggle-terminal':
        if (claudeOn) setShowClaude((c) => !c)
        break
      case 'reload-preview':
        setReloadKey((k) => k + 1)
        break
      case 'find':
        find(false)
        break
      case 'replace':
        find(true)
        break
      case 'find-in-site':
        findInSite(false)
        break
      case 'replace-in-site':
        findInSite(true)
        break
      case 'paste-plain':
        void pastePlain()
        break
      case 'new-page':
        setDialog({ kind: 'new-page', dir: pageDir() })
        break
      case 'find-page':
        setFinding(true)
        break
      case 'open-review-link':
        setPastingLink(true)
        break
      case 'new-page-from-document':
        void newPageFromDocument()
        break
      case 'new-folder':
        setDialog({ kind: 'new-folder', dir: pageDir() })
        break
      case 'add-images':
        void addImages()
        break
      case 'duplicate-page':
        if (entry) setDialog({ kind: 'duplicate', entry })
        break
      case 'rename-page':
        if (entry) setDialog({ kind: 'rename', entry })
        break
      case 'trash-page':
        if (entry) void trashEntry(entry)
        break
      case 'open-in-browser':
        if (previewUrl) window.api.openExternal(previewUrl)
        break
      case 'show-in-finder':
        if (file) void window.api.repo.reveal(file.path)
        break
    }
  }

  // The menu reaches the handler of the latest render, which sees the current page.
  const menuHandler = useRef(onMenu)
  useEffect(() => {
    menuHandler.current = onMenu
  })
  useEffect(() => window.api.onMenu((command) => menuHandler.current(command)), [])
  useEffect(
    () => window.api.setMenuState({ site: !!repo, page: !!file, preview: !!previewUrl }),
    [repo, file, previewUrl]
  )

  if (repo === undefined) return null
  if (repo === null) return <Welcome dialog={siteDialog} onDialog={setSiteDialog} />

  const isMarkdown = file ? markdownFile.test(file.path) : false
  const parts = file && isMarkdown ? split(file.text) : null
  const dirty = file ? file.text !== file.saved : false
  // Pages built from components have no prose, so the settings form gets the whole column.
  const blocksPage =
    parts?.frontmatter != null &&
    new RegExp(`^${currentListKey()}:`, 'm').test(parts.frontmatter) &&
    parts.body.trim() === ''
  const showBody = !blocksPage || bodyShownFor === file?.path
  const newPageDir = pageDir()
  const selectIn = (part: Target['part']): Selection | undefined =>
    select && select.path === file?.path && select.part === part ? select : undefined

  return (
    <SchemaProvider repoPath={repo.path} site={site} page={file?.path ?? null}>
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
            <ShareButton
              status={gitStatus}
              page={file?.path.startsWith(site.contentDir + '/') ? file.path : null}
              onShare={shareReview}
            />
            <button
              className={showPreview || detached ? 'on' : ''}
              title={
                detached ? 'Bring the preview back into this window' : 'Show or hide the preview'
              }
              onClick={() => (detached ? toggleDetached() : setShowPreview(!showPreview))}
            >
              {detached ? 'Preview ↗' : 'Preview'}
            </button>
            {claudeOn && (
              <button className={showClaude ? 'on' : ''} onClick={() => setShowClaude(!showClaude)}>
                Claude
              </button>
            )}
          </div>
        </header>
        {gitStatus?.review && (
          <div className="review-bar">
            <span>
              Reviewing <strong>{gitStatus.review.branch}</strong>. Edits you commit here go to that
              branch.
            </span>
            <button onClick={() => void endReview()}>Back to {gitStatus.review.from}</button>
          </div>
        )}
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
              <button
                className={sidebarTab === 'search' ? 'on' : ''}
                onClick={() => setSidebarTab('search')}
              >
                Search
              </button>
            </div>
            <SearchPanel
              hidden={sidebarTab !== 'search'}
              request={searchRequest}
              selected={searchHit}
              onOpen={(path, match) => void openMatch(path, match)}
              onReplaceAll={replaceAll}
            />
            {sidebarTab === 'search' ? null : sidebarTab === 'files' ? (
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
                pages={pages}
                showTitles={showTitles}
                onToggleTitles={() => setShowTitles(!showTitles)}
                onFindPage={() => setFinding(true)}
                version={treeVersion}
              />
            ) : (
              <ChangesPanel
                status={gitStatus}
                me={identity}
                selected={diff?.change.path ?? null}
                onShowDiff={(c) => void (inConflict(c.path) ? open(c.path) : showDiff(c))}
                onDiscard={(c) => void discardChange(c)}
                onDiscardAll={(cs) => void discardAll(cs)}
                onCommit={commit}
                onPush={() => void save().then(() => gitAction(() => window.api.git.push()))}
                onPull={() => void save().then(() => gitAction(() => window.api.git.pull()))}
                onUpdate={() => void save().then(() => gitAction(() => window.api.git.update()))}
                onContinue={() => void continueRebase()}
                onCancelRebase={() => void cancelRebase()}
                onAskClaude={claudeOn ? resolveWithClaude : undefined}
                onFetch={() => void gitAction(() => window.api.git.fetch())}
                onNewBranch={() => setGitDialog('new-branch')}
                onMerge={() => setGitDialog('merge')}
                onMove={() => setGitDialog('move')}
                onOutside={(entry, action) =>
                  action === 'reveal'
                    ? void window.api.repo.reveal(entry.path)
                    : setOutsideDialog({ entry, action })
                }
                onRelease={setReleaseDialog}
                onPublish={setReleaseDialog}
                onSwitchBranch={() => void openSwitchBranch()}
                onDeleteBranch={() => void openDeleteBranch()}
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
                ) : file && rebaseState && inConflict(file.path) ? (
                  <ConflictEditor
                    key={`conflict:${file.path}`}
                    path={file.path}
                    text={file.text}
                    state={rebaseState}
                    onChange={changeText}
                    onSave={() => void save()}
                    onContinue={() => void continueRebase()}
                    onAskClaude={
                      claudeOn ? () => resolveWithClaude(conflictPaths, rebaseState) : undefined
                    }
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
                    {parts && parts.frontmatter !== null && (
                      <Frontmatter
                        key={`settings:${file.path}`}
                        text={parts.frontmatter}
                        format={parts.format}
                        onChange={(fm) => changeText(join(fm, parts.body, parts.format))}
                        grow={blocksPage}
                        height={blocksPage ? undefined : frontmatterHeight}
                        select={selectIn('frontmatter')}
                      />
                    )}
                    {parts && parts.frontmatter !== null && !blocksPage && (
                      <Splitter
                        direction="vertical"
                        onDrag={(d) => setFrontmatterHeight((h) => Math.max(80, h + d))}
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
                        {isMarkdown && <Toolbar view={bodyView} />}
                        {isMarkdown && <BodyFollower view={bodyView} />}
                        <Editor
                          key={`body:${file.path}`}
                          filename={file.path}
                          value={parts ? parts.body : file.text}
                          onChange={(body) =>
                            changeText(parts ? join(parts.frontmatter, body, parts.format) : body)
                          }
                          onSave={() => void save()}
                          importImages={isMarkdown ? importImages : undefined}
                          paste={isMarkdown ? { pasteImage, pasteDocument } : undefined}
                          prose={isMarkdown}
                          select={selectIn('body')}
                          onView={isMarkdown ? setBodyView : undefined}
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
                      mode={previewMode}
                      onMode={setPreviewMode}
                      version={contentVersion}
                      markdownSuffix={site.markdownSuffix}
                      detached={false}
                      onDetach={toggleDetached}
                      onAttach={toggleDetached}
                      targets={onShow}
                      notice={previewNotice}
                    />
                  </section>
                </>
              )}
            </div>
            <Splitter
              direction="vertical"
              hidden={!showClaude || !claudeOn}
              onDrag={(d) => setClaudeHeight((h) => clamp(h - d, 120, 900))}
            />
            <section
              className="claude-row"
              style={{ height: claudeHeight }}
              hidden={!showClaude || !claudeOn}
            >
              {claudeOn && <ClaudePane repoPath={repo.path} />}
            </section>
          </div>
        </div>
        {showSetup && setup && <SetupDialog status={setup} onClose={() => setShowSetup(false)} />}
        {siteDialog === 'new' && <NewSiteDialog onCancel={() => setSiteDialog(null)} />}
        {siteDialog === 'open' && <OpenSiteDialog onCancel={() => setSiteDialog(null)} />}
        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={menuItems(menu.entry)}
            onClose={() => setMenu(null)}
          />
        )}
        {reviewLink && (
          <ReviewDialog
            link={reviewLink}
            status={gitStatus}
            me={identity}
            page={pages.get(linkedPage(reviewLink) ?? '') ?? null}
            onOpen={() => openReview(reviewLink)}
            onChooseRepo={() => {
              setReviewLink(null)
              void window.api.repo.choose()
            }}
            onCancel={() => setReviewLink(null)}
          />
        )}
        {pastingLink && (
          <PromptDialog
            title="Open review link"
            label="Review link"
            initial=""
            submitLabel="Open"
            onCancel={() => setPastingLink(false)}
            onSubmit={(text) => {
              setPastingLink(false)
              void window.api.link
                .parse(text)
                .then((link) =>
                  link ? setReviewLink(link) : fail(new Error(`${text} is not a review link.`))
                )
            }}
          />
        )}
        {finding && (
          <PageFinder
            pages={pages}
            onOpen={(path) => {
              reveal(path)
              void open(path)
            }}
            onClose={() => setFinding(false)}
          />
        )}
        {dialog?.kind === 'new-page' && (
          <NewPageDialog
            directory={dialog.dir}
            initial={dialog.document}
            sectionUrl={
              dialog.dir.startsWith(site.contentDir + '/')
                ? `/${dialog.dir.slice(site.contentDir.length + 1)}/`
                : '/'
            }
            onCancel={() => setDialog(null)}
            onSubmit={(page) => {
              setDialog(null)
              void createPage(dialog.dir, page)
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
            prefix={ownPrefix}
            dirty={gitStatus.changes.length > 0}
            onCancel={() => setGitDialog(null)}
            onSubmit={(name) => {
              setGitDialog(null)
              void save().then(() => gitAction(() => window.api.git.createBranch(name)))
            }}
          />
        )}
        {gitDialog === 'move' && gitStatus && (
          <NewBranchDialog
            base={gitStatus.base}
            prefix={ownPrefix}
            dirty={false}
            note={`The ${plural(gitStatus.ahead, 'commit')} move to the new branch, and ${gitStatus.branch} goes back to what GitHub has. Uncommitted changes come along.`}
            onCancel={() => setGitDialog(null)}
            onSubmit={(name) => {
              setGitDialog(null)
              void save().then(() => gitAction(() => window.api.git.moveToBranch(name)))
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
        {gitDialog === 'delete-branch' && gitStatus && (
          <DeleteBranchDialog
            branches={branches}
            current={gitStatus.branch}
            base={gitStatus.base}
            onCancel={() => setGitDialog(null)}
            onSubmit={(name, onGitHub) => {
              setGitDialog(null)
              void deleteBranch(name, onGitHub)
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
              The {plural(gitStatus.aheadOfBase, 'commit')} on {gitStatus.branch} become part of{' '}
              {gitStatus.baseSite
                ? `${gitStatus.base}, which ${gitStatus.baseSite} shows`
                : gitStatus.base}
              . You keep working on {gitStatus.branch}
              {prefs?.deleteMergedBranch === false || !gitStatus.remoteUrl
                ? '.'
                : '; its copy on GitHub is removed until your next push.'}
            </p>
            <CommitList
              range={{ kind: 'branch' }}
              total={gitStatus.aheadOfBase}
              me={identity}
              summary
            />
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
              {plural(releaseDialog.count, 'change')} on {releaseDialog.from} go to{' '}
              {releaseDialog.to}.{' '}
              {releaseDialog.to === 'production'
                ? `A pull request is opened and merged, and ${releaseDialog.site ?? 'the live site'} updates a few minutes later.`
                : `${releaseDialog.site ?? 'The site'} follows a few minutes later.`}
            </p>
            <CommitList
              range={{ kind: 'release', from: releaseDialog.from, to: releaseDialog.to }}
              total={releaseDialog.count}
              me={identity}
              summary
            />
          </ConfirmDialog>
        )}
        {outsideDialog?.action === 'include' && (
          <ConfirmDialog
            title={`Add ${outsideDialog.entry.path} to the site?`}
            action="Add anyway"
            onCancel={() => setOutsideDialog(null)}
            onConfirm={() => {
              const { path } = outsideDialog.entry
              setOutsideDialog(null)
              void gitAction(() => window.api.git.include(path))
            }}
          >
            <p className="dialog-note">
              {outsideDialog.entry.path} is not one of the site&apos;s folders, so the site does not
              use {outsideWords(outsideDialog.entry).what}. Once committed,{' '}
              {outsideWords(outsideDialog.entry).what} would be on GitHub for everyone working on
              the site.
            </p>
            <p className="dialog-note">
              Drafts, documents and screenshots are better kept outside the site, for example in
              Documents. Only add this if it was asked for.
            </p>
          </ConfirmDialog>
        )}
        {outsideDialog?.action === 'trash' && (
          <ConfirmDialog
            title={`Move ${outsideDialog.entry.path} to the Trash?`}
            action="Move to Trash"
            onCancel={() => setOutsideDialog(null)}
            onConfirm={() => {
              const { path } = outsideDialog.entry
              setOutsideDialog(null)
              void gitAction(() => window.api.repo.trash(path))
            }}
          >
            <p className="dialog-note">
              {outsideDialog.entry.isDir
                ? `${outsideDialog.entry.path} and ${outsideWords(outsideDialog.entry).what} go to the Trash, where you can get them back until the Trash is emptied. To keep them, use Show in Finder and move the folder out of the site's folder.`
                : `${outsideDialog.entry.path} goes to the Trash, where you can get it back until the Trash is emptied. To keep it, use Show in Finder and move it out of the site's folder.`}
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
            initial={setup?.user && { name: setup.user.name ?? '', email: setup.user.email ?? '' }}
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
