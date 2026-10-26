import { randomUUID } from 'crypto'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  protocol,
  Rectangle,
  screen,
  shell
} from 'electron'
import { homedir } from 'os'
import { basename } from 'path'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type {
  ChatAnswer,
  ClaudeMode,
  CommitRange,
  Identity,
  Layout,
  MenuCommand,
  MenuState,
  Preferences,
  SearchOptions,
  SetupStepId
} from '../shared/types'
import { isDev } from './env'
import { claudeArgs, claudeLaunch, receiveDrops, setContext, type ClaudeLaunch } from './claude'
import { ClaudeChat, writeCommitMessage } from './chat'
import { importDocument } from './convert'
import { imageUses, planReplacement, renameImage, replaceImage } from './images'
import { clone, Git, run as runGit } from './git'
import { environmentSites } from './hugoConfig'
import { HugoServer } from './hugo'
import { dropPlacement } from './placement'
import { parseReviewLink, type ReviewLink } from '../shared/reviewLink'
import { showAbout } from './about'
import { installMenu, setMenuState } from './menu'
import { createSite } from './newSite'
import { Repo } from './repo'
import { replace, search } from './search'
import { loadSettings, prefs, saveSettings } from './settings'
import { keepLight, setAppearance, windowBackground } from './appearance'
import { Setup } from './setup'
import { ClaudeTerminal } from './terminal'
import { Updater } from './updater'

let win: BrowserWindow | null = null
// What the detached preview window shows; it asks on load and is told of changes.
let repo: Repo | null = null
let git: Git | null = null

const send = (channel: string, ...args: unknown[]): void => {
  win?.webContents.send(channel, ...args)
}

const hugo = new HugoServer((status) => send('hugo:status', status))
const updater = new Updater((status) => send('update:status', status))
const setup = new Setup((status) => send('setup:status', status), {
  openRepo: (path) => openRepo(path),
  hasRepo: () => repo !== null,
  restartHugo: () => {
    if (repo) void hugo.start(repo.path)
  }
})
const terminal = new ClaudeTerminal(
  (data) => send('terminal:data', data),
  (code) => send('terminal:exit', code)
)
// Claude waiting on the editor: the requests in the chat, and a bell from the terminal that
// the window has not seen yet. Galley never takes the focus for them; while it is in the
// background its Dock icon bounces once and carries a badge, with the number of requests.
const waiting = new Set<string>()
let rang = false

function attention(news: boolean): void {
  if (news && win && !win.isFocused()) app.dock?.bounce('informational')
  app.dock?.setBadge(waiting.size > 0 ? String(waiting.size) : rang ? '•' : '')
}

// Commits Claude asked for, waiting on the main window to make them.
const commits = new Map<string, (answer: string) => void>()

const chat = new ClaudeChat({
  status: (status) => send('chat:status', status),
  item: (item) => send('chat:item', item),
  request: (request) => {
    waiting.add(request.id)
    attention(true)
    send('chat:request', request)
  },
  settled: (id) => {
    waiting.delete(id)
    attention(false)
    send('chat:settled', id)
  },
  commit: (message, files) =>
    new Promise((resolve) => {
      if (!win) return resolve('Galley has no window open, so nothing was committed.')
      const id = randomUUID()
      commits.set(id, resolve)
      send('chat:commit', id, message, files)
    })
})

// What the Claude pane starts with in the site that is open.
const launch = async (opened: Repo): Promise<ClaudeLaunch> =>
  claudeLaunch(await opened.site(), prefs(), await environmentSites(opened.path))

const maxRecent = 8

// The recent sites that are still there.
const recentSites = (): string[] => (loadSettings().recent ?? []).filter((p) => Repo.isSite(p))

function refreshMenu(): void {
  installMenu({
    about: () => showAbout(win),
    manual: showManual,
    recent: recentSites(),
    openRecent: (path) => {
      if (Repo.isSite(path)) openRepo(path)
      else dialog.showErrorBox('Site not found', `${path} is no longer a site checkout.`)
    },
    checkUpdates: () => void updater.check(true),
    zoom,
    command: (command: MenuCommand) => send('menu', command)
  })
}

