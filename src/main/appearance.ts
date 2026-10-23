import { app, nativeTheme, type WebContents } from 'electron'
import type { Appearance } from '../shared/types'
import { log } from './log'

// Light or dark, or as macOS has it. Every window follows, through prefers-color-scheme,
// except the preview: the site keeps its light look, which is what most visitors see.
export function setAppearance(appearance: Appearance): void {
  nativeTheme.themeSource = appearance
}

// What a window shows before its page has drawn, so it opens without a flash of white.
export const windowBackground = (): string =>
  nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff'

// The preview's webview is told the system is light, whatever Galley and macOS use.
export function keepPreviewsLight(): void {
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() === 'webview') lightPage(contents)
  })
}

function lightPage(contents: WebContents): void {
  try {
    contents.debugger.attach('1.3')
  } catch (e) {
    log('preview: cannot fix its colour scheme:', String(e))
    return
  }
  const light = (): void =>
    void contents.debugger
      .sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: 'light' }]
      })
      .catch(() => undefined)
  light()
  // A new page in the webview is a new document, which may start from the system's scheme.
  contents.on('did-start-navigation', (_e, _url, inPage, mainFrame) => {
    if (mainFrame && !inPage) light()
  })
}
