export interface DirEntry {
  name: string
  path: string
  isDir: boolean
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

export type ChangeKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflict'

export interface Change {
  path: string
  kind: ChangeKind
  from?: string
}

// One hop in the chain of shared branches, e.g. develop to staging.
export interface ReleaseStep {
  from: string
  to: string
  count: number
}

export interface PublishResult {
  url: string
  merged: boolean
  error?: string
}

export interface GitStatus {
  branch: string
  base: string
  protected: boolean
  changes: Change[]
  upstream: string | null
  ahead: number
  behind: number
  // The upstream only holds older versions of this branch's commits, after a rebase.
  rebased: boolean
  baseAhead: number
  aheadOfBase: number
  releases: ReleaseStep[]
  remoteUrl: string | null
  lastFetch: number | null
  fetchError: string | null
  busy: string | null
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

// Git conveniences for editors who are not git users; both on unless turned off.
export interface Preferences {
  pushOnCommit: boolean
  deleteMergedBranch: boolean
  // The Claude pane, and installing Claude Code during setup.
  claude: boolean
}
