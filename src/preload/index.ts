import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
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
  onMenu: (cb) => on('menu', cb),
  openExternal: (url) => ipcRenderer.send('open-external', url)
}

contextBridge.exposeInMainWorld('api', api)
