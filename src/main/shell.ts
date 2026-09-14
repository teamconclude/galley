import { execFile } from 'child_process'

// A GUI app does not inherit the shell PATH, so ask the login shell where a command lives.
export function resolveCommand(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('/bin/zsh', ['-lc', `command -v ${name}`], (err, stdout) => {
      resolve(err ? null : stdout.trim() || null)
    })
  })
}
