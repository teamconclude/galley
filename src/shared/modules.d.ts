declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  export function gfm(service: TurndownService): void
  export function tables(service: TurndownService): void
  export function strikethrough(service: TurndownService): void
  export function taskListItems(service: TurndownService): void
  export function highlightedCodeBlock(service: TurndownService): void
}

declare module '*?raw' {
  const text: string
  export default text
}

// `git describe` of the checkout a development build is made from, e.g. v0.4.1-22-g588afdb.
declare const __GALLEY_BUILD__: string
