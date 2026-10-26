import './styles.css'
import '@xterm/xterm/css/xterm.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Manual from './components/Manual'

// The same bundle serves the editor and, at #manual, the manual's window.
const pages: Record<string, () => React.JSX.Element | null> = {
  '#manual': Manual
}
const Page = pages[window.location.hash] ?? App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>
)
