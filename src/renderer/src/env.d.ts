/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from 'react'

export interface WebviewElement extends HTMLElement {
  src: string
  reload: () => void
  executeJavaScript: (code: string) => Promise<unknown>
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<WebviewElement> & { src?: string }, WebviewElement>
    }
  }
}