// Who commits in a new site: git's own setting, else the GitHub profile.
async function defaultIdentity(): Promise<Identity | null> {
  const get = (key: string): Promise<string> =>
    runGit(homedir(), ['config', '--global', key]).then(
      (s) => s.trim(),
      () => ''
    )
  const [name, email] = await Promise.all([get('user.name'), get('user.email')])
  if (name && email) return { name, email }
  const user = setup.status.user
  return user?.name && user.email ? { name: user.name, email: user.email } : null
}

function openRepo(path: string): void {
  repo?.close()
  git?.stop()
  terminal.kill()
  chat.stop()
  repo = new Repo(path, (paths) => {
    send('repo:changed', paths)
    git?.scheduleRefresh()
  })
  repo.watch()
  const opened = repo
  git = new Git(
    path,
    (status) => send('git:status', status),
    () => opened.site()
  )
  git.start()
  const settings = loadSettings()
  const recent = [path, ...(settings.recent ?? []).filter((p) => p !== path)].slice(0, maxRecent)
  saveSettings({ ...settings, repoPath: path, recent })
  refreshMenu()
  void hugo.start(path).then(() => hugo.refresh())
  setup.siteOpened()
  send('repo:opened')
}

async function chooseRepo(): Promise<boolean> {
  const result = await dialog.showOpenDialog({
    title: 'Open site checkout',
    message: 'Choose the folder holding the conclude.io website checkout',
    properties: ['openDirectory']
  })
  const path = result.filePaths[0]
  if (!path) return false
  if (!Repo.isSite(path)) {
    dialog.showErrorBox('Not a site checkout', `${path} has no Hugo configuration file.`)
    return false
  }
  openRepo(path)
  return true
}

// Saved bounds are used only when they still fall on a connected display.
function savedBounds(name: string): Partial<Rectangle> {
  const bounds = loadSettings().windows?.[name]
  if (!bounds) return {}
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) => {
    return (
      center.x >= a.x && center.x < a.x + a.width && center.y >= a.y && center.y < a.y + a.height
    )
  })
  return onScreen ? bounds : {}
}

function rememberBounds(window: BrowserWindow, name: string): void {
  let timer: NodeJS.Timeout | null = null
  const save = (): void => {
    if (window.isDestroyed() || window.isMinimized()) return
    const settings = loadSettings()
    saveSettings({ ...settings, windows: { ...settings.windows, [name]: window.getBounds() } })
  }
  const later = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, 500)
  }
  window.on('resize', later)
  window.on('move', later)
  window.on('close', save)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    ...savedBounds('main'),
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: windowBackground(),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })
  rememberBounds(win, 'main')
  win.on('focus', () => {
    rang = false
    attention(false)
  })
  win.on('ready-to-show', () => win?.show())
  win.webContents.on('did-finish-load', () => {
    win?.webContents.setZoomLevel(loadSettings().zoom ?? 0)
  })
  closingTools = false
  win.on('close', () => {
    closingTools = true
    for (const child of toolWindows.values()) child.close()
  })
  win.on('closed', () => {
    win = null
  })
  win.webContents.setWindowOpenHandler((details) => {
    const tool = toolOf(details.frameName)
    if (tool) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: toolWindowOptions(tool, details.features)
      }
    }
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  win.webContents.on('did-create-window', (child, { frameName }) => {
    const tool = toolOf(frameName)
    if (tool) watchToolWindow(child, tool)
  })
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// The manual, Galley's own renderer page at #manual, opens beside the main window; links
// out of it go to the browser.
let manualWin: BrowserWindow | null = null

function showManual(): void {
  if (manualWin) {
    manualWin.focus()
    return
  }
  manualWin = new BrowserWindow({
    width: 900,
    height: 900,
    minWidth: 500,
    minHeight: 400,
    title: 'Galley Manual',
    show: false,
    backgroundColor: windowBackground(),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  if (win) {
    const main = win.getBounds()
    const [width, height] = manualWin.getSize()
    manualWin.setPosition(
      Math.round(main.x + (main.width - width) / 2),
      Math.round(main.y + Math.max(0, (main.height - height) / 2))
    )
  }
  manualWin.on('page-title-updated', (e) => e.preventDefault())
  manualWin.on('ready-to-show', () => manualWin?.show())
  manualWin.on('closed', () => {
    manualWin = null
  })
  manualWin.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void manualWin.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#manual')
  } else {
    void manualWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'manual' })
  }
}

