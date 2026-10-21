import type {
  BranchInfo,
  Commit,
  CommitRange,
  Placement,
  ImageReplacement,
  ImageUse,
  ImportedDocument,
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
  MenuState,
  PageInfo,
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
import type { ReviewLink } from './reviewLink'

export type Unsubscribe = () => void

export interface Api {
  repo: {
    get: () => Promise<RepoInfo | null>
    choose: () => Promise<boolean>
    // Sites opened before that are still there, newest first.
    recent: () => Promise<string[]>
    open: (path: string) => Promise<void>
    // Makes a site at dest from the Galley template and opens it; progress arrives on
    // git.onCloneProgress.
    createSite: (name: string, dest: string, identity: Identity | null) => Promise<void>
    // Who would commit in a new site: git's global setting, else the GitHub profile.
    defaultIdentity: () => Promise<Identity | null>
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
    importFile: (src: string, dir: string, name?: string) => Promise<string>
    importBytes: (data: Uint8Array, dir: string, name: string, ext: string) => Promise<string>
    importUrl: (url: string, dir: string, name: string) => Promise<string>
    // Asks for a document and returns it as Markdown; null when cancelled.
    chooseDocument: () => Promise<ImportedDocument | null>
    // Addresses links may point to, and the site's own hosts, for marking broken links.
    linkTargets: () => Promise<{ targets: string[]; hosts: string[] }>
    // Every page with its title, address, dates and aliases.
    pages: () => Promise<PageInfo[]>
    // The page at an address or alias, from a fresh listing.
    pageAt: (url: string) => Promise<string | null>
    create: (rel: string, text: string) => Promise<void>
    mkdir: (rel: string) => Promise<void>
    rename: (from: string, to: string) => Promise<void>
    // Renames an image and points the pages that show it at the new name; returns how
    // many files changed.
    renameImage: (from: string, to: string) => Promise<number>
    // The files that show an image.
    imageUses: (rel: string) => Promise<ImageUse[]>
    // Asks for a picture to replace an image with and says what replacing would do; null
    // when cancelled.
    chooseReplacement: (rel: string) => Promise<ImageReplacement | null>
    // Puts the picture at src in as <name> beside the image and points its uses at it.
    replaceImage: (rel: string, src: string, name: string) => Promise<void>
    trash: (rel: string) => Promise<void>
    // Pictures picked in an open dialog, as paths on disk.
    chooseImages: () => Promise<string[]>
    // Shows the file or folder in the Finder.
    reveal: (rel: string) => Promise<void>
    // What to make of a file about to be dropped at this path.
    placement: (rel: string) => Promise<Placement>
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
    // Branches in this checkout that can be deleted, what deleting one would remove, and
    // deleting it, on GitHub too when asked.
    ownBranches: () => Promise<string[]>
    branchInfo: (name: string) => Promise<BranchInfo>
    deleteBranch: (name: string, onGitHub: boolean) => Promise<void>
    commit: (message: string, paths: string[]) => Promise<void>
    push: () => Promise<void>
    pull: () => Promise<void>
    update: () => Promise<void>
    // After an update or pull stopped on conflicts: carry on once they are settled, or
    // put everything back as it was.
    continueRebase: () => Promise<void>
    abortRebase: () => Promise<void>
    mergeToBase: () => Promise<void>
    // Moves local commits off a shared branch onto a new branch.
    moveToBranch: (name: string) => Promise<void>
    log: (range: CommitRange) => Promise<Commit[]>
    // Makes an entry outside the site part of it, so the next commit takes its files.
    include: (path: string) => Promise<void>
    // The committed version of a file as a data URL, for showing changed images.
    committedImage: (path: string) => Promise<string | null>
    // Files under a folder this branch brings, new or added since the base branch.
    added: (dir: string) => Promise<string[]>
    // The repository on GitHub, as owner/name, or null.
    repoSlug: () => Promise<string | null>
    // A colleague's branch from GitHub, without switching; false when GitHub has none.
    fetchBranch: (name: string) => Promise<boolean>
    // Switches to a fetched branch for review, and back to the editor's own.
    startReview: (name: string) => Promise<void>
    endReview: () => Promise<void>
    release: (from: string, to: string) => Promise<void>
    publish: (from: string, to: string) => Promise<PublishResult>
    // A new file is moved to the Trash.
    discard: (path: string, isNew: boolean) => Promise<void>
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
    // Copies dropped files where Claude may read them; returns the copies' paths to paste.
    drop: (paths: string[]) => Promise<string[]>
    // The file open in the editor, which "this page" refers to; null for none.
    context: (path: string | null) => void
    onData: (cb: (data: string) => void) => Unsubscribe
    onExit: (cb: (code: number) => void) => Unsubscribe
  }
  files: {
    pathFor: (file: File) => string
  }
  // Text size steps; null returns to the default.
  zoom: (step: number | null) => void
  // The clipboard's plain text, for Paste as plain text.
  clipboardText: () => Promise<string>
  clipboardWrite: (text: string) => Promise<void>
  link: {
    // The review link Galley was opened with, once.
    take: () => Promise<ReviewLink | null>
    onArrived: (cb: () => void) => Unsubscribe
    // A pasted link's parts, or null for anything else.
    parse: (text: string) => Promise<ReviewLink | null>
  }
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
  // Tells the menu what its items can act on.
  setMenuState: (state: MenuState) => void
  openExternal: (url: string) => void
}
