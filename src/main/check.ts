import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import type { SiteCheck } from '../shared/types'
import { findHugo } from './hugo'
import { log } from './log'
import { prepareNode } from './node'
import { loginPath } from './shell'
import { findGit } from './tools'

// A site checks itself before each commit with an executable scripts/check in its checkout.
// Galley runs it from the checkout's root, with the Hugo and git it uses on the PATH, and
// anything but success stops the commit, with the end of the output to read. Every Mac has
// /bin/sh, unlike make, which comes with the Command Line Tools; a site with a package.json
// gets Node and its packages too.
const script = join('scripts', 'check')
const timeout = 5 * 60_000
const shownLines = 60

export const hasCheck = (repo: string): boolean => existsSync(join(repo, script))

// Null when the site has no check.
export async function runCheck(repo: string): Promise<SiteCheck | null> {
  if (!hasCheck(repo)) return null
  const [node, hugo, git, path] = await Promise.all([
    prepareNode(repo),
    findHugo(repo),
    findGit(),
    loginPath()
  ])
  const dirs = [node && dirname(node), hugo && dirname(hugo), git && dirname(git.bin), path]
  // Plain output, which tools give when they see no colour terminal.
  const env = {
    ...process.env,
    ...(git?.env ?? {}),
    PATH: dirs.filter(Boolean).join(':'),
    TERM: 'dumb',
    NO_COLOR: '1'
  }
  return new Promise((resolve) => {
    const proc = spawn(join(repo, script), [], { cwd: repo, env })
    let output = ''
    let finished = false
    proc.stdout.on('data', (d: Buffer) => (output += d.toString()))
    proc.stderr.on('data', (d: Buffer) => (output += d.toString()))
    const timer = setTimeout(() => {
      output += `\nThe check was stopped after ${timeout / 60_000} minutes.`
      proc.kill()
    }, timeout)
    const done = (code: number | null, error?: Error): void => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (code === 0) return resolve({ ok: true })
      const text = (error ? `${script} could not be started: ${error.message}` : output)
        .trimEnd()
        .split('\n')
        .slice(-shownLines)
        .join('\n')
      log('check: failed:', text.split('\n').slice(-5).join(' / '))
      resolve({ ok: false, output: text || `${script} failed with code ${code}` })
    }
    proc.on('error', (e) => done(null, e))
    proc.on('close', (code) => done(code))
  })
}
