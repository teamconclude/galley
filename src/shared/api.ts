import type {
  BranchInfo,
  Change,
  ChatAnswer,
  ChatItem,
  ChatRequest,
  ChatStatus,
  ClaudeMode,
  Commit,
  CommitRange,
  ComponentLibrary,
  DataLists,
  DirEntry,
  GitStatus,
  HugoStatus,
  Identity,
  ImageReplacement,
  ImageUse,
  ImportedDocument,
  Layout,
  MenuCommand,
  MenuState,
  PageInfo,
  Placement,
  Preferences,
  PublishResult,
  ReplaceResult,
  RepoInfo,
  SearchOptions,
  SearchResults,
  SetupStatus,
  SetupStepId,
  SiteInfo,
  Snippet,
  UpdateStatus,
  ToolId
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
    // What a commit changed: its files, one file's diff, and a picture before or after.
    commitFiles: (hash: string) => Promise<Change[]>
    commitDiff: (hash: string, change: Change) => Promise<string>
    commitImage: (hash: string, path: string, before: boolean) => Promise<string | null>
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
    // The text at a preview server URL, e.g. a page's markdown twin; throws with the
    // HTTP status when there is none.
    fetchText: (url: string) => Promise<string>
  }
  tools: {
    // A tool window's own window was closed, by the editor rather than with Galley.
    onClosed: (cb: (tool: ToolId) => void) => Unsubscribe
    // Moves a tool window's own window to a point on screen, as its tab bar is dragged,
    // and makes it see-through while it is over a place to dock.
    place: (tool: ToolId, x: number, y: number) => void
    // A picture of a part of the main window, by its rectangle in the page, as a data URL.
    snapshot: (rect: { x: number; y: number; width: number; height: number }) => Promise<string>
    seeThrough: (tool: ToolId, on: boolean) => void
  }
  terminal: {
    // Starts Claude Code, or with login its sign-in, which the chat needs first.
    start: (cols: number, rows: number, login?: boolean) => void
    write: (data: string) => void
    resize: (cols: number, rows: number) => void
    kill: () => void
    // Copies dropped files where Claude may read them; returns the copies' paths to paste.
    drop: (paths: string[]) => Promise<string[]>
    // The file open in the editor, which "this page" refers to; null for none.
    context: (path: string | null) => void
    onData: (cb: (data: string) => void) => Unsubscribe
    onExit: (cb: (code: number) => void) => Unsubscribe
    // Claude Code rang the bell: it waits on the editor.
    bell: () => void
  }
  // Claude as a chat. Starting begins a new conversation, after checking the sign-in.
  chat: {
    start: () => void
    // Files are paths from terminal.drop or pick; page is the open file, sent as context.
    send: (text: string, files: string[], page: string | null) => void
    // Asks for files to hand Claude; returns their copies, as terminal.drop does.
    pick: () => Promise<string[]>
    setMode: (mode: ClaudeMode) => void
    // A model name such as 'opus', or null for Claude Code's own choice.
    setModel: (model: string | null) => void
    answer: (id: string, answer: ChatAnswer) => void
    interrupt: () => void
    stop: () => void
    onStatus: (cb: (status: ChatStatus) => void) => Unsubscribe
    onItem: (cb: (item: ChatItem) => void) => Unsubscribe
    onRequest: (cb: (request: ChatRequest) => void) => Unsubscribe
    onSettled: (cb: (id: string) => void) => Unsubscribe
    // Claude asks to commit; the window commits as its Commit button does and says how it
    // went, for Claude to read.
    onCommit: (cb: (id: string, message: string, files: string[] | null) => void) => Unsubscribe
    committed: (id: string, answer: string) => void
    // A message for committing these files, written by Claude in a session of its own.
    commitMessage: (files: string[]) => Promise<string>
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
