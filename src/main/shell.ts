import { execFile } from 'child_process'

// A GUI app does not inherit the shell PATH, so ask the login shell where a command lives.
export function resolveCommand(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('/bin/zsh', ['-lc', `command -v ${name}`], (err, stdout) => {
      resolve(err ? null : stdout.trim() || null)
    })
  })
}

let pathCache: string | null = null

// The login shell's PATH, for programs Galley starts without a shell.
export function loginPath(): Promise<string> {
  if (pathCache !== null) return Promise.resolve(pathCache)
  return new Promise((resolve) => {
    execFile('/bin/zsh', ['-lc', 'printf %s "$PATH"'], (err, stdout) => {
      pathCache = err || !stdout ? (process.env['PATH'] ?? '/usr/bin:/bin') : stdout
      resolve(pathCache)
    })
  })
}
