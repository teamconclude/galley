/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from 'react'

export interface WebviewElement extends HTMLElement {
  src: string
  reload: () => void
  reloadIgnoringCache: () => void
  executeJavaScript: (code: string) => Promise<unknown>
  loadURL: (url: string) => Promise<void>
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<WebviewElement> & { src?: string }, WebviewElement>
    }
  }
}
