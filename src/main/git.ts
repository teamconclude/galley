import { execFile, spawn } from 'child_process'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { extname, join } from 'path'
import type {
  Change,
  ChangeKind,
  Commit,
  CommitRange,
  GitStatus,
  Identity,
  OutsideEntry,
  PublishResult,
  ReleaseStep,
  SiteInfo
} from '../shared/types'
import { splitDiff } from '../shared/diff'
import { publish } from './github'
import { environmentSite } from './hugoConfig'
import { placementWarning } from './placement'
import { defaultSiteInfo } from '../shared/siteInfo'
import { prefs } from './settings'
import { findGit, gitEnv } from './tools'

const protectedBranches = new Set(['staging', 'production', 'main', 'master', 'develop'])
// Work flows from personal branches into the first of these, then on to the next.
const sharedChain = ['develop', 'staging', 'production']
const fetchInterval = 5 * 60_000
// Commits listed under one count; the count itself says how many there are in all.
const maxLog = 100

async function gitBinary(): Promise<string> {
  const tool = await findGit()
  if (!tool) throw new Error('git is not installed')
  return tool.bin
}

async function run(cwd: string, args: string[]): Promise<string> {
  return (await runBuffer(cwd, args)).toString('utf8')
}

async function runBuffer(cwd: string, args: string[]): Promise<Buffer> {
  const bin = await gitBinary()
  const env = { ...process.env, ...(await gitEnv()) }
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { cwd, env, maxBuffer: 64 << 20, encoding: 'buffer' },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.toString().trim() || err.message))
        else resolve(stdout)
      }
    )
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

// New files under a top-level entry git knows nothing about are not part of the site,
// e.g. documents and screenshots kept next to it; they are listed apart, per entry.
function splitOutside(
  changes: Change[],
  tracked: Set<string> | null
): { site: Change[]; outside: OutsideEntry[] } {
  if (!tracked) return { site: changes, outside: [] }
  const site: Change[] = []
  const outside = new Map<string, OutsideEntry>()
  for (const change of changes) {
    const top = change.path.split('/')[0]
    if (change.kind !== 'untracked' || tracked.has(top)) {
      site.push(change)
      continue
    }
    const entry = outside.get(top) ?? { path: top, isDir: top !== change.path, files: 0 }
    entry.files++
    outside.set(top, entry)
  }
  return { site, outside: [...outside.values()] }
}

const imageTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon'
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
    private onStatus: (status: GitStatus) => void,
    // The site's folders, for judging where new files are; setup only needs the defaults.
    private site: () => Promise<SiteInfo> = async () => defaultSiteInfo
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
    const base = await this.base(remotes)
    const isProtected = protectedBranches.has(branch)
    const upstream = await this.tracking(branch, remotes)
    let ahead = 0
    let behind = 0
    let rebased = false
    if (upstream) {
      ;[ahead, behind] = await this.aheadBehind(upstream)
      if (behind > 0 && !isProtected) {
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
      const count = await this.count([`origin/${to}..origin/${from}`])
      releases.push({ from, to, count, site: await environmentSite(this.path, to) })
    }
    const remoteUrl =
      (await this.git(['remote', 'get-url', 'origin']).catch(() => '')).trim() || null
    const all = parseStatus(
      await this.git([
        '--no-optional-locks',
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all'
      ]).catch(() => '')
    )
    const tracked = await this.git(['ls-tree', '--name-only', 'HEAD'])
      .then((out) => new Set(out.split('\n').filter(Boolean)))
      .catch(() => null)
    const { site: changes, outside } = splitOutside(all, tracked)
    const site = await this.site()
    for (const change of changes) {
      if (change.kind !== 'untracked' && change.kind !== 'added') continue
      const top = change.path.split('/')[0]
      const warning =
        tracked && !tracked.has(top)
          ? `${top} is not one of the site's folders, so the site does not use ${change.path.split('/').pop()}.`
          : placementWarning(this.path, change.path, site)
      if (warning) change.warning = warning
    }
    return {
      branch,
      base,
      protected: isProtected,
      changes,
      outside,
      upstream,
      ahead,
      behind,
      rebased,
      baseAhead,
      aheadOfBase,
      baseSite: hasBase ? await environmentSite(this.path, base) : null,
      releases,
      remoteUrl,
      lastFetch: this.lastFetch,
      fetchError: this.fetchError,
      busy: this.busy
    }
  }

  // The branch work starts from and returns to: develop where there is one, else the
  // branch GitHub opens with.
  private async base(remotes: string[]): Promise<string> {
    if (remotes.includes('origin/develop')) return 'develop'
    return this.git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
      .then((s) => s.trim().replace(/^origin\//, ''))
      .catch(() => 'main')
  }

  private async count(revs: string[], fallback = 0): Promise<number> {
    const out = await this.git(['rev-list', '--count', ...revs]).catch(() => String(fallback))
    return Number(out.trim())
  }

  // The configured upstream; a shared branch without one follows its namesake on origin.
  private async tracking(branch: string, remotes: string[]): Promise<string | null> {
    const upstream = (
      await this.git(['rev-parse', '--abbrev-ref', '@{upstream}']).catch(() => '')
    ).trim()
    if (upstream) return upstream
    const own = `origin/${branch}`
    return protectedBranches.has(branch) && remotes.includes(own) ? own : null
  }

  private async aheadBehind(ref: string): Promise<[number, number]> {
    const counts = await this.git(['rev-list', '--left-right', '--count', `HEAD...${ref}`])
    const [ahead, behind] = counts.trim().split(/\s+/).map(Number)
    return [ahead, behind]
  }

  // A shared branch only ever follows GitHub. When it has nothing of its own it is
  // brought level; edits that collide with the new commits leave it as it is.
  private async followShared(): Promise<void> {
    const branch = (await this.git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')).trim()
    if (!protectedBranches.has(branch)) return
    const remotes = await this.lines(['branch', '-r', '--format=%(refname:short)'])
    const upstream = await this.tracking(branch, remotes)
    if (!upstream) return
    const [ahead, behind] = await this.aheadBehind(upstream)
    if (ahead === 0 && behind > 0) {
      await this.git(['merge', '--ff-only', upstream]).catch(() => undefined)
    }
  }

  // The commits behind one of the counts the status reports, newest first.
  async log(range: CommitRange): Promise<Commit[]> {
    const status = await this.status()
    const { upstream, base } = status
    const revs = ((): string | null => {
      switch (range.kind) {
        case 'incoming':
          return upstream && `HEAD..${upstream}`
        case 'outgoing':
          return upstream ? `${upstream}..HEAD` : `origin/${base}..HEAD`
        case 'base':
          return `HEAD..origin/${base}`
        case 'branch':
          return `origin/${base}..HEAD`
        case 'release': {
          const known = status.releases.some((s) => s.from === range.from && s.to === range.to)
          return known ? `origin/${range.to}..origin/${range.from}` : null
        }
      }
    })()
    if (!revs) return []
    const out = await this.git([
      'log',
      '-n',
      String(maxLog),
      '--name-only',
      '--format=%x1e%H%x1f%an%x1f%ae%x1f%at%x1f%s',
      revs,
      '--'
    ])
    return out
      .split('\x1e')
      .filter((chunk) => chunk.trim())
      .map((chunk) => {
        const [head, ...files] = chunk.split('\n')
        const [hash, author, email, date, subject] = head.split('\x1f')
        return {
          hash,
          author,
          email,
          date: Number(date) * 1000,
          subject,
          files: files.filter(Boolean)
        }
      })
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
      await this.followShared()
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
      await this.followShared()
    })
  }

  // Commits made on a shared branch move to a new branch of their own, and the shared
  // branch goes back to what GitHub has. Uncommitted edits come along.
  async moveToBranch(name: string): Promise<void> {
    const { branch, protected: isProtected, upstream, ahead } = await this.status()
    if (!isProtected || !upstream || ahead === 0) {
      throw new Error(`${branch} has no commits of its own to move`)
    }
    return this.op('Moving commits…', async () => {
      await this.git(['check-ref-format', '--branch', name])
      await this.git(['switch', '-c', name])
      await this.git(['branch', '-f', branch, upstream])
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
    const { branch, rebased, protected: isProtected } = await this.status()
    if (isProtected) throw new Error(`${branch} is shared; move your commits to a branch first`)
    return this.op('Pushing…', async () => {
      await this.git(['push', '-u', ...(rebased ? ['--force-with-lease'] : []), 'origin', 'HEAD'])
      this.lastFetch = Date.now()
    })
  }

  // A shared branch only fast-forwards; merging into it would make commits nobody can push.
  async pull(): Promise<void> {
    const { branch, upstream, protected: isProtected } = await this.status()
    return this.op('Pulling…', async () => {
      if (!isProtected) {
        await this.git(['pull', '--no-rebase', '--no-edit'])
        return
      }
      if (!upstream) throw new Error(`${branch} is not on GitHub`)
      await this.git(['fetch', 'origin', branch])
      await this.git(['merge', '--ff-only', upstream])
    })
  }

  // Rebases the current branch onto the latest base branch; a conflict is rolled back.
  async update(): Promise<void> {
    const { branch, base, protected: isProtected } = await this.status()
    if (isProtected) throw new Error(`${branch} is shared and only follows GitHub`)
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

  // Fast-forwards the base branch on GitHub to this branch, then brings the branch level
  // with the base so work goes on here. By default its copy on GitHub is removed and comes
  // back with the next push.
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
      await this.git(['fetch', 'origin', base])
      await this.git(['merge', '--ff-only', `origin/${base}`]).catch(() => undefined)
      if (prefs().deleteMergedBranch) {
        await this.git(['push', 'origin', '--delete', branch]).catch(() => undefined)
        await this.git(['branch', '--unset-upstream']).catch(() => undefined)
      } else {
        await this.git(['push', 'origin', 'HEAD']).catch(() => undefined)
      }
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

  async unstage(path: string): Promise<void> {
    await this.git(['reset', '-q', '--', path]).catch(() => undefined)
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

  // Makes an entry outside the site part of it: its files show as new and the next
  // commit takes them, like any other change.
  async include(path: string): Promise<void> {
    if (!(await this.status()).outside.some((e) => e.path === path)) {
      throw new Error(`${path} is not listed outside the site`)
    }
    await this.git(['add', '--intent-to-add', '--', path])
    await this.refresh()
  }

  // Files under <dir> this branch brings: new in the checkout, or added by its commits
  // since it left the base branch.
  async added(dir: string): Promise<string[]> {
    const remotes = await this.lines(['branch', '-r', '--format=%(refname:short)'])
    const base = `origin/${await this.base(remotes)}`
    const committed = remotes.includes(base)
      ? await this.lines(['diff', '--name-only', '--diff-filter=A', `${base}...HEAD`, '--', dir])
      : []
    const staged = await this.lines([
      'diff',
      '--cached',
      '--name-only',
      '--diff-filter=A',
      '--',
      dir
    ])
    const untracked = await this.lines(['ls-files', '--others', '--exclude-standard', '--', dir])
    return [...new Set([...committed, ...staged, ...untracked])].sort()
  }

  // An image as last committed, for comparing it with the one in the checkout.
  async committedImage(path: string): Promise<string | null> {
    const type = imageTypes[extname(path).slice(1).toLowerCase()]
    if (!type) return null
    const data = await runBuffer(this.path, ['show', `HEAD:${path}`]).catch(() => null)
    return data && `data:${type};base64,${data.toString('base64')}`
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
