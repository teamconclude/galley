import type { GitStatus } from '../../../shared/types'

// The commit being prepared in the Changes panel.
export interface CommitDraft {
  message: string
  // Changes left out of the commit, by path.
  excluded: Set<string>
  // New files that looked out of place, each left out once; see newDraft.
  warned: Set<string>
}

export const emptyDraft = (): CommitDraft => ({
  message: '',
  excluded: new Set(),
  warned: new Set()
})

// A new file that looks out of place starts left out of the commit, once; ticking it
// afterwards is the editor's choice. The same draft when nothing new looks out of place.
export function newDraft(draft: CommitDraft, status: GitStatus | null): CommitDraft {
  const paths = (status?.changes ?? [])
    .filter((c) => c.warning && !draft.warned.has(c.path))
    .map((c) => c.path)
  if (paths.length === 0) return draft
  return {
    ...draft,
    warned: new Set([...draft.warned, ...paths]),
    excluded: new Set([...draft.excluded, ...paths])
  }
}
