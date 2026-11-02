import './styles.css'
import '@xterm/xterm/css/xterm.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CrashGuard, Crashed } from './components/Crashed'
import { reportError } from './lib/errors'
import Manual from './components/Manual'

// The same bundle serves the editor and, at #manual, the manual's window; at #crashed,
// what the editor's window shows after its process died.
const pages: Record<string, () => React.JSX.Element | null> = {
  '#manual': Manual,
  '#crashed': Crashed
}
const Page = pages[window.location.hash] ?? App

// Errors that leave the page standing are logged too; they may explain one that did not.
window.addEventListener('error', (e) => reportError(e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => reportError(e.reason, ' (unhandled)'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashGuard>
      <Page />
    </CrashGuard>
  </StrictMode>
)
