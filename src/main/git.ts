import { execFile, spawn } from 'child_process'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { Change, ChangeKind, GitStatus, Identity } from '../shared/types'
import { resolveCommand } from './shell'

const protectedBranches = new Set(['staging', 'production', 'main', 'master', 'develop'])
const fetchInterval = 5 * 60_000

let gitBin: string | null = null

async function findGit(): Promise<string> {
  gitBin ??= (await resolveCommand('git')) ?? '/usr/bin/git'
  return gitBin
}

async function run(cwd: string, args: string[]): Promise<string> {
  const bin = await findGit()
  return new Promise((resolve, reject) => {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    execFile(bin, args, { cwd, env, maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message))
      else resolve(stdout)
    })
  })
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function kindOf(x: string, y: string): ChangeKind {
  if (x === '?') return 'untracked'
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
    return 'conflict'
  }
  if (x === 'R') return 'renamed'
  if (x === 'A' || y === 'A') return 'added'
  if (x === 'D' || y === 'D') return 'deleted'
  return 'modified'
}

function parseStatus(out: string): Change[] {
  const parts = out.split('\0')
  const changes: Change[] = []
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (entry.length < 4) continue
    const change: Change = { path: entry.slice(3), kind: kindOf(entry[0], entry[1]) }
    if (entry[0] === 'R' || entry[0] === 'C') change.from = parts[++i]
    changes.push(change)
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path))
}

