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

export type MenuCommand =
  'save' | 'toggle-preview' | 'toggle-terminal' | 'reload-preview' | 'detach-preview'
