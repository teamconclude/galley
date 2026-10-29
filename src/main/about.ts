import { app, BrowserWindow, shell } from 'electron'
import { readFileSync } from 'fs'
import icon from '../../resources/icon.png?asset'
import license from '../../LICENSE?raw'
import { isDev } from './env'
import { pixel } from './pixel'
import { windowBackground } from './appearance'

let about: BrowserWindow | null = null

// Releases take their version from the tag they are built from. A development build has
// Electron's version as its own, so it gives the release it follows and how far it is
// past it instead.
export function galleyVersion(): { version: string; detail: string | null } {
  if (!isDev) return { version: app.getVersion(), detail: null }
  const m = __GALLEY_BUILD__.match(/^v?([\d.]+)(?:-(\d+)-g([0-9a-f]+))?(-dirty)?$/)
  if (!m) return { version: __GALLEY_BUILD__, detail: 'Development build' }
  const [, release, ahead, commit, dirty] = m
  const detail = ['Development build']
  if (ahead) detail.push(`+${ahead}`, commit)
  if (dirty) detail.push('modified')
  return { version: release, detail: detail.join(' · ') }
}

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The license's paragraphs, with the line breaks of its plain-text layout taken out.
const paragraphs = (text: string): string =>
  text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${escape(p.replace(/\s+/g, ' '))}</p>`)
    .join('')

function page(): string {
  const image = `data:image/png;base64,${readFileSync(icon).toString('base64')}`
  const { version, detail } = galleyVersion()
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  :root {
    color-scheme: light dark;
    --text: #1d1d1f;
    --muted: #6e6e73;
    --line: #e3e3e8;
    --soft: #f5f5f7;
    --bg: #ffffff;
    --accent: #0b7a64;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --text: #f8f8f8;
      --muted: #a0a0a0;
      --line: #3e3e3e;
      --soft: #2a2a2a;
      --bg: #1a1a1a;
      --accent: #3bbfad;
    }
  }
  html, body { height: 100%; margin: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    -webkit-user-select: none;
    cursor: default;
  }
  section { box-sizing: border-box; height: 100%; padding: 40px 28px 22px; display: flex;
    flex-direction: column; align-items: center; text-align: center; }
  [hidden] { display: none; }
  img { width: 104px; height: 104px; filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.18)); }
  h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.01em; margin: 14px 0 2px; }
  .tagline { color: var(--muted); margin: 0; }
  .version { margin: 14px 0 0; padding: 3px 10px; border-radius: 999px; background: var(--soft);
    font-size: 12px; font-variant-numeric: tabular-nums; -webkit-user-select: text; }
  footer { margin-top: auto; width: 100%; padding-top: 14px; border-top: 1px solid var(--line);
    color: var(--muted); font-size: 11.5px; }
  footer p { margin: 2px 0; }
  a { color: var(--accent); text-decoration: none; cursor: pointer; }
  a:hover { text-decoration: underline; }
  #license { padding-top: 34px; align-items: stretch; text-align: left; }
  #license h2 { font-size: 14px; margin: 0 0 8px; }
  .detail { margin: 6px 0 0; color: var(--muted); font-size: 11px; }
  .text { flex: 1; margin: 0 0 12px; padding: 4px 12px; overflow: auto; border-radius: 8px;
    background: var(--soft); font-size: 11px; line-height: 1.5; -webkit-user-select: text; }
  .text p { margin: 8px 0; }
</style>
</head>
<body>
<section id="about">
  <img src="${image}" alt="">
  <h1>Galley</h1>
  <p class="tagline">The editor for the conclude.io website</p>
  <p class="version">Version ${escape(version)}</p>
  ${detail ? `<p class="detail">${escape(detail)}</p>` : ''}
  <footer>
    <p>© 2026 Conclude AS</p>
    <p>Released under the <a id="show">BSD 3-Clause License</a></p>
    <p><a href="https://conclude.io/">conclude.io</a></p>
  </footer>
</section>
<section id="license" hidden>
  <h2>License</h2>
  <div class="text">${paragraphs(license)}</div>
  <a id="back">← Back</a>
</section>
<script>
  const swap = (on) => {
    document.getElementById('about').hidden = on
    document.getElementById('license').hidden = !on
  }
  document.getElementById('show').onclick = () => swap(true)
  document.getElementById('back').onclick = () => swap(false)
</script>
</body>
</html>`
}

// Galley's own About window: the version that matters to editors and the license, which
// the standard macOS panel cannot show. It opens centred over the main window, on
// whichever screen that is.
export function showAbout(over: BrowserWindow | null): void {
  if (about) {
    about.focus()
    return
  }
  about = new BrowserWindow({
    width: 340,
    height: 420,
    useContentSize: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: 'hidden',
    title: 'About Galley',
    show: false,
    backgroundColor: windowBackground(),
    webPreferences: { sandbox: true }
  })
  if (over) {
    const parent = over.getBounds()
    const [width, height] = about.getSize()
    about.setPosition(
      pixel(parent.x + (parent.width - width) / 2),
      pixel(parent.y + (parent.height - height) / 2)
    )
  }
  about.on('ready-to-show', () => about?.show())
  about.on('closed', () => {
    about = null
  })
  // Links open in the browser; the window itself never navigates.
  about.webContents.on('will-navigate', (e, url) => {
    e.preventDefault()
    if (/^https?:/.test(url)) void shell.openExternal(url)
  })
  about.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  void about.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page())}`)
}
