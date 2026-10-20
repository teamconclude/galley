import './styles.css'
import '@xterm/xterm/css/xterm.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import DetachedPreview from './components/DetachedPreview'
import Manual from './components/Manual'

// The same bundle serves the editor and, at #preview and #manual, the detached preview
// and the manual's windows.
const pages: Record<string, () => React.JSX.Element | null> = {
  '#preview': DetachedPreview,
  '#manual': Manual
}
const Page = pages[window.location.hash] ?? App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>
)