// Git state of one checkout, refreshed after every operation and on a fetch timer.
export class Git {
  private lastFetch: number | null = null
  private fetchError: string | null = null
  private busy: string | null = null
  private timer: NodeJS.Timeout | null = null
  private refreshTimer: NodeJS.Timeout | null = null
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    readonly path: string,
    private onStatus: (status: GitStatus) => void
  ) {}

  start(): void {
    void this.fetch()
    this.timer = setInterval(() => void this.fetch(), fetchInterval)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.timer = null
  }

  // Every command waits for the previous one: concurrent git processes fight over the
  // index lock, and a status refresh can coincide with a pull or commit.
  private git(args: string[]): Promise<string> {
    const next = this.queue.then(() => run(this.path, args))
    this.queue = next.catch(() => undefined)
    return next
  }

  private async lines(args: string[]): Promise<string[]> {
    return (await this.git(args).catch(() => ''))
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  }

  async status(): Promise<GitStatus> {
    const head = (await this.git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')).trim()
    const branch = head === 'HEAD' ? '' : head
    const remotes = await this.lines(['branch', '-r', '--format=%(refname:short)'])
    const originHead = await this.git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
      .then((s) => s.trim().replace(/^origin\//, ''))
      .catch(() => 'main')
    const base = remotes.includes('origin/staging') ? 'staging' : originHead
    const upstream =
      (await this.git(['rev-parse', '--abbrev-ref', '@{upstream}']).catch(() => '')).trim() || null
    let ahead = 0
    let behind = 0
    if (upstream) {
      const counts = await this.git(['rev-list', '--left-right', '--count', `HEAD...${upstream}`])
      ;[ahead, behind] = counts.trim().split(/\s+/).map(Number)
    }
    const baseAhead = remotes.includes(`origin/${base}`)
      ? Number(
          (await this.git(['rev-list', '--count', `HEAD..origin/${base}`]).catch(() => '0')).trim()
        )
      : 0
    const remoteUrl =
      (await this.git(['remote', 'get-url', 'origin']).catch(() => '')).trim() || null
    const changes = parseStatus(
      await this.git([
        '--no-optional-locks',
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all'
      ]).catch(() => '')
    )
    return {
      branch,
      base,
      protected: protectedBranches.has(branch),
      changes,
      upstream,
      ahead,
      behind,
      baseAhead,
      remoteUrl,
      lastFetch: this.lastFetch,
      fetchError: this.fetchError,
      busy: this.busy
    }
  }

  async refresh(): Promise<void> {
    this.onStatus(await this.status())
  }

  // Working tree changes arrive in bursts; one refresh a second is plenty.
  scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => void this.refresh(), 1000)
  }

  private async op<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.busy = label
    void this.refresh()
    try {
      return await fn()
    } finally {
      this.busy = null
      await this.refresh()
    }
  }

  fetch(): Promise<void> {
    return this.op('Checking for updates…', async () => {
      try {
        await this.git(['fetch', '--prune', 'origin'])
        this.lastFetch = Date.now()
        this.fetchError = null
      } catch (e) {
        this.fetchError = message(e)
      }
    })
  }

  async branches(): Promise<string[]> {
    const local = await this.lines(['branch', '--format=%(refname:short)'])
    const remote = (await this.lines(['branch', '-r', '--format=%(refname:short)']))
      .filter((r) => r.startsWith('origin/') && r !== 'origin/HEAD')
      .map((r) => r.slice('origin/'.length))
    return [...new Set([...local, ...remote])].sort()
  }

  createBranch(name: string): Promise<void> {
    return this.op('Creating branch…', async () => {
      await this.git(['check-ref-format', '--branch', name])
      const { base } = await this.status()
      await this.git(['fetch', 'origin', base]).catch(() => undefined)
      await this.git(['switch', '-c', name, `origin/${base}`, '--no-track'])
    })
  }

  switchBranch(name: string): Promise<void> {
    return this.op('Switching branch…', async () => {
      await this.git(['switch', name])
    })
  }

  commit(msg: string, paths: string[]): Promise<void> {
    return this.op('Committing…', async () => {
      await this.git(['add', '-A', '--', ...paths])
      await this.git(['commit', '-m', msg])
    })
  }

  push(): Promise<void> {
    return this.op('Pushing…', async () => {
      await this.git(['push', '-u', 'origin', 'HEAD'])
      this.lastFetch = Date.now()
    })
  }

  pull(): Promise<void> {
    return this.op('Pulling…', async () => {
      await this.git(['pull', '--no-rebase', '--no-edit'])
    })
  }

  // Brings the latest base branch into the current one; a conflict is rolled back.
  update(): Promise<void> {
    return this.op('Updating from staging…', async () => {
      const { base } = await this.status()
      await this.git(['fetch', 'origin', base])
      try {
        await this.git(['merge', '--no-edit', `origin/${base}`])
      } catch (e) {
        await this.git(['merge', '--abort']).catch(() => undefined)
        throw new Error(`The update conflicts with changes on this branch. ${message(e)}`)
      }
    })
  }

  discard(path: string): Promise<void> {
    return this.op('Discarding…', async () => {
      await this.git(['reset', '-q', '--', path]).catch(() => undefined)
      await this.git(['checkout', 'HEAD', '--', path])
    })
  }

  async diff(path: string, untracked: boolean): Promise<string> {
    if (untracked) {
      const text = await fs.readFile(join(this.path, path), 'utf8').catch(() => null)
      if (text === null || text.includes('\0')) return 'Binary file'
      const lines = text.replace(/\n$/, '').split('\n')
      return [`--- /dev/null`, `+++ b/${path}`, `@@ -0,0 +1,${lines.length} @@`]
        .concat(lines.map((l) => '+' + l))
        .join('\n')
    }
    return this.git(['diff', '--no-color', '-U3', 'HEAD', '--', path])
  }

  async identity(): Promise<Identity | null> {
    const name = (await this.git(['config', 'user.name']).catch(() => '')).trim()
    const email = (await this.git(['config', 'user.email']).catch(() => '')).trim()
    return name && email ? { name, email } : null
  }

  async setIdentity({ name, email }: Identity): Promise<void> {
    await this.git(['config', 'user.name', name])
    await this.git(['config', 'user.email', email])
  }
}

export async function clone(
  url: string,
  dest: string,
  onProgress: (line: string) => void
): Promise<void> {
  const bin = await findGit()
  return new Promise((resolve, reject) => {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    const proc = spawn(bin, ['clone', '--progress', url, dest], { env })
    let output = ''
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString()
      output = (output + text).slice(-4000)
      for (const line of text.split(/[\r\n]+/)) if (line.trim()) onProgress(line.trim())
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('error', (err) => reject(err))
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else
        reject(
          new Error(output.trim().split('\n').slice(-3).join('\n') || `git exited with ${code}`)
        )
    })
  })
}