// Tool windows the editor gave windows of their own, by tool. The renderer opens them
// from its own page (see toolWindows.ts); here they get their size and place, the one
// each had last when that is still on a connected screen, and their closing is reported.
const toolWindows = new Map<string, BrowserWindow>()
// The main window is closing and takes them along; they stay tool windows of their own,
// to open again next time.
let closingTools = false

const toolOf = (frameName: string): string | null =>
  frameName.match(/^galley-tool:(\w+)$/)?.[1] ?? null

const toolTitles: Record<string, string> = {
  files: 'Files',
  changes: 'Changes',
  search: 'Search',
  claude: 'Claude',
  preview: 'Preview'
}

// Where a tool window's own window opens: at the point it was dropped, the size it had
// last; else where it was last; else beside the main window.
function toolWindowOptions(
  tool: string,
  features: string
): Electron.BrowserWindowConstructorOptions {
  const at = Object.fromEntries(
    features
      .split(',')
      .map((f) => f.split('='))
      .filter(([k, v]) => k && v)
      .map(([k, v]) => [k.trim(), Number(v)])
  )
  const saved = savedBounds(`tool:${tool}`)
  const fallback = tool === 'preview' ? [900, 800] : tool === 'claude' ? [560, 700] : [360, 640]
  const size = { width: saved.width ?? fallback[0], height: saved.height ?? fallback[1] }
  let place: Partial<Rectangle> = {}
  if (Number.isFinite(at['left']) && Number.isFinite(at['top'])) {
    place = { x: at['left'], y: at['top'] }
  } else if (saved.x !== undefined) {
    place = { x: saved.x, y: saved.y }
  } else if (win) {
    const main = win.getBounds()
    place = { x: main.x + main.width - size.width - 40, y: main.y + 80 }
  }
  return {
    ...size,
    ...place,
    title: toolTitles[tool] ?? 'Galley',
    minWidth: 240,
    minHeight: 160,
    backgroundColor: windowBackground(),
    // Its tab bar is its title bar: Galley moves the window itself as the bar is dragged,
    // so it knows when the drag ends and can dock it then (see Docks.tsx). A press on a
    // window in the background starts that at once, rather than only bringing it forward.
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 12 },
    acceptFirstMouse: true,
    webPreferences: { sandbox: false, webviewTag: true }
  }
}

function watchToolWindow(child: BrowserWindow, tool: string): void {
  toolWindows.set(tool, child)
  rememberBounds(child, `tool:${tool}`)
  child.webContents.setZoomLevel(loadSettings().zoom ?? 0)
  // The File menu has no Close, so the window closes on ⌘W itself.
  child.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.meta && input.key.toLowerCase() === 'w') {
      e.preventDefault()
      child.close()
    }
  })
  child.on('closed', () => {
    if (toolWindows.get(tool) === child) toolWindows.delete(tool)
    if (!closingTools) send('tool:closed', tool)
  })
}

// The preview stays on the site: a link to anywhere else opens in the browser, and one
// that asks for a new window opens in the preview itself.
function watchPreviews(): void {
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() !== 'webview') return
    keepLight(contents)
    const outside = (url: string): boolean => {
      const site = hugo.status.state === 'running' ? hugo.status.url : null
      try {
        return !site || new URL(url).origin !== new URL(site).origin
      } catch {
        return true
      }
    }
    contents.on('will-navigate', (e) => {
      if (!outside(e.url)) return
      e.preventDefault()
      void shell.openExternal(e.url)
    })
    contents.setWindowOpenHandler(({ url }) => {
      if (outside(url)) void shell.openExternal(url)
      else void contents.loadURL(url)
      return { action: 'deny' }
    })
  })
}

