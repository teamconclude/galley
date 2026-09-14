import { Menu, MenuItemConstructorOptions } from 'electron'
import type { MenuCommand } from '../shared/types'
import { isDev } from './env'

interface Actions {
  openRepo: () => void
  command: (command: MenuCommand) => void
}

export function buildMenu(actions: Actions): Menu {
  const devItems: MenuItemConstructorOptions[] = isDev
    ? [{ type: 'separator' }, { role: 'toggleDevTools' }]
    : []
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'Open site checkout…', accelerator: 'CmdOrCtrl+O', click: actions.openRepo },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => actions.command('save') },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    { role: 'editMenu' },
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
          accelerator: 'CmdOrCtrl+R',
          click: () => actions.command('reload-preview')
        },
        ...devItems
      ]
    },
    { role: 'windowMenu' }
  ]
  return Menu.buildFromTemplate(template)
}
