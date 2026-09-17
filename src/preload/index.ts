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
    search: (query, options) => ipcRenderer.invoke('repo:search', query, options),
    replace: (query, options, replacement) =>
      ipcRenderer.invoke('repo:replace', query, options, replacement),
    onOpened: (cb) => on('repo:opened', cb),
    onChanged: (cb) => on('repo:changed', cb)
  },
  hugo: {
    status: () => ipcRenderer.invoke('hugo:status'),
    restart: () => ipcRenderer.invoke('hugo:restart'),
    install: () => ipcRenderer.invoke('hugo:install'),
    onStatus: (cb) => on('hugo:status', cb)
  },
  git: {
    status: () => ipcRenderer.invoke('git:status'),
    fetch: () => ipcRenderer.invoke('git:fetch'),
    branches: () => ipcRenderer.invoke('git:branches'),
    createBranch: (name) => ipcRenderer.invoke('git:createBranch', name),
    switchBranch: (name) => ipcRenderer.invoke('git:switchBranch', name),
    commit: (message, paths) => ipcRenderer.invoke('git:commit', message, paths),
    push: () => ipcRenderer.invoke('git:push'),
    pull: () => ipcRenderer.invoke('git:pull'),
    update: () => ipcRenderer.invoke('git:update'),
    mergeToBase: () => ipcRenderer.invoke('git:mergeToBase'),
    release: (from, to) => ipcRenderer.invoke('git:release', from, to),
    publish: (from, to) => ipcRenderer.invoke('git:publish', from, to),
    discard: (path, untracked) => ipcRenderer.invoke('git:discard', path, untracked),
    diff: (path) => ipcRenderer.invoke('git:diff', path),
    revertHunk: (path, index) => ipcRenderer.invoke('git:revertHunk', path, index),
    identity: () => ipcRenderer.invoke('git:identity'),
    setIdentity: (identity) => ipcRenderer.invoke('git:setIdentity', identity),
    clone: (url, dest) => ipcRenderer.invoke('git:clone', url, dest),
    chooseFolder: () => ipcRenderer.invoke('git:chooseFolder'),
    onStatus: (cb) => on('git:status', cb),
    onCloneProgress: (cb) => on('git:cloneProgress', cb)
  },
  preview: {
    detach: (url) => ipcRenderer.send('preview:detach', url),
    reload: () => ipcRenderer.send('preview:reload'),
    attach: () => ipcRenderer.send('preview:attach'),
    show: (target) => ipcRenderer.send('preview:show', target),
    fetchText: (url) => ipcRenderer.invoke('preview:fetch', url),
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
  zoom: (step) => ipcRenderer.send('zoom', step),
  prefs: {
    get: () => ipcRenderer.invoke('prefs:get'),
    set: (prefs) => ipcRenderer.invoke('prefs:set', prefs)
  },
  layout: {
    initial: ipcRenderer.sendSync('layout:get'),
    save: (layout) => ipcRenderer.send('layout:save', layout)
  },
  setup: {
    status: () => ipcRenderer.invoke('setup:status'),
    retry: (step) => ipcRenderer.invoke('setup:retry', step),
    signIn: () => ipcRenderer.invoke('setup:signIn'),
    cancelSignIn: () => ipcRenderer.send('setup:cancelSignIn'),
    skipGithub: () => ipcRenderer.send('setup:skipGithub'),
    signOut: () => ipcRenderer.send('setup:signOut'),
    cloneSite: (dest) => ipcRenderer.invoke('setup:cloneSite', dest),
    onStatus: (cb) => on('setup:status', cb)
  },
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.send('update:install'),
    onStatus: (cb) => on('update:status', cb)
  },
  onMenu: (cb) => on('menu', cb),
  openExternal: (url) => ipcRenderer.send('open-external', url)
}

contextBridge.exposeInMainWorld('api', api)
