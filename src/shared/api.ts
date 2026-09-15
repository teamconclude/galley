import type {
  ComponentLibrary,
  DataLists,
  DirEntry,
  GitStatus,
  HugoStatus,
  Identity,
  Layout,
  MenuCommand,
  Preferences,
  PublishResult,
  RepoInfo,
  SetupStatus,
  SetupStepId,
  UpdateStatus
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
    mergeToBase: () => Promise<void>
    release: (from: string, to: string) => Promise<void>
    publish: (from: string, to: string) => Promise<PublishResult>
    discard: (path: string, untracked: boolean) => Promise<void>
    diff: (path: string) => Promise<string>
    revertHunk: (path: string, index: number) => Promise<void>
    identity: () => Promise<Identity | null>
    setIdentity: (identity: Identity) => Promise<void>
    clone: (url: string, dest: string) => Promise<void>
    chooseFolder: () => Promise<string | null>
    onStatus: (cb: (status: GitStatus) => void) => Unsubscribe
    onCloneProgress: (cb: (line: string) => void) => Unsubscribe
  }
  preview: {
    detach: (url: string) => void
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
  // Text size steps; null returns to the default.
  zoom: (step: number | null) => void
  prefs: {
    get: () => Promise<Preferences>
    set: (prefs: Preferences) => Promise<void>
  }
  layout: {
    initial: Partial<Layout>
    save: (layout: Layout) => void
  }
  setup: {
    status: () => Promise<SetupStatus>
    retry: (step: SetupStepId) => Promise<void>
    signIn: () => Promise<void>
    cancelSignIn: () => void
    skipGithub: () => void
    signOut: () => void
    cloneSite: (dest?: string) => Promise<void>
    onStatus: (cb: (status: SetupStatus) => void) => Unsubscribe
  }
  update: {
    status: () => Promise<UpdateStatus>
    download: () => Promise<void>
    install: () => void
    onStatus: (cb: (status: UpdateStatus) => void) => Unsubscribe
  }
  onMenu: (cb: (command: MenuCommand) => void) => Unsubscribe
  openExternal: (url: string) => void
}
