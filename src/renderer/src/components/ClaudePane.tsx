import type { Preferences } from '../../../shared/types'
import ClaudeChat from './ClaudeChat'
import ClaudeTerminal from './ClaudeTerminal'

interface Props {
  repoPath: string
  prefs: Preferences
  onPrefs: (prefs: Preferences) => void
  openFile: string | null
}

// Claude beside the editor, as Galley's chat or as Claude Code's own terminal; a site
// opened afresh starts it afresh.
export default function ClaudePane({
  repoPath,
  prefs,
  onPrefs,
  openFile
}: Props): React.JSX.Element {
  return prefs.claudeView === 'terminal' ? (
    <ClaudeTerminal key={repoPath} />
  ) : (
    <ClaudeChat key={repoPath} prefs={prefs} onPrefs={onPrefs} openFile={openFile} />
  )
}
