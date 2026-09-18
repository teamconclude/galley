import { execFile, spawn } from 'child_process'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  Change,
  ChangeKind,
  GitStatus,
  Identity,
  PublishResult,
  ReleaseStep
} from '../shared/types'
import { splitDiff } from '../shared/diff'
import { publish } from './github'
import { prefs } from './settings'
import { findGit, gitEnv } from './tools'

const protectedBranches = new Set(['staging', 'production', 'main', 'master', 'develop'])
// Work flows from personal branches into the first of these, then on to the next.
const sharedChain = ['develop', 'staging', 'production']
const fetchInterval = 5 * 60_000

async function gitBinary(): Promise<string> {
  const tool = await findGit()
  if (!tool) throw new Error('git is not installed')
  return tool.bin
}

async function run(cwd: string, args: string[]): Promise<string> {
  const bin = await gitBinary()
  const env = { ...process.env, ...(await gitEnv()) }
  return new Promise((resolve, reject) => {
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
    const base = remotes.includes('origin/develop') ? 'develop' : originHead
    const upstream =
      (await this.git(['rev-parse', '--abbrev-ref', '@{upstream}']).catch(() => '')).trim() || null
    let ahead = 0
    let behind = 0
    let rebased = false
    if (upstream) {
      const counts = await this.git(['rev-list', '--left-right', '--count', `HEAD...${upstream}`])
      ;[ahead, behind] = counts.trim().split(/\s+/).map(Number)
      if (behind > 0) {
        const unique = await this.count(
          `--cherry-pick --right-only HEAD...${upstream}`.split(' '),
          1
        )
        rebased = unique === 0
      }
    }
    const hasBase = remotes.includes(`origin/${base}`)
    const baseAhead = hasBase ? await this.count([`HEAD..origin/${base}`]) : 0
    const aheadOfBase = hasBase ? await this.count([`origin/${base}..HEAD`]) : 0
    const chain = sharedChain.filter((b) => remotes.includes(`origin/${b}`))
    const releases: ReleaseStep[] = []
    for (let i = 0; i + 1 < chain.length; i++) {
      const [from, to] = [chain[i], chain[i + 1]]
      releases.push({ from, to, count: await this.count([`origin/${to}..origin/${from}`]) })
    }
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
      rebased,
      baseAhead,
      aheadOfBase,
      releases,
      remoteUrl,
      lastFetch: this.lastFetch,
      fetchError: this.fetchError,
      busy: this.busy
    }
  }

  private async count(revs: string[], fallback = 0): Promise<number> {
    const out = await this.git(['rev-list', '--count', ...revs]).catch(() => String(fallback))
    return Number(out.trim())
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

  // A new branch starts from the latest base on GitHub. With edits in progress it starts
  // where the checkout stands instead: moving to a newer commit could not keep edits to
  // files that changed there too, and Update brings the branch forward after the commit.
  createBranch(name: string): Promise<void> {
    return this.op('Creating branch…', async () => {
      await this.git(['check-ref-format', '--branch', name])
      const { base, changes } = await this.status()
      if (changes.length > 0) {
        await this.git(['switch', '-c', name])
        return
      }
      await this.git(['fetch', 'origin', base]).catch(() => undefined)
      await this.git(['switch', '-c', name, `origin/${base}`, '--no-track'])
    })
  }

  switchBranch(name: string): Promise<void> {
    return this.op('Switching branch…', async () => {
      await this.git(['switch', name])
    })
  }

  async commit(msg: string, paths: string[]): Promise<void> {
    await this.op('Committing…', async () => {
      await this.git(['add', '-A', '--', ...paths])
      await this.git(['commit', '-m', msg])
    })
    const { branch } = await this.status()
    if (prefs().pushOnCommit && branch && !protectedBranches.has(branch)) await this.push()
  }

  // After a rebase the upstream holds only older versions of our commits, so replacing
  // them is safe; the lease still refuses if someone else pushed in the meantime.
  async push(): Promise<void> {
    const { rebased } = await this.status()
    return this.op('Pushing…', async () => {
      await this.git(['push', '-u', ...(rebased ? ['--force-with-lease'] : []), 'origin', 'HEAD'])
      this.lastFetch = Date.now()
    })
  }

  pull(): Promise<void> {
    return this.op('Pulling…', async () => {
      await this.git(['pull', '--no-rebase', '--no-edit'])
    })
  }

  // Rebases the current branch onto the latest base branch; a conflict is rolled back.
  async update(): Promise<void> {
    const { base } = await this.status()
    return this.op(`Updating from ${base}…`, async () => {
      await this.git(['fetch', 'origin', base])
      try {
        await this.git(['rebase', '--autostash', `origin/${base}`])
      } catch (e) {
        await this.git(['rebase', '--abort']).catch(() => undefined)
        throw new Error(`The changes on ${base} conflict with this branch. ${message(e)}`)
      }
    })
  }

  // Fast-forwards the base branch on GitHub to this branch. By default the merged branch
  // is then removed here and on GitHub and work continues on the base branch.
  async mergeToBase(): Promise<void> {
    const { branch, base, changes } = await this.status()
    if (!branch || branch === base) throw new Error(`Not on a branch to merge into ${base}`)
    if (changes.length > 0) throw new Error('Commit or discard your changes first')
    return this.op(`Merging into ${base}…`, async () => {
      await this.git(['fetch', 'origin', base])
      try {
        await this.git(['push', 'origin', `HEAD:${base}`])
      } catch (e) {
        if (!/protected branch/i.test(message(e))) {
          throw new Error(`${base} has changed on GitHub. Update this branch first. ${message(e)}`)
        }
        await this.pullRequestInto(branch, base)
      }
      this.lastFetch = Date.now()
      if (!prefs().deleteMergedBranch) return
      await this.git(['fetch', 'origin', base])
      await this.git(['switch', base]).catch(() =>
        this.git(['switch', '-c', base, `origin/${base}`])
      )
      await this.git(['merge', '--ff-only', `origin/${base}`])
      await this.git(['branch', '-D', branch])
      await this.git(['push', 'origin', '--delete', branch]).catch(() => undefined)
    })
  }

  // Merges one shared branch into the next in a temporary worktree, leaving the
  // editor's own checkout untouched.
  release(from: string, to: string): Promise<void> {
    return this.op(`Merging ${from} into ${to}…`, async () => {
      await this.git(['fetch', 'origin', from, to])
      const dir = await fs.mkdtemp(join(tmpdir(), 'galley-release-'))
      try {
        await this.git(['worktree', 'add', '--detach', dir, `origin/${to}`])
        try {
          await this.git([
            '-C',
            dir,
            'merge',
            '--no-edit',
            '-m',
            `Merge ${from} into ${to}`,
            `origin/${from}`
          ])
        } catch (e) {
          throw new Error(
            `${from} conflicts with ${to}; this needs resolving in git. ${message(e)}`
          )
        }
        await this.git(['-C', dir, 'push', 'origin', `HEAD:${to}`])
        this.lastFetch = Date.now()
      } finally {
        await this.git(['worktree', 'remove', '--force', dir]).catch(() => undefined)
      }
    })
  }

  // A base branch that only takes pull requests gets one, merged right away.
  private async pullRequestInto(branch: string, base: string): Promise<void> {
    const result = await publish(await this.slug(), branch, base)
    if (!result.merged) {
      throw new Error(
        `${base} only takes pull requests. One is open at ${result.url}; ${result.error ?? 'merge it on GitHub'}.`
      )
    }
  }

  private async slug(): Promise<string> {
    const { remoteUrl } = await this.status()
    const slug = remoteUrl?.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/)?.[1]
    if (!slug) throw new Error('The repository is not on GitHub')
    return slug
  }

  // The last hop is protected on GitHub and only takes pull requests.
  async publish(from: string, to: string): Promise<PublishResult> {
    const slug = await this.slug()
    return this.op(`Publishing ${from} to ${to}…`, async () => {
      const result = await publish(slug, from, to)
      await this.git(['fetch', 'origin', to]).catch(() => undefined)
      this.lastFetch = Date.now()
      return result
    })
  }

  discard(path: string): Promise<void> {
    return this.op('Discarding…', async () => {
      await this.git(['reset', '-q', '--', path]).catch(() => undefined)
      await this.git(['checkout', 'HEAD', '--', path])
    })
  }

  // Applies one hunk of the file's diff in reverse, leaving the other edits in place.
  revertHunk(path: string, index: number): Promise<void> {
    return this.op('Reverting…', async () => {
      const diff = await this.git(['diff', '--no-color', '-U3', 'HEAD', '--', path])
      const { header, hunks } = splitDiff(diff)
      if (!hunks[index]) throw new Error('That change is no longer in the file')
      const patch = join(tmpdir(), `galley-hunk-${process.pid}.patch`)
      await fs.writeFile(patch, header + hunks[index] + '\n')
      try {
        await this.git(['apply', '-R', '--recount', patch])
      } finally {
        await fs.unlink(patch).catch(() => undefined)
      }
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

  // Null unless both a name and something shaped like an email address are configured.
  async identity(): Promise<Identity | null> {
    const name = (await this.git(['config', 'user.name']).catch(() => '')).trim()
    const email = (await this.git(['config', 'user.email']).catch(() => '')).trim()
    return name && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? { name, email } : null
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
  const bin = await gitBinary()
  const env = { ...process.env, ...(await gitEnv()) }
  return new Promise((resolve, reject) => {
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
