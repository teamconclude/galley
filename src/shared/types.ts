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
}

export interface InputHint {
  type?: string
  comment?: string
  options?: { allow_empty?: boolean; values?: unknown[] }
}

// The key naming a block's component: fieldGroup in the new component library,
// _bookshop_name while the site still uses Bookshop and CloudCannon.
export type BlockKey = 'fieldGroup' | '_bookshop_name'

export interface ComponentLibrary {
  blockKey: BlockKey
  components: ComponentSchema[]
}

// One component, from <name>.yml or normalised from <name>.bookshop.yml.
export interface ComponentSchema {
  name: string
  label: string
  description: string
  standalone: boolean
  blueprint: Record<string, unknown>
  inputs: Record<string, InputHint>
}

export interface DataLists {
  authors: string[]
  categories: string[]
  customercategories: string[]
}

export type ChangeKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflict'

export interface Change {
  path: string
  kind: ChangeKind
  from?: string
}

export interface GitStatus {
  branch: string
  base: string
  protected: boolean
  changes: Change[]
  upstream: string | null
  ahead: number
  behind: number
  baseAhead: number
  remoteUrl: string | null
  lastFetch: number | null
  fetchError: string | null
  busy: string | null
}

export interface Identity {
  name: string
  email: string
}

export type MenuCommand =
  'save' | 'toggle-preview' | 'toggle-terminal' | 'reload-preview' | 'detach-preview'
