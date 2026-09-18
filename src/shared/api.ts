import type {
  ComponentLibrary,
  DataLists,
  DirEntry,
  SiteInfo,
  Snippet,
  GitStatus,
  HugoStatus,
  Identity,
  Layout,
  MenuCommand,
  Preferences,
  PreviewMode,
  PreviewState,
  PreviewTarget,
  PublishResult,
  RepoInfo,
  ReplaceResult,
  SearchOptions,
  SearchResults,
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
    site: () => Promise<SiteInfo>
    components: () => Promise<ComponentLibrary>
    data: () => Promise<DataLists>
    snippets: () => Promise<Snippet[]>
    images: () => Promise<string[]>
    importImage: (dir: string) => Promise<string | null>
    importFile: (src: string, dir: string) => Promise<string>
    create: (rel: string, text: string) => Promise<void>
    mkdir: (rel: string) => Promise<void>
    rename: (from: string, to: string) => Promise<void>
    trash: (rel: string) => Promise<void>
    newest: (dir: string) => Promise<string | null>
    search: (query: string, options: SearchOptions) => Promise<SearchResults>
    replace: (query: string, options: SearchOptions, replacement: string) => Promise<ReplaceResult>
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
    // Opens the preview in its own window, showing this state; update keeps it current.
    detach: (state: PreviewState) => void
    update: (state: PreviewState) => void
    reload: () => void
    attach: () => void
    // Scrolls the preview to a block or a piece of text.
    show: (target: PreviewTarget) => void
    // The text at a preview server URL, e.g. a page's markdown twin; throws with the
    // HTTP status when there is none.
    fetchText: (url: string) => Promise<string>
    onClosed: (cb: () => void) => Unsubscribe
    // For the detached window: what to show, where to scroll, and its mode switch.
    state: () => Promise<PreviewState | null>
    onState: (cb: (state: PreviewState) => void) => Unsubscribe
    onTarget: (cb: (target: PreviewTarget) => void) => Unsubscribe
    setMode: (mode: PreviewMode) => void
    // The main window hears of a mode chosen in the detached window.
    onMode: (cb: (mode: PreviewMode) => void) => Unsubscribe
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
