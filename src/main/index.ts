import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { MenuCommand } from '../shared/types'
import { isDev } from './env'
import { HugoServer } from './hugo'
import { buildMenu } from './menu'
import { Repo } from './repo'
import { loadSettings, saveSettings } from './settings'
import { ClaudeTerminal } from './terminal'

let win: BrowserWindow | null = null
let previewWin: BrowserWindow | null = null
let repo: Repo | null = null

const send = (channel: string, ...args: unknown[]): void => {
  win?.webContents.send(channel, ...args)
}

const hugo = new HugoServer((status) => send('hugo:status', status))
const terminal = new ClaudeTerminal(
  (data) => send('terminal:data', data),
  (code) => send('terminal:exit', code)
)

function openRepo(path: string): void {
  repo?.close()
  terminal.kill()
  repo = new Repo(path, (paths) => send('repo:changed', paths))
  repo.watch()
  saveSettings({ ...loadSettings(), repoPath: path })
  void hugo.start(path)
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

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
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
  win.on('ready-to-show', () => win?.show())
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
    void previewWin.loadURL(url)
    previewWin.focus()
    return
  }
  previewWin = new BrowserWindow({ width: 1100, height: 850, title: 'Preview' })
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
  ipcMain.on('preview:detach', (_e, url: string) => detachPreview(url))
  ipcMain.on('preview:navigate', (_e, url: string) => {
    if (previewWin && previewWin.webContents.getURL() !== url) void previewWin.loadURL(url)
  })
  ipcMain.on('preview:reload', () => previewWin?.webContents.reload())
  ipcMain.on('preview:attach', () => previewWin?.close())
  ipcMain.on('terminal:start', (_e, cols: number, rows: number) => {
    if (repo) terminal.start(repo.path, cols, rows)
  })
  ipcMain.on('terminal:write', (_e, data: string) => terminal.write(data))
  ipcMain.on('terminal:resize', (_e, cols: number, rows: number) => terminal.resize(cols, rows))
  ipcMain.on('terminal:kill', () => terminal.kill())
  ipcMain.on('open-external', (_e, url: string) => void shell.openExternal(url))
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.conclude.galley')
  // The packaged app carries its own icon; in development the Dock shows Electron's.
  if (isDev) app.dock?.setIcon(icon)
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  Menu.setApplicationMenu(
    buildMenu({
      openRepo: () => void chooseRepo(),
      command: (command: MenuCommand) => send('menu', command)
    })
  )
  registerIpc()
  registerRepoProtocol()
  const { repoPath } = loadSettings()
  if (repoPath && Repo.isSite(repoPath)) openRepo(repoPath)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())

app.on('before-quit', () => {
  hugo.stop()
  terminal.kill()
  repo?.close()
})
