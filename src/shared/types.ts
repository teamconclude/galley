export interface DirEntry {
  name: string
  path: string
  isDir: boolean
  // For files: bytes, and when the file last changed, by its last commit unless it has
  // changed since.
  size?: number
  changed?: number
}

// A page as Hugo lists it, for finding pages and naming them in the tree. Dates are ISO
// strings, null where the page sets none.
export interface PageInfo {
  path: string
  title: string
  url: string
  date: string | null
  publishDate: string | null
  expiryDate: string | null
  draft: boolean
  kind: string
  section: string
  // Earlier addresses that forward to the page.
  aliases: string[]
}

export interface RepoInfo {
  path: string
  name: string
  branch: string
}

export type HugoState = 'stopped' | 'starting' | 'running' | 'error'

export interface HugoStatus {
  state: HugoState
  url?: string
  message?: string
  missing?: boolean
}

export type FieldType =
  | 'text'
  | 'textarea'
  | 'markdown'
  | 'url'
  | 'image'
  | 'boolean'
  | 'number'
  | 'select'
  | 'list'
  | 'object'
  | 'block'
  | 'blocks'

// One field of a component's form. A list has `fields` when its items are objects; a
// block names its component, a block list may restrict the components allowed in it.
export interface FieldDef {
  key: string
  type: FieldType
  label: string
  placeholder?: string
  help?: string
  default?: unknown
  required?: boolean
  options?: string[]
  fields?: FieldDef[]
  component?: string
  components?: string[]
}

// The key naming a block's component and the page key holding the block list: component
// and blocks in the component library, the Bookshop names while a site still uses that.
export type BlockKey = 'component' | '_bookshop_name'
export type ListKey = 'blocks' | 'content_blocks'

export interface ComponentLibrary {
  blockKey: BlockKey
  listKey: ListKey
  components: ComponentSchema[]
}

// One component, from <name>.yml or normalised from <name>.bookshop.yml.
export interface ComponentSchema {
  name: string
  label: string
  description: string
  standalone: boolean
  fields: FieldDef[]
}

// A shortcode the Insert menu offers, from layouts/shortcodes or Hugo's embedded ones.
export interface Snippet {
  name: string
  label: string
  text: string
}

// Frontmatter key to the names in data/<key>.*, for every data file that is a list of
// maps with a `name` field.
export type DataLists = Record<string, string[]>

// What Galley derives about a site from its Hugo config and checkout; see
// docs/generalization-plan.md, "No configuration file".
export interface SiteInfo {
  name: string
  contentDir: string
  staticDir: string
  // Where the image picker looks, and how pages refer to files in it.
  imagesDir: string
  imagesUrl: string
  componentsDir: string
  // Appended to a page URL for its markdown rendition, when the site outputs one.
  markdownSuffix: string | null
  // Data file to the plain-text URL the home page renders from it, e.g. /llms.txt.
  textPreviews: Record<string, string>
}

// A conflict whose markers are all gone is resolved; git learns so on continuing.
export type ChangeKind =
  'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflict' | 'resolved'

export interface Change {
  path: string
  kind: ChangeKind
  from?: string
  // Why a new file looks out of place, for the editor.
  warning?: string
}

// A document chosen for a new page, converted to Markdown, with its pictures saved
// beside the conversion and referred to by file name in the text.
export interface ImportedDocument {
  name: string
  markdown: string
  images: string[]
}

// Where a file dropped into a folder should go, and what is wrong with the folder.
export interface Placement {
  warning: string | null
  // A better folder, e.g. the images folder for an image dropped among the pages.
  home: string | null
}

// One hop in the chain of shared branches, e.g. develop to staging.
export interface ReleaseStep {
  from: string
  to: string
  count: number
  // The address the target branch is built for, e.g. conclude.dev.
  site: string | null
}

// Untracked files outside every folder git tracks, e.g. source documents kept in the
// checkout; one entry per top-level file or folder.
export interface OutsideEntry {
  path: string
  isDir: boolean
  files: number
}

// The commits behind one of the counts in the Changes panel.
export type CommitRange =
  | { kind: 'incoming' | 'outgoing' | 'base' | 'branch' }
  | { kind: 'release'; from: string; to: string }
  // A colleague's branch opened from a review link: what it adds to the base.
  | { kind: 'review'; branch: string }

export interface Commit {
  hash: string
  author: string
  email: string
  date: number
  subject: string
  files: string[]
}

export interface PublishResult {
  url: string
  merged: boolean
  error?: string
}

// Where the conflicting changes came from: the base branch's name, or GitHub for the
// branch's own copy there. Edits is set once the branch is rebased and the edits not
// committed yet are the ones that clash, as they are put back.
export interface RebaseState {
  from: string
  edits: boolean
}

