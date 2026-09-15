import type {
  ComponentLibrary,
  DataLists,
  DirEntry,
  GitStatus,
  HugoStatus,
  Identity,
  MenuCommand,
  RepoInfo
} from './types'

export type Unsubscribe = () => void

export interface Api {
  repo: {
    get: () => Promise<RepoInfo | null>
    choose: () => Promise<boolean>
    list: (rel: string) => Promise<DirEntry[]>
    read: (rel: string) => Promise<string>
    write: (rel: string, text: string) => Promise<void>
    pageUrl: (rel: string) => Promise<string | null>
    components: () => Promise<ComponentLibrary>
    data: () => Promise<DataLists>
    images: () => Promise<string[]>
    importImage: (dir: string) => Promise<string | null>
    importFile: (src: string, dir: string) => Promise<string>
    create: (rel: string, text: string) => Promise<void>
    mkdir: (rel: string) => Promise<void>
    rename: (from: string, to: string) => Promise<void>
    trash: (rel: string) => Promise<void>
    newest: (dir: string) => Promise<string | null>
    onOpened: (cb: () => void) => Unsubscribe
    onChanged: (cb: (paths: string[]) => void) => Unsubscribe
  }
  hugo: {
    status: () => Promise<HugoStatus>
    restart: () => Promise<void>
    install: () => Promise<void>
    onStatus: (cb: (status: HugoStatus) => void) => Unsubscribe
  }
  git: {
    status: () => Promise<GitStatus | null>
    fetch: () => Promise<void>
    branches: () => Promise<string[]>
    createBranch: (name: string) => Promise<void>
    switchBranch: (name: string) => Promise<void>
    commit: (message: string, paths: string[]) => Promise<void>
    push: () => Promise<void>
    pull: () => Promise<void>
    update: () => Promise<void>
    discard: (path: string, untracked: boolean) => Promise<void>
    diff: (path: string) => Promise<string>
    identity: () => Promise<Identity | null>
    setIdentity: (identity: Identity) => Promise<void>
    clone: (url: string, dest: string) => Promise<void>
    chooseFolder: () => Promise<string | null>
    onStatus: (cb: (status: GitStatus) => void) => Unsubscribe
    onCloneProgress: (cb: (line: string) => void) => Unsubscribe
  }
  preview: {
    detach: (url: string) => void
    navigate: (url: string) => void
    reload: () => void
    attach: () => void
    onClosed: (cb: () => void) => Unsubscribe
  }
  terminal: {
    start: (cols: number, rows: number) => void
    write: (data: string) => void
    resize: (cols: number, rows: number) => void
    kill: () => void
    onData: (cb: (data: string) => void) => Unsubscribe
    onExit: (cb: (code: number) => void) => Unsubscribe
  }
  files: {
    pathFor: (file: File) => string
  }
  onMenu: (cb: (command: MenuCommand) => void) => Unsubscribe
  openExternal: (url: string) => void
}
