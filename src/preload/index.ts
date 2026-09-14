import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'
import type { Api, Unsubscribe } from '../shared/api'

function on<T extends unknown[]>(channel: string, cb: (...args: T) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  repo: {
    get: () => ipcRenderer.invoke('repo:get'),
    choose: () => ipcRenderer.invoke('repo:choose'),
    list: (rel) => ipcRenderer.invoke('repo:list', rel),
    read: (rel) => ipcRenderer.invoke('repo:read', rel),
    write: (rel, text) => ipcRenderer.invoke('repo:write', rel, text),
    pageUrl: (rel) => ipcRenderer.invoke('repo:pageUrl', rel),
    components: () => ipcRenderer.invoke('repo:components'),
    data: () => ipcRenderer.invoke('repo:data'),
    images: () => ipcRenderer.invoke('repo:images'),
    importImage: (dir) => ipcRenderer.invoke('repo:importImage', dir),
    importFile: (src, dir) => ipcRenderer.invoke('repo:importFile', src, dir),
    create: (rel, text) => ipcRenderer.invoke('repo:create', rel, text),
    mkdir: (rel) => ipcRenderer.invoke('repo:mkdir', rel),
    rename: (from, to) => ipcRenderer.invoke('repo:rename', from, to),
    trash: (rel) => ipcRenderer.invoke('repo:trash', rel),
    newest: (dir) => ipcRenderer.invoke('repo:newest', dir),
    onOpened: (cb) => on('repo:opened', cb),
    onChanged: (cb) => on('repo:changed', cb)
  },
  hugo: {
    status: () => ipcRenderer.invoke('hugo:status'),
    restart: () => ipcRenderer.invoke('hugo:restart'),
    onStatus: (cb) => on('hugo:status', cb)
  },
  preview: {
    detach: (url) => ipcRenderer.send('preview:detach', url),
    navigate: (url) => ipcRenderer.send('preview:navigate', url),
    reload: () => ipcRenderer.send('preview:reload'),
    attach: () => ipcRenderer.send('preview:attach'),
    onClosed: (cb) => on('preview:closed', cb)
  },
  terminal: {
    start: (cols, rows) => ipcRenderer.send('terminal:start', cols, rows),
    write: (data) => ipcRenderer.send('terminal:write', data),
    resize: (cols, rows) => ipcRenderer.send('terminal:resize', cols, rows),
    kill: () => ipcRenderer.send('terminal:kill'),
    onData: (cb) => on('terminal:data', cb),
    onExit: (cb) => on('terminal:exit', cb)
  },
  files: {
    pathFor: (file) => webUtils.getPathForFile(file)
  },
  onMenu: (cb) => on('menu', cb),
  openExternal: (url) => ipcRenderer.send('open-external', url)
}

contextBridge.exposeInMainWorld('api', api)
