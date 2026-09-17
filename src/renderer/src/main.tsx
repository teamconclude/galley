import './styles.css'
import '@xterm/xterm/css/xterm.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import DetachedPreview from './components/DetachedPreview'

// The same bundle serves the editor and, at #preview, the detached preview window.
const Page = window.location.hash === '#preview' ? DetachedPreview : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>
)
