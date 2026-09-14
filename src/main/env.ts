import { app } from 'electron'

// Electron's own isPackaged flag keys off the executable being named "electron", which
// the development bundle is not (see scripts/dev-name). A packaged app lives inside its
// bundle's Resources folder; a development checkout does not.
export const isDev = !app.getAppPath().startsWith(process.resourcesPath)
