import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  Rectangle,
  screen,
  shell
} from 'electron'
import { basename } from 'path'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type {
  Identity,
  Layout,
  MenuCommand,
  Preferences,
  SearchOptions,
  SetupStepId
} from '../shared/types'
import { isDev } from './env'
import { clone, Git } from './git'
import { HugoServer } from './hugo'
import { buildMenu } from './menu'
import { Repo } from './repo'
import { replace, search } from './search'
import { showBlockScript } from '../shared/previewScript'
import { loadSettings, prefs, saveSettings } from './settings'
import { Setup } from './setup'
import { ClaudeTerminal } from './terminal'
import { Updater } from './updater'

let win: BrowserWindow | null = null
let previewWin: BrowserWindow | null = null
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

function openRepo(path: string): void {
  repo?.close()
  git?.stop()
  terminal.kill()
  repo = new Repo(path, (paths) => {
    send('repo:changed', paths)
    git?.scheduleRefresh()
  })
  repo.watch()
  git = new Git(path, (status) => send('git:status', status))
  git.start()
  saveSettings({ ...loadSettings(), repoPath: path })
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
    dialog.showErrorBox('Not a site checkout', `${path} has no config/_default/hugo.yaml.`)
    return false
  }
  openRepo(path)
  return true
}

// Saved bounds are used only when they still fall on a connected display.
function savedBounds(name: 'main' | 'preview'): Partial<Rectangle> {
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

function rememberBounds(window: BrowserWindow, name: 'main' | 'preview'): void {
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
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })
  rememberBounds(win, 'main')
  win.on('ready-to-show', () => win?.show())
  win.webContents.on('did-finish-load', () => {
    win?.webContents.setZoomLevel(loadSettings().zoom ?? 0)
  })
  win.on('closed', () => {
    win = null
    previewWin?.close()
  })
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function detachPreview(url: string): void {
  if (previewWin) {
    if (previewWin.webContents.getURL() !== url) void previewWin.loadURL(url)
    return
  }
  previewWin = new BrowserWindow({
    width: 1100,
    height: 850,
    ...savedBounds('preview'),
    title: 'Preview'
  })
  rememberBounds(previewWin, 'preview')
  previewWin.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  previewWin.on('closed', () => {
    previewWin = null
    send('preview:closed')
  })
  void previewWin.loadURL(url)
}

function registerIpc(): void {
  const current = (): Repo => {
    if (!repo) throw new Error('No repository open')
    return repo
  }
  ipcMain.handle('repo:get', () => repo?.info() ?? null)
  ipcMain.handle('repo:choose', () => chooseRepo())
  ipcMain.handle('repo:list', (_e, rel: string) => current().list(rel))
  ipcMain.handle('repo:read', (_e, rel: string) => current().read(rel))
  ipcMain.handle('repo:write', (_e, rel: string, text: string) => current().write(rel, text))
  ipcMain.handle('repo:pageUrl', (_e, rel: string) => current().pageUrl(rel))
  ipcMain.handle('repo:components', () => current().components())
  ipcMain.handle('repo:data', () => current().data())
  ipcMain.handle('repo:images', () => current().images())
  ipcMain.handle('repo:importFile', (_e, src: string, dir: string) =>
    current().importFile(src, dir)
  )
  ipcMain.handle('repo:create', (_e, rel: string, text: string) => current().create(rel, text))
  ipcMain.handle('repo:mkdir', (_e, rel: string) => current().mkdir(rel))
  ipcMain.handle('repo:rename', (_e, from: string, to: string) => current().rename(from, to))
  ipcMain.handle('repo:trash', (_e, rel: string) => shell.trashItem(current().absolute(rel)))
  ipcMain.handle('repo:newest', (_e, dir: string) => current().newest(dir))
  ipcMain.handle('repo:search', (_e, query: string, options: SearchOptions) =>
    search(current().path, query, options)
  )
  ipcMain.handle('repo:replace', (_e, query: string, options: SearchOptions, replacement: string) =>
    replace(current().path, query, options, replacement)
  )
  ipcMain.handle('repo:importImage', async (_e, dir: string) => {
    const result = await dialog.showOpenDialog({
      title: 'Add image',
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
  ipcMain.handle('git:commit', (_e, msg: string, paths: string[]) =>
    currentGit().commit(msg, paths)
  )
  ipcMain.handle('git:push', () => currentGit().push())
  ipcMain.handle('git:pull', () => currentGit().pull())
  ipcMain.handle('git:update', () => currentGit().update())
  ipcMain.handle('git:mergeToBase', () => currentGit().mergeToBase())
  ipcMain.handle('git:release', (_e, from: string, to: string) => currentGit().release(from, to))
  ipcMain.handle('git:publish', (_e, from: string, to: string) => currentGit().publish(from, to))
  ipcMain.handle('git:discard', async (_e, rel: string, untracked: boolean) => {
    if (untracked) await shell.trashItem(current().absolute(rel))
    else await currentGit().discard(rel)
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
  ipcMain.on('preview:detach', (_e, url: string) => detachPreview(url))
  ipcMain.on('preview:reload', () => previewWin?.webContents.reload())
  ipcMain.on('preview:attach', () => previewWin?.close())
  ipcMain.on('preview:showBlock', (_e, index: number) => {
    void previewWin?.webContents.executeJavaScript(showBlockScript(index)).catch(() => {})
  })
  ipcMain.on('terminal:start', (_e, cols: number, rows: number) => {
    if (repo) void terminal.start(repo.path, cols, rows)
  })
  ipcMain.on('terminal:write', (_e, data: string) => terminal.write(data))
  ipcMain.on('terminal:resize', (_e, cols: number, rows: number) => terminal.resize(cols, rows))
  ipcMain.on('terminal:kill', () => terminal.kill())
  ipcMain.on('layout:get', (e) => {
    e.returnValue = loadSettings().layout ?? {}
  })
  ipcMain.on('layout:save', (_e, layout: Layout) => saveSettings({ ...loadSettings(), layout }))
  ipcMain.handle('prefs:get', () => prefs())
  ipcMain.on('zoom', (_e, step: number | null) => zoom(step))
  ipcMain.handle('prefs:set', (_e, p: Preferences) => saveSettings({ ...loadSettings(), prefs: p }))
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
  Menu.setApplicationMenu(
    buildMenu({
      openRepo: () => void chooseRepo(),
      checkUpdates: () => void updater.check(true),
      zoom,
      command: (command: MenuCommand) => send('menu', command)
    })
  )
  registerIpc()
  registerRepoProtocol()
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
  repo?.close()
})