function registerIpc(): void {
  const current = (): Repo => {
    if (!repo) throw new Error('No repository open')
    return repo
  }
  ipcMain.handle('repo:get', () => repo?.info() ?? null)
  ipcMain.handle('repo:choose', () => chooseRepo())
  ipcMain.handle('repo:recent', () => recentSites())
  ipcMain.handle('repo:open', (_e, path: string) => {
    if (!Repo.isSite(path)) throw new Error(`${path} is no longer a site checkout`)
    openRepo(path)
  })
  ipcMain.handle('repo:defaultIdentity', () => defaultIdentity())
  ipcMain.handle(
    'repo:createSite',
    async (_e, name: string, dest: string, identity: Identity | null) => {
      await createSite(name, dest, identity, (line) => send('git:cloneProgress', line))
      openRepo(dest)
    }
  )
  ipcMain.handle('repo:list', async (_e, rel: string) => {
    const entries = await current().list(rel)
    const times = await git?.changeTimes(rel).catch(() => null)
    return entries.map((e) => (e.isDir ? e : { ...e, changed: times?.get(e.path) ?? e.changed }))
  })
  ipcMain.handle('repo:read', (_e, rel: string) => current().read(rel))
  ipcMain.handle('repo:write', (_e, rel: string, text: string) => current().write(rel, text))
  ipcMain.handle('repo:pageUrl', (_e, rel: string) => current().pageUrl(rel))
  ipcMain.handle('repo:site', () => current().site())
  ipcMain.handle('repo:components', () => current().components())
  ipcMain.handle('repo:data', () => current().data())
  ipcMain.handle('repo:snippets', () => current().snippets())
  ipcMain.handle('repo:images', () => current().images())
  ipcMain.handle('repo:importFile', (_e, src: string, dir: string, name?: string) =>
    current().importFile(src, dir, name)
  )
  ipcMain.handle(
    'repo:importBytes',
    (_e, data: Uint8Array, dir: string, name: string, ext: string) =>
      current().importBytes(data, dir, name, ext)
  )
  ipcMain.handle('repo:importUrl', (_e, url: string, dir: string, name: string) =>
    current().importUrl(url, dir, name)
  )
  ipcMain.handle('repo:chooseImages', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Add images',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] }
      ]
    })
    return result.filePaths
  })
  ipcMain.handle('repo:chooseDocument', async () => {
    const result = await dialog.showOpenDialog({
      title: 'New page from a document',
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['docx', 'md', 'markdown', 'txt', 'html', 'htm'] }]
    })
    const src = result.filePaths[0]
    return src ? importDocument(src) : null
  })
  ipcMain.handle('repo:pages', () => current().pageList())
  ipcMain.handle('repo:pageAt', (_e, url: string) => current().pageAt(url))
  ipcMain.handle('repo:linkTargets', async () => ({
    targets: await current().linkTargets(),
    hosts: await environmentSites(current().path)
  }))
  ipcMain.handle('repo:imageUses', (_e, rel: string) => imageUses(current(), rel))
  ipcMain.handle('repo:chooseReplacement', async (_e, rel: string) => {
    const result = await dialog.showOpenDialog({
      title: `Replace ${basename(rel)}`,
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] }
      ]
    })
    const src = result.filePaths[0]
    return src ? planReplacement(current(), git, rel, src) : null
  })
  ipcMain.handle('repo:replaceImage', (_e, rel: string, src: string, name: string) =>
    replaceImage(current(), git, rel, src, name)
  )
  ipcMain.handle('repo:renameImage', (_e, from: string, to: string) =>
    renameImage(current(), from, to)
  )
  ipcMain.handle('repo:create', (_e, rel: string, text: string) => current().create(rel, text))
  ipcMain.handle('repo:mkdir', (_e, rel: string) => current().mkdir(rel))
  ipcMain.handle('repo:rename', (_e, from: string, to: string) => current().rename(from, to))
  ipcMain.handle('repo:trash', (_e, rel: string) => shell.trashItem(current().absolute(rel)))
  ipcMain.handle('repo:reveal', (_e, rel: string) =>
    shell.showItemInFolder(current().absolute(rel))
  )
  ipcMain.handle('repo:placement', async (_e, rel: string) =>
    dropPlacement(current().path, rel, await current().site())
  )
  ipcMain.handle('repo:newest', (_e, dir: string) => current().newest(dir))
  ipcMain.handle('repo:search', async (_e, query: string, options: SearchOptions) =>
    search(current().path, query, options, (await current().site()).contentDir)
  )
  ipcMain.handle(
    'repo:replace',
    async (_e, query: string, options: SearchOptions, replacement: string) =>
      replace(current().path, query, options, replacement, (await current().site()).contentDir)
  )
  ipcMain.handle('repo:importImage', async (_e, dir: string) => {
    const result = await dialog.showOpenDialog({
      title: 'Upload image',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] }
      ]
    })
    const src = result.filePaths[0]
    return src ? current().importImage(src, dir) : null
  })
  ipcMain.handle('hugo:status', () => hugo.status)
  ipcMain.handle('hugo:restart', () => (repo ? hugo.start(repo.path) : undefined))
  ipcMain.handle('hugo:install', () => (repo ? hugo.install(repo.path) : undefined))
  const currentGit = (): Git => {
    if (!git) throw new Error('No repository open')
    return git
  }
  ipcMain.handle('git:status', () => git?.status() ?? null)
  ipcMain.handle('git:fetch', () => currentGit().fetch())
  ipcMain.handle('git:branches', () => currentGit().branches())
  ipcMain.handle('git:createBranch', (_e, name: string) => currentGit().createBranch(name))
  ipcMain.handle('git:switchBranch', (_e, name: string) => currentGit().switchBranch(name))
  ipcMain.handle('git:ownBranches', () => currentGit().ownBranches())
  ipcMain.handle('git:branchInfo', (_e, name: string) => currentGit().branchInfo(name))
  ipcMain.handle('git:deleteBranch', (_e, name: string, onGitHub: boolean) =>
    currentGit().deleteBranch(name, onGitHub)
  )
  ipcMain.handle('git:commit', (_e, msg: string, paths: string[]) =>
    currentGit().commit(msg, paths)
  )
  ipcMain.handle('git:push', () => currentGit().push())
  ipcMain.handle('git:pull', () => currentGit().pull())
  ipcMain.handle('git:update', () => currentGit().update())
  ipcMain.handle('git:continueRebase', () => currentGit().continueRebase())
  ipcMain.handle('git:abortRebase', () => currentGit().abortRebase())
  ipcMain.handle('git:mergeToBase', () => currentGit().mergeToBase())
  ipcMain.handle('git:moveToBranch', (_e, name: string) => currentGit().moveToBranch(name))
  ipcMain.handle('git:log', (_e, range: CommitRange) => currentGit().log(range))
  ipcMain.handle('git:repoSlug', () => currentGit().repoSlug())
  ipcMain.handle('git:fetchBranch', (_e, name: string) => currentGit().fetchBranch(name))
  ipcMain.handle('git:startReview', (_e, name: string) => currentGit().startReview(name))
  ipcMain.handle('git:endReview', () => currentGit().endReview())
  ipcMain.handle('git:include', (_e, rel: string) => currentGit().include(rel))
  ipcMain.handle('git:added', (_e, dir: string) => currentGit().added(dir))
  ipcMain.handle('git:committedImage', (_e, rel: string) => currentGit().committedImage(rel))
  ipcMain.handle('git:release', (_e, from: string, to: string) => currentGit().release(from, to))
  ipcMain.handle('git:publish', (_e, from: string, to: string) => currentGit().publish(from, to))
  // A new file goes to the Trash, after leaving the index if it was added there.
  ipcMain.handle('git:discard', async (_e, rel: string, isNew: boolean) => {
    if (isNew) {
      await currentGit().unstage(rel)
      await shell.trashItem(current().absolute(rel))
    } else await currentGit().discard(rel)
    currentGit().scheduleRefresh()
  })
  ipcMain.handle('git:revertHunk', (_e, rel: string, index: number) =>
    currentGit().revertHunk(rel, index)
  )
  ipcMain.handle('git:diff', async (_e, rel: string) => {
    const status = await currentGit().status()
    const change = status.changes.find((c) => c.path === rel)
    return currentGit().diff(rel, change?.kind === 'untracked')
  })
  ipcMain.handle('git:identity', () => currentGit().identity())
  ipcMain.handle('git:setIdentity', (_e, identity: Identity) => currentGit().setIdentity(identity))
  ipcMain.handle('git:chooseFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Where to put the site checkout',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.filePaths[0] ?? null
  })
  ipcMain.handle('git:clone', async (_e, url: string, dest: string) => {
    await clone(url, dest, (line) => send('git:cloneProgress', line))
    if (!Repo.isSite(dest)) throw new Error(`${basename(dest)} is not a Hugo site checkout`)
    openRepo(dest)
  })
  ipcMain.on('menu:state', (_e, state: MenuState) => setMenuState(state))
  ipcMain.handle('preview:fetch', async (_e, url: string) => {
    const res = await net.fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    return res.text()
  })
  // The terminal runs Claude Code itself, or its sign-in for the chat.
  ipcMain.on('terminal:start', async (_e, cols: number, rows: number, login?: boolean) => {
    if (!repo) return
    terminal.resize(cols, rows)
    const opened = repo
    const args = login ? ['auth', 'login'] : claudeArgs(await launch(opened))
    if (repo === opened) void terminal.start(opened.path, args)
  })
  ipcMain.handle('terminal:drop', (_e, paths: string[]) => receiveDrops(paths))
  ipcMain.on('terminal:context', async (_e, rel: string | null) => {
    const url = rel && repo ? await repo.pageUrl(rel).catch(() => null) : null
    await setContext(rel, url)
  })
  ipcMain.on('terminal:write', (_e, data: string) => terminal.write(data))
  ipcMain.on('terminal:resize', (_e, cols: number, rows: number) => terminal.resize(cols, rows))
  ipcMain.on('terminal:kill', () => terminal.kill())
  ipcMain.on('chat:start', () => {
    const opened = repo
    if (opened) void chat.start(opened.path, () => launch(opened))
  })
  ipcMain.on('chat:send', async (_e, text: string, files: string[], page: string | null) => {
    const url = page && repo ? await repo.pageUrl(page).catch(() => null) : null
    chat.send(text, files, page ? { path: page, url } : null)
  })
  ipcMain.on('chat:mode', (_e, mode: ClaudeMode) => chat.setMode(mode))
  ipcMain.on('chat:model', (_e, model: string | null) => chat.setModel(model))
  // Files chosen to hand Claude, copied the way dropped ones are.
  ipcMain.handle('chat:pick', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    return result.canceled ? [] : receiveDrops(result.filePaths)
  })
  ipcMain.on('chat:answer', (_e, id: string, answer: ChatAnswer) => chat.answer(id, answer))
  ipcMain.on('chat:interrupt', () => chat.interrupt())
  ipcMain.on('chat:stop', () => chat.stop())
  ipcMain.on('tool:place', (_e, tool: string, x: number, y: number) =>
    toolWindows.get(tool)?.setPosition(Math.round(x), Math.round(y))
  )
  ipcMain.on('tool:seeThrough', (_e, tool: string, on: boolean) =>
    toolWindows.get(tool)?.setOpacity(on ? 0.55 : 1)
  )
  ipcMain.on('terminal:bell', () => {
    if (win?.isFocused()) return
    rang = true
    attention(true)
  })
  ipcMain.on('chat:committed', (_e, id: string, answer: string) => {
    commits.get(id)?.(answer)
    commits.delete(id)
  })
  ipcMain.handle('chat:commitMessage', async (_e, files: string[]) =>
    writeCommitMessage(current().path, files, await launch(current()))
  )
  ipcMain.on('layout:get', (e) => {
    e.returnValue = loadSettings().layout ?? {}
  })
  ipcMain.on('layout:save', (_e, layout: Layout) => saveSettings({ ...loadSettings(), layout }))
  ipcMain.handle('prefs:get', () => prefs())
  ipcMain.on('zoom', (_e, step: number | null) => zoom(step))
  ipcMain.handle('clipboard:text', () => clipboard.readText())
  ipcMain.handle('clipboard:write', (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle('link:take', () => {
    const link = pendingLink
    pendingLink = null
    return link
  })
  ipcMain.handle('link:parse', (_e, text: string) => parseReviewLink(text))
  ipcMain.handle('prefs:set', (_e, p: Preferences) => {
    saveSettings({ ...loadSettings(), prefs: p })
    setAppearance(p.appearance)
  })
  ipcMain.handle('setup:status', () => setup.status)
  ipcMain.handle('setup:retry', (_e, step: SetupStepId) => setup.retry(step))
  ipcMain.handle('setup:signIn', () => setup.signIn())
  ipcMain.on('setup:cancelSignIn', () => setup.cancelSignIn())
  ipcMain.on('setup:skipGithub', () => setup.skipGithub())
  ipcMain.on('setup:signOut', () => setup.signOut())
  ipcMain.handle('setup:cloneSite', (_e, dest?: string) => setup.cloneSite(dest))
  ipcMain.handle('update:status', () => updater.status)
  ipcMain.handle('update:download', () => updater.download())
  ipcMain.on('update:install', () => updater.install())
  ipcMain.on('open-external', (_e, url: string) => void shell.openExternal(url))
}

// A copy started from Downloads runs from a read-only location the updater cannot replace.
// Electron's prompt moves it to /Applications and relaunches; a refusal is remembered.
// Text size for the whole window, in Chromium zoom levels of 20% each, kept across runs.
function zoom(step: number | null): void {
  const current = loadSettings().zoom ?? 0
  const level = step === null ? 0 : Math.max(-3, Math.min(4, current + step * 0.5))
  saveSettings({ ...loadSettings(), zoom: level })
  win?.webContents.setZoomLevel(level)
  for (const child of toolWindows.values()) child.webContents.setZoomLevel(level)
}

function offerMoveToApplications(): boolean {
  if (isDev || app.isInApplicationsFolder() || loadSettings().declinedMove) return false
  if (app.moveToApplicationsFolder()) return true
  saveSettings({ ...loadSettings(), declinedMove: true })
  return false
}

// Serves files from the open checkout, e.g. galley://repo/static/images/logo.png.
function registerRepoProtocol(): void {
  protocol.handle('galley', (request) => {
    const rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\//, '')
    if (!repo) return new Response('No repository open', { status: 404 })
    try {
      return net.fetch(pathToFileURL(repo.absolute(rel)).href)
    } catch {
      return new Response('Forbidden', { status: 403 })
    }
  })
}

// Review links: macOS hands galley://open?… to the app, also to launch it, before it is
// ready. The link waits until the window asks for it; it only names a branch and a page,
// which the window shows before anything happens.
let pendingLink: ReviewLink | null = null

function receiveLink(text: string): void {
  const link = parseReviewLink(text)
  if (!link) {
    if (app.isReady()) dialog.showErrorBox('Not a review link', `Galley cannot open ${text}`)
    return
  }
  pendingLink = link
  if (!app.isReady()) return
  if (!win) createWindow()
  else {
    if (win.isMinimized()) win.restore()
    win.focus()
    send('link:arrived')
  }
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  receiveLink(url)
})

protocol.registerSchemesAsPrivileged([
  { scheme: 'galley', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

app.setName('Galley')

// GALLEY_USER_DATA isolates settings, downloads and logs, for tests on a developer's Mac.
const userData = process.env['GALLEY_USER_DATA']
if (userData) {
  app.setPath('userData', userData)
  app.setPath('logs', join(userData, 'logs'))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.conclude.galley')
  // The packaged app carries its own icon; in development the Dock shows Electron's.
  if (isDev) app.dock?.setIcon(icon)
  setAppearance(prefs().appearance)
  watchPreviews()
  refreshMenu()
  registerIpc()
  registerRepoProtocol()
  // Links reach whichever Galley registered last; a development build takes them over
  // until the installed app starts again.
  app.setAsDefaultProtocolClient('galley')
  const { repoPath } = loadSettings()
  if (repoPath && Repo.isSite(repoPath)) openRepo(repoPath)
  if (offerMoveToApplications()) return
  createWindow()
  updater.start()
  void setup.run()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())

app.on('before-quit', () => {
  updater.stop()
  hugo.stop()
  git?.stop()
  terminal.kill()
  chat.stop()
  repo?.close()
})