export interface GitStatus {
  branch: string
  base: string
  protected: boolean
  changes: Change[]
  outside: OutsideEntry[]
  // The branch this one follows on GitHub; for a shared branch its namesake on origin.
  upstream: string | null
  ahead: number
  behind: number
  // The upstream only holds older versions of this branch's commits, after a rebase.
  rebased: boolean
  // An update or pull stopped halfway on edits that conflict, waiting to be settled.
  rebase: RebaseState | null
  baseAhead: number
  aheadOfBase: number
  baseSite: string | null
  releases: ReleaseStep[]
  remoteUrl: string | null
  lastFetch: number | null
  fetchError: string | null
  busy: string | null
  // Set while the checkout is on a branch opened from a review link, with the branch to
  // go back to.
  review: Review | null
}

// What deleting a branch would remove: its commits not yet in the base branch, whether
// GitHub has a copy, and who else made commits on it.
export interface BranchInfo {
  commits: number
  onGitHub: boolean
  others: string[]
}

export interface Review {
  branch: string
  from: string
}

export interface Identity {
  name: string
  email: string
}

// Pane visibility and divider positions, kept across restarts.
export interface Layout {
  showPreview: boolean
  showClaude: boolean
  detached: boolean
  sidebarWidth: number
  previewWidth: number
  claudeHeight: number
  frontmatterHeight: number
  sidebarTab: SidebarTab
  showAllFiles: boolean
  // Content folders list pages by title and date rather than by file name.
  showTitles: boolean
  // The rendered page, or its markdown twin for LLMs.
  previewMode: PreviewMode
}

export type PreviewMode = 'html' | 'markdown'

// What the preview shows, also handed to the detached preview window.
export interface PreviewState {
  url: string | null
  mode: PreviewMode
  // Changes whenever the open file's text does; the text view fetches again.
  version: number
  status: HugoStatus
  // The site's markdown rendition suffix, or null when it has none.
  markdownSuffix: string | null
  // Shown instead of the page, e.g. while conflicts keep Hugo from building it.
  notice: string | null
}

export type SidebarTab = 'files' | 'changes' | 'search'

export interface SearchOptions {
  ignoreCase: boolean
  regex: boolean
  // Only pages under content/, not templates, styles or data.
  contentOnly: boolean
}

// One hit: the line it is on (1-based) and the match's offset and length in that line.
export interface SearchMatch {
  line: number
  column: number
  length: number
  text: string
}

export interface SearchFile {
  path: string
  matches: SearchMatch[]
}

export interface ReplaceResult {
  files: number
  matches: number
}

// Where the preview should scroll to: a top-level content block, or the element whose
// text starts with a snippet of the body.
export type PreviewTarget =
  { kind: 'block'; index: number } | { kind: 'text'; snippet: string; heading: boolean }

export interface SearchResults {
  files: SearchFile[]
  total: number
  // The search stopped early because the cap on matches was reached.
  truncated: boolean
}

export interface GitHubUser {
  login: string
  name: string
  email: string
}

export type SetupStepId = 'git' | 'hugo' | 'claude' | 'github' | 'site'

export interface SetupStep {
  id: SetupStepId
  label: string
  state: 'pending' | 'running' | 'done' | 'failed' | 'action' | 'skipped'
  detail?: string
  percent?: number
}

// Progress of getting a Mac ready to edit the site.
export interface SetupStatus {
  steps: SetupStep[]
  complete: boolean
  githubConfigured: boolean
  device?: { code: string; url: string }
  user?: GitHubUser
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'manual'; version: string; url: string; problem: string }
  | { state: 'error'; message: string }

export type MenuCommand =
  | 'save'
  | 'toggle-preview'
  | 'toggle-terminal'
  | 'reload-preview'
  | 'detach-preview'
  | 'setup'
  | 'settings'
  | 'find'
  | 'replace'
  | 'find-in-site'
  | 'replace-in-site'
  | 'paste-plain'
  | 'new-page'
  | 'new-page-from-document'
  | 'find-page'
  | 'open-review-link'
  | 'new-folder'
  | 'add-images'
  | 'duplicate-page'
  | 'rename-page'
  | 'trash-page'
  | 'open-in-browser'
  | 'show-in-finder'

// What the menu's items can act on: an open site, an open page in it, and its preview.
export interface MenuState {
  site: boolean
  page: boolean
  preview: boolean
}

// Git conveniences for editors who are not git users; on unless turned off.
export interface Preferences {
  deleteMergedBranch: boolean
  // The Claude pane, and installing Claude Code during setup.
  claude: boolean
  // The model the pane starts Claude with; 'default' leaves it to Claude Code's settings.
  claudeModel: ClaudeModel
}

export type ClaudeModel = 'opus' | 'sonnet' | 'default'
