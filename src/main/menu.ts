import { app, Menu, MenuItemConstructorOptions } from 'electron'
import type { MenuCommand } from '../shared/types'
import { isDev } from './env'

interface Actions {
  openRepo: () => void
  checkUpdates: () => void
  command: (command: MenuCommand) => void
  // Steps the text size up or down; null returns to the default.
  zoom: (step: number | null) => void
}

export function buildMenu(actions: Actions): Menu {
  const devItems: MenuItemConstructorOptions[] = isDev
    ? [{ type: 'separator' }, { role: 'toggleDevTools' }]
    : []
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
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
      submenu: [
        { label: 'Open site checkout…', accelerator: 'CmdOrCtrl+O', click: actions.openRepo },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => actions.command('save') },
        { type: 'separator' },
        { role: 'close' }
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
        { role: 'pasteAndMatchStyle' },
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
          label: 'Preview in separate window',
          accelerator: 'CmdOrCtrl+Alt+P',
          click: () => actions.command('detach-preview')
        },
        {
          label: 'Toggle Claude',
          accelerator: 'CmdOrCtrl+J',
          click: () => actions.command('toggle-terminal')
        },
        {
          label: 'Reload preview',
          accelerator: 'CmdOrCtrl+Alt+R',
          click: () => actions.command('reload-preview')
        },
        { type: 'separator' },
        // macOS matches these by character, with or without shift; the shifted variants
        // that slip through are caught by the key handler on the window.
        { label: 'Larger text', accelerator: 'CmdOrCtrl+Plus', click: () => actions.zoom(1) },
        { label: 'Smaller text', accelerator: 'CmdOrCtrl+-', click: () => actions.zoom(-1) },
        { label: 'Actual size', accelerator: 'CmdOrCtrl+0', click: () => actions.zoom(null) },
        ...devItems
      ]
    },
    { role: 'windowMenu' }
  ]
  return Menu.buildFromTemplate(template)
}
