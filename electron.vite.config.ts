import { execSync } from 'child_process'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Development builds name the commit they come from; releases carry their version.
const describe = (): string => {
  try {
    return execSync('git describe --tags --dirty', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: { __GALLEY_BUILD__: JSON.stringify(describe()) }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
