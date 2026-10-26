import { app, Menu, MenuItemConstructorOptions } from 'electron'
import { homedir } from 'os'
import type { MenuCommand, MenuState } from '../shared/types'
import { isDev } from './env'

interface Actions {
  about: () => void
  manual: () => void
  // The sites opened before, newest first, for Open Recent.
  recent: string[]
  openRecent: (path: string) => void
  checkUpdates: () => void
  command: (command: MenuCommand) => void
  // Steps the text size up or down; null returns to the default.
  zoom: (step: number | null) => void
}

function buildMenu(actions: Actions): Menu {
  const devItems: MenuItemConstructorOptions[] = isDev
    ? [{ type: 'separator' }, { role: 'toggleDevTools' }]
    : []
  // A File menu item that acts on the open site or page; see setMenuState.
  const item = (
    command: MenuCommand,
    label: string,
    accelerator?: string
  ): MenuItemConstructorOptions => ({
    id: command,
    label,
    accelerator,
    enabled: false,
    click: () => actions.command(command)
  })
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { label: 'About Galley', click: actions.about },
        { label: 'Check for updates…', click: actions.checkUpdates },
        { label: 'Setup…', click: () => actions.command('setup') },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => actions.command('settings')
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      // No Close: Galley has one main window, and ⌘W closing it surprised editors who
      // meant the page. The separate preview window handles ⌘W itself.
      submenu: [
        item('new-page', 'New Page…', 'CmdOrCtrl+N'),
        item('new-page-from-document', 'New Page from Document…', 'CmdOrCtrl+Shift+N'),
        item('new-folder', 'New Folder…'),
        item('add-images', 'Add Images…'),
        { type: 'separator' },
        item('find-page', 'Find Page…', 'CmdOrCtrl+P'),
        item('open-review-link', 'Open Review Link…'),
        { type: 'separator' },
        item('save', 'Save', 'CmdOrCtrl+S'),
        item('duplicate-page', 'Duplicate Page…'),
        item('rename-page', 'Rename Page…'),
        item('trash-page', 'Move Page to Trash…'),
        { type: 'separator' },
        item('open-in-browser', 'Open in Browser'),
        item('show-in-finder', 'Show in Finder'),
        { type: 'separator' },
        { label: 'New Site…', click: () => actions.command('new-site') },
        {
          label: 'Open Site…',
          accelerator: 'CmdOrCtrl+O',
          click: () => actions.command('open-site')
        },
        {
          label: 'Open Recent',
          submenu:
            actions.recent.length > 0
              ? actions.recent.map((path) => ({
                  label: path.replace(homedir(), '~'),
                  click: () => actions.openRecent(path)
                }))
              : [{ label: 'No recent sites', enabled: false }]
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        {
          label: 'Paste as plain text',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => actions.command('paste-plain')
        },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => actions.command('find') },
        { label: 'Replace', accelerator: 'CmdOrCtrl+R', click: () => actions.command('replace') },
        {
          label: 'Find in site',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => actions.command('find-in-site')
        },
        {
          label: 'Replace in site',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => actions.command('replace-in-site')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle preview',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => actions.command('toggle-preview')
        },
        {
          label: 'Preview in its own window',
          accelerator: 'CmdOrCtrl+Alt+P',
          click: () => actions.command('detach-preview')
        },
        {
          label: 'Toggle Claude',
          accelerator: 'CmdOrCtrl+J',
          click: () => actions.command('toggle-terminal')
        },
        { label: 'Reset Tool Windows', click: () => actions.command('reset-tool-windows') },
        {
          label: 'Reload preview',
          accelerator: 'CmdOrCtrl+Alt+R',
          click: () => actions.command('reload-preview')
        },
        { type: 'separator' },
        // As in a browser, through the pages visited in the editor and the preview alike.
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => actions.command('back') },
        { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => actions.command('forward') },
        { type: 'separator' },
        // macOS matches these by character, with or without shift; the shifted variants
        // that slip through are caught by the key handler on the window.
        { label: 'Larger text', accelerator: 'CmdOrCtrl+Plus', click: () => actions.zoom(1) },
        { label: 'Smaller text', accelerator: 'CmdOrCtrl+-', click: () => actions.zoom(-1) },
        { label: 'Actual size', accelerator: 'CmdOrCtrl+0', click: () => actions.zoom(null) },
        ...devItems
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'Galley Manual', accelerator: 'CmdOrCtrl+?', click: actions.manual }]
    }
  ]
  return Menu.buildFromTemplate(template)
}

const siteCommands: MenuCommand[] = [
  'new-page',
  'new-page-from-document',
  'new-folder',
  'add-images',
  'find-page',
  'open-review-link'
]
const pageCommands: MenuCommand[] = [
  'save',
  'duplicate-page',
  'rename-page',
  'trash-page',
  'show-in-finder'
]

let lastState: MenuState | null = null

// Sets the application menu, again whenever the recent sites change, keeping which items
// are enabled.
export function installMenu(actions: Actions): void {
  Menu.setApplicationMenu(buildMenu(actions))
  if (lastState) setMenuState(lastState)
}

// Greys out the items that need an open site, an open page, or its preview.
export function setMenuState(state: MenuState): void {
  lastState = state
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  for (const id of siteCommands) {
    const entry = menu.getMenuItemById(id)
    if (entry) entry.enabled = state.site
  }
  for (const id of pageCommands) {
    const entry = menu.getMenuItemById(id)
    if (entry) entry.enabled = state.page
  }
  const browser = menu.getMenuItemById('open-in-browser')
  if (browser) browser.enabled = state.preview
}
