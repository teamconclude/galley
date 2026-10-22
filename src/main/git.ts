import { execFile, spawn } from 'child_process'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { extname, join, resolve } from 'path'
import type {
  BranchInfo,
  Review,
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
import { branchPrefix } from '../shared/branchPrefix'
import { reviewLink } from '../shared/reviewLink'
import { publish } from './github'
import { environmentSite } from './hugoConfig'
import { placementWarning } from './placement'
import { defaultSiteInfo } from '../shared/siteInfo'
import { loadSettings, prefs, saveSettings } from './settings'
import { findGit, gitEnv } from './tools'

const protectedBranches = new Set(['staging', 'production', 'main', 'master', 'develop'])
// Work flows from personal branches into the first of these, then on to the next.
const sharedChain = ['develop', 'staging', 'production']
const fetchInterval = 5 * 60_000
// Conflicts look the same on every Mac, whatever its git settings, as the Changes tab and
// the request to Claude describe them.
const plainMarkers = ['-c', 'merge.conflictStyle=merge']
const markerLine = /^(<{7}|>{7})( |$)/m
// Commits listed under one count; the count itself says how many there are in all.
const maxLog = 100

async function gitBinary(): Promise<string> {
  const tool = await findGit()
  if (!tool) throw new Error('git is not installed')
  return tool.bin
}

export async function run(cwd: string, args: string[]): Promise<string> {
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

// Edits set aside during an update or pull: the stash holding them, the commit to return
// to on cancelling, and where the changes being brought in come from.
interface Aside {
  stash: string
  head: string
  from: string
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
    const remotes = await this.lines(['branch', '-r', '--format=%(refname:short)'])
    const base = await this.base(remotes)
    // Halfway through a rebase the checkout has no branch; it still belongs to the one
    // being rebased.
    const stopped = await this.stoppedRebase()
    const branch = stopped?.branch ?? (head === 'HEAD' ? '' : head)
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
        const over = await this.rebasedOver(branch)
        rebased = unique === 0 || (over !== '' && over === (await this.sha(upstream)))
      }
    }
    const aside = await this.aside()
    const fromBase =
      stopped !== null &&
      (await this.git(['merge-base', '--is-ancestor', stopped.onto, `origin/${base}`]).then(
        () => true,
        () => false
      ))
    const baseRef = await this.baseRef(base)
    const hasBase = baseRef === base || remotes.includes(baseRef)
    const baseAhead = hasBase ? await this.count([`HEAD..${baseRef}`]) : 0
    const aheadOfBase = hasBase ? await this.count([`${baseRef}..HEAD`]) : 0
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
    for (const change of changes) {
      if (change.kind !== 'conflict') continue
      const text = await fs.readFile(join(this.path, change.path), 'utf8').catch(() => null)
      if (text !== null && !markerLine.test(text)) change.kind = 'resolved'
    }
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
      rebase: stopped
        ? { from: aside?.from ?? (fromBase ? base : 'GitHub'), edits: false }
        : aside && { from: aside.from, edits: true },
      baseAhead,
      aheadOfBase,
      baseSite: hasBase ? await environmentSite(this.path, base) : null,
      releases,
      remoteUrl,
      lastFetch: this.lastFetch,
      fetchError: this.fetchError,
      busy: this.busy,
      review: this.reviewOf(branch)
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

  // A site made with New site has no GitHub repository until the editor adds one; its
  // branches then work against the local base.
  private hasOrigin(): Promise<boolean> {
    return this.git(['remote', 'get-url', 'origin']).then(
      () => true,
      () => false
    )
  }

  // Where the base stands: on GitHub, or here for a site that is only on this Mac.
  private async baseRef(base: string): Promise<string> {
    return (await this.hasOrigin()) ? `origin/${base}` : base
  }

  private async count(revs: string[], fallback = 0): Promise<number> {
    const out = await this.git(['rev-list', '--count', ...revs]).catch(() => String(fallback))
    return Number(out.trim())
  }

  // The configured upstream; a shared branch without one follows its namesake on origin.
  private async tracking(branch: string, remotes: string[]): Promise<string | null> {
    if (!branch) return null
    const upstream = (
      await this.git(['rev-parse', '--abbrev-ref', `${branch}@{upstream}`]).catch(() => '')
    ).trim()
    if (upstream) return upstream
    const own = `origin/${branch}`
    return protectedBranches.has(branch) && remotes.includes(own) ? own : null
  }

  private async sha(ref: string): Promise<string> {
    return (await this.git(['rev-parse', ref]).catch(() => '')).trim()
  }

  // The rebase that stopped on conflicting edits: the branch it rewrites and the commit
  // it puts that branch on; null when none is under way.
  private async stoppedRebase(): Promise<{ branch: string; onto: string } | null> {
    const dir = (await this.git(['rev-parse', '--git-path', 'rebase-merge']).catch(() => '')).trim()
    if (!dir) return null
    const read = (name: string): Promise<string | null> =>
      fs.readFile(resolve(this.path, dir, name), 'utf8').then(
        (s) => s.trim(),
        () => null
      )
    const head = await read('head-name')
    if (!head) return null
    return { branch: head.replace(/^refs\/heads\//, ''), onto: (await read('onto')) ?? '' }
  }

  // Edits not committed yet are set aside while an update or pull rebases the branch, and
  // put back at the end. The note names them and the commit the branch was on, so
  // cancelling can return to both, also after a restart.
  private async asideFile(): Promise<string> {
    const rel = (await this.git(['rev-parse', '--git-path', 'galley-aside.json'])).trim()
    return resolve(this.path, rel)
  }

  private async aside(): Promise<Aside | null> {
    const file = await this.asideFile().catch(() => null)
    if (!file) return null
    return fs.readFile(file, 'utf8').then(
      (s) => JSON.parse(s) as Aside,
      () => null
    )
  }

  // Settling conflicts during an update changes the commits, so GitHub's copy no longer
  // looks like an older version of them. The copy an update replaced is noted, and while
  // GitHub still has exactly that, pushing over it is safe.
  private rebasedOver(branch: string): Promise<string> {
    return this.git(['config', `branch.${branch}.galleyRebasedOver`]).then(
      (s) => s.trim(),
      () => ''
    )
  }

  private async aheadBehind(ref: string): Promise<[number, number]> {
    const counts = await this.git(['rev-list', '--left-right', '--count', `HEAD...${ref}`])
    const [ahead, behind] = counts.trim().split(/\s+/).map(Number)
    return [ahead, behind]
  }

  // Every branch with nothing of its own follows its copy on GitHub: it moves forward
  // when others pushed, and onto the new commits when they rewrote the branch. Commits
  // GitHub never had keep a branch where it is, as do edits colliding with the new
  // commits, a branch checked out elsewhere, or an update that is under way.
  private async followGitHub(): Promise<void> {
    if ((await this.stoppedRebase()) || (await this.aside())) return
    const current = (await this.git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')).trim()
    const remotes = await this.lines(['branch', '-r', '--format=%(refname:short)'])
    const checkedOut = await this.checkedOut()
    for (const branch of await this.lines(['branch', '--format=%(refname:short)'])) {
      if (branch !== current && checkedOut.has(branch)) continue
      const upstream = await this.tracking(branch, remotes)
      if (!upstream) continue
      const local = await this.sha(`refs/heads/${branch}`)
      const remote = await this.sha(upstream)
      if (!remote || local === remote || (await this.isAncestor(remote, local))) continue
      const forward = await this.isAncestor(local, remote)
      if (!forward && !(await this.wasOnGitHub(upstream, local))) continue
      const move =
        branch === current
          ? ['reset', '--keep', upstream]
          : ['update-ref', `refs/heads/${branch}`, remote, local]
      await this.git(move).catch(() => undefined)
    }
  }

  private isAncestor(ancestor: string, of: string): Promise<boolean> {
    return this.git(['merge-base', '--is-ancestor', ancestor, of]).then(
      () => true,
      () => false
    )
  }

  // Whether GitHub's copy ever stood at this commit, by the fetches and pushes that moved
  // it here. A rebase made here and not pushed yet never did.
  private async wasOnGitHub(upstream: string, commit: string): Promise<boolean> {
    const seen = await this.lines(['reflog', 'show', '--format=%H', `refs/remotes/${upstream}`])
    return seen.includes(commit)
  }

  // Branches checked out in any worktree. Moving one checked out in another worktree
  // would leave its files behind.
  private async checkedOut(): Promise<Set<string>> {
    const prefix = 'branch refs/heads/'
    const lines = await this.lines(['worktree', 'list', '--porcelain'])
    return new Set(lines.filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length)))
  }

  // The commits behind one of the counts the status reports, newest first.
  async log(range: CommitRange): Promise<Commit[]> {
    const status = await this.status()
    const { upstream, base } = status
    const baseRef = await this.baseRef(base)
    const reviewable = range.kind === 'review' && (await this.validBranch(range.branch))
    const revs = ((): string | null => {
      switch (range.kind) {
        case 'incoming':
          return upstream && `HEAD..${upstream}`
        case 'outgoing':
          return upstream ? `${upstream}..HEAD` : `${baseRef}..HEAD`
        case 'base':
          return `HEAD..${baseRef}`
        case 'branch':
          return `${baseRef}..HEAD`
        case 'review':
          return reviewable ? `origin/${base}..origin/${range.branch}` : null
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

  async fetch(): Promise<void> {
    if (!(await this.hasOrigin())) {
      this.fetchError = null
      return this.refresh()
    }
    return this.op('Checking for updates…', async () => {
      try {
        await this.git(['fetch', '--prune', 'origin'])
        this.lastFetch = Date.now()
        this.fetchError = null
      } catch (e) {
        this.fetchError = message(e)
      }
      await this.followGitHub()
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
      await this.git(['switch', '-c', name, await this.baseRef(base), '--no-track'])
    })
  }

  switchBranch(name: string): Promise<void> {
    return this.op('Switching branch…', async () => {
      await this.git(['switch', name])
      await this.followGitHub()
    })
  }

  // The editor's own branches, here or on GitHub, which they may delete: those named with
  // their prefix. Without a commit identity there are none.
  async ownBranches(): Promise<string[]> {
    const email = (await this.identity())?.email
    if (!email) return []
    const prefix = branchPrefix(email)
    return (await this.branches()).filter((b) => b.startsWith(prefix) && b !== prefix)
  }

  async branchInfo(name: string): Promise<BranchInfo> {
    if (!(await this.validBranch(name))) throw new Error(`${name} is not a branch name`)
    const remotes = await this.lines(['branch', '-r', '--format=%(refname:short)'])
    const base = await this.base(remotes)
    const onGitHub = remotes.includes(`origin/${name}`)
    const local = await this.hasLocal(name)
    const tips = [...(local ? [`refs/heads/${name}`] : []), ...(onGitHub ? [`origin/${name}`] : [])]
    const authors = await this.lines([
      'log',
      '--format=%ae%x1f%an',
      ...tips,
      '--not',
      `origin/${base}`,
      '--'
    ])
    const me = (await this.identity())?.email.toLowerCase()
    const others = new Set<string>()
    for (const line of authors) {
      const [email, author] = line.split('\x1f')
      if (email.toLowerCase() !== me) others.add(author)
    }
    return { commits: authors.length, onGitHub, others: [...others].sort() }
  }

  private hasLocal(name: string): Promise<boolean> {
    return this.git(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]).then(
      () => true,
      () => false
    )
  }

  // Removes a branch here and, when asked, on GitHub. The branch in use is left for the
  // base branch first, which needs the checkout free of edits.
  async deleteBranch(name: string, onGitHub: boolean): Promise<void> {
    if (!(await this.ownBranches()).includes(name)) {
      throw new Error(`${name} is not one of your branches, so Galley does not delete it`)
    }
    const { branch, base, changes } = await this.ready()
    if (name === branch && changes.length > 0) {
      throw new Error(`Commit or discard your changes first, then delete ${name}`)
    }
    return this.op(`Deleting ${name}…`, async () => {
      if (name === branch) {
        await this.git(['switch', base])
        await this.followGitHub()
      }
      if (await this.hasLocal(name)) await this.git(['branch', '-D', name])
      if (onGitHub) await this.git(['push', 'origin', '--delete', name])
      const settings = loadSettings()
      if (settings.review?.repo === this.path && settings.review.branch === name) {
        delete settings.review
        saveSettings(settings)
      }
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

  // The status, for an operation that needs the branch at rest rather than halfway
  // through an update or pull.
  private async ready(): Promise<GitStatus> {
    const status = await this.status()
    if (status.rebase) {
      throw new Error('Bringing in changes stopped on a conflict; continue or cancel it first')
    }
    return status
  }

  async commit(msg: string, paths: string[]): Promise<void> {
    await this.ready()
    await this.op('Committing…', async () => {
      await this.git(['add', '-A', '--', ...paths])
      await this.git(['commit', '-m', msg])
    })
    await this.sync()
  }

  // After a rebase the upstream holds only older versions of our commits, so replacing
  // them is safe; the lease still refuses if someone else pushed in the meantime.
  async push(): Promise<void> {
    const { branch, rebased, protected: isProtected } = await this.ready()
    if (isProtected) throw new Error(`${branch} is shared; move your commits to a branch first`)
    return this.op('Pushing…', async () => {
      await this.git(['push', '-u', ...(rebased ? ['--force-with-lease'] : []), 'origin', 'HEAD'])
      this.lastFetch = Date.now()
      if (rebased) {
        await this.git(['config', '--unset', `branch.${branch}.galleyRebasedOver`]).catch(
          () => undefined
        )
      }
    })
  }

  // A branch of one's own is kept the same on GitHub as here, so a review link always
  // shows the latest work.
  private async sync(): Promise<void> {
    const {
      branch,
      protected: isProtected,
      upstream,
      ahead,
      rebased,
      aheadOfBase
    } = await this.status()
    if (!branch || isProtected) return
    if (ahead > 0 || rebased || (!upstream && aheadOfBase > 0)) await this.push()
  }

  // Own commits go on top of what others pushed to the branch. A shared branch only
  // fast-forwards; merging into it would make commits nobody can push.
  async pull(): Promise<void> {
    const { branch, upstream, protected: isProtected } = await this.ready()
    const waiting = await this.op('Pulling…', async () => {
      if (!isProtected) return this.rebaseWithEdits(['pull', '--rebase'], 'GitHub')
      if (!upstream) throw new Error(`${branch} is not on GitHub`)
      await this.git(['fetch', 'origin', branch])
      await this.git(['merge', '--ff-only', upstream])
      return false
    })
    if (!waiting) await this.sync()
  }

  // Rebases the current branch onto the latest base branch and replaces its copy on
  // GitHub. Commits others pushed to the branch are pulled first, or replacing the copy
  // would drop them.
  async update(): Promise<void> {
    const { branch, base, upstream, protected: isProtected } = await this.ready()
    if (isProtected) throw new Error(`${branch} is shared and only follows GitHub`)
    const waiting = await this.op(`Updating from ${base}…`, async () => {
      if (await this.hasOrigin()) await this.git(['fetch', 'origin', base])
      if (upstream) await this.git(['fetch', 'origin', branch]).catch(() => undefined)
      const now = await this.status()
      if (now.behind > 0 && !now.rebased) {
        throw new Error(`${branch} has new commits on GitHub. Pull them first, then update.`)
      }
      if (upstream) {
        await this.git(['config', `branch.${branch}.galleyRebasedOver`, await this.sha(upstream)])
      }
      return this.rebaseWithEdits(['rebase', await this.baseRef(base)], base)
    })
    if (!waiting) await this.sync()
  }

  // Rebases with the edits in progress set aside and puts them back at the end; true when
  // it waits on conflicts, in the rebase or in putting the edits back. GitHub only gets
  // the result once nothing waits, so cancelling never has to undo a push.
  private async rebaseWithEdits(args: string[], from: string): Promise<boolean> {
    await this.setAside(from)
    try {
      if (await this.rebase(args)) return true
    } catch (e) {
      await this.putBack().catch(() => undefined)
      throw e
    }
    return this.putBack()
  }

  private async setAside(from: string): Promise<void> {
    const dirty = await this.git(['diff', '--quiet', 'HEAD']).then(
      () => false,
      () => true
    )
    if (!dirty) return
    const head = await this.sha('HEAD')
    await this.git(['stash', 'push', '-m', 'Galley: edits set aside while bringing in changes'])
    const aside: Aside = { stash: await this.sha('stash@{0}'), head, from }
    await fs.writeFile(await this.asideFile(), JSON.stringify(aside))
  }

  // True when some of the edits clash with what came in; they wait in the checkout with
  // conflict markers, and the stash keeps them until they are settled.
  private async putBack(): Promise<boolean> {
    const aside = await this.aside()
    if (!aside) return false
    try {
      await this.git([...plainMarkers, 'stash', 'apply', aside.stash])
    } catch (e) {
      if ((await this.unmerged()).length > 0) return true
      throw e
    }
    await this.dropAside(aside)
    return false
  }

  private async dropAside(aside: Aside): Promise<void> {
    const index = (await this.lines(['stash', 'list', '--format=%H'])).indexOf(aside.stash)
    if (index >= 0) await this.git(['stash', 'drop', '-q', `stash@{${index}}`])
    await fs.unlink(await this.asideFile()).catch(() => undefined)
  }

  private unmerged(): Promise<string[]> {
    return this.lines(['diff', '--name-only', '--diff-filter=U'])
  }

  // Runs a rebase; true when it stopped on conflicting edits, which wait in the checkout
  // for the editor or Claude to settle them.
  private async rebase(args: string[]): Promise<boolean> {
    try {
      await this.git([...plainMarkers, ...args])
      return false
    } catch (e) {
      if (await this.stoppedRebase()) return true
      throw e
    }
  }

  // Carries on once the conflicts are settled; a later commit, or putting back the edits,
  // may stop it again. A commit whose changes turn out to be in place already is left out.
  // Settled edits stay uncommitted, as they were before.
  async continueRebase(): Promise<void> {
    const stopped = await this.stoppedRebase()
    const aside = await this.aside()
    if (!stopped && !aside) throw new Error('Nothing is waiting to continue')
    const waiting = await this.op('Continuing…', async () => {
      const unmerged = await this.unmerged()
      const marked: string[] = []
      for (const path of unmerged) {
        const text = await fs.readFile(join(this.path, path), 'utf8').catch(() => '')
        if (markerLine.test(text)) marked.push(path)
      }
      if (marked.length > 0) {
        throw new Error(
          `${marked.join(', ')} still ${marked.length === 1 ? 'has' : 'have'} conflict markers. ` +
            'Keep what should stay and remove the lines starting <<<<<<<, ======= and >>>>>>>.'
        )
      }
      if (stopped) {
        await this.git(['add', '-u'])
        const empty = await this.git(['diff', '--cached', '--quiet', 'HEAD']).then(
          () => true,
          () => false
        )
        const step = ['-c', 'core.editor=true', 'rebase', empty ? '--skip' : '--continue']
        if (await this.rebase(step)) return true
        return this.putBack()
      }
      // Putting the edits back failed without conflicts before; it is tried again.
      if (unmerged.length === 0) return this.putBack()
      await this.git(['reset', '-q', '--', ...unmerged])
      await this.dropAside(aside!)
      return false
    })
    if (!waiting) await this.sync()
  }

  // Puts the branch and the edits in progress back as they were before the update or pull.
  abortRebase(): Promise<void> {
    return this.op('Cancelling…', async () => {
      const aside = await this.aside()
      if (await this.stoppedRebase()) await this.git(['rebase', '--abort'])
      else if (aside) await this.git(['reset', '-q', '--hard', aside.head])
      await this.putBack()
    })
  }

  // Fast-forwards the base branch on GitHub to this branch, then brings the branch level
  // with the base so work goes on here. By default its copy on GitHub is removed and comes
  // back with the next push.
  async mergeToBase(): Promise<void> {
    const { branch, base, changes } = await this.ready()
    if (!branch || branch === base) throw new Error(`Not on a branch to merge into ${base}`)
    if (changes.length > 0) throw new Error('Commit or discard your changes first')
    // Without GitHub the base moves forward here instead.
    if (!(await this.hasOrigin())) {
      return this.op(`Merging into ${base}…`, async () => {
        const level = await this.git(['merge-base', '--is-ancestor', base, 'HEAD']).then(
          () => true,
          () => false
        )
        if (!level) throw new Error(`${base} has moved on. Update this branch first.`)
        await this.git(['branch', '-f', base, 'HEAD'])
      })
    }
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
      await this.followGitHub()
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
      await this.followGitHub()
    })
  }

  // A base branch that only takes pull requests gets one, merged right away.
  private async pullRequestInto(branch: string, base: string): Promise<void> {
    const slug = await this.slug()
    const link = reviewLink({ repo: slug, branch, page: null })
    const body = `Opened from Galley.\n\n[Review ${branch} in Galley](${link})`
    const result = await publish(slug, branch, base, body)
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
      await this.followGitHub()
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

  // Whether a file is on a shared branch, so browsers and caches may hold it. Without
  // GitHub, the checkout's own shared branches stand in.
  async published(path: string): Promise<boolean> {
    const origin = await this.hasOrigin()
    const remotes = origin ? await this.lines(['branch', '-r', '--format=%(refname:short)']) : []
    for (const branch of protectedBranches) {
      const ref = origin ? `origin/${branch}` : branch
      if (origin && !remotes.includes(ref)) continue
      const found = await this.git(['cat-file', '-e', `${ref}:${path}`]).then(
        () => true,
        () => false
      )
      if (found) return true
    }
    return false
  }

  // Branches on GitHub, other than this one and the shared ones, whose own changes since
  // the base add or remove the text under the folders, e.g. a colleague's page that
  // starts using an image.
  async branchesUsing(text: string, dirs: string[]): Promise<string[]> {
    if (!(await this.hasOrigin())) return []
    const remotes = await this.lines(['branch', '-r', '--format=%(refname:short)'])
    const base = `origin/${await this.base(remotes)}`
    if (!remotes.includes(base)) return []
    const head = (await this.git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')).trim()
    const found: string[] = []
    for (const ref of remotes) {
      if (!ref.startsWith('origin/')) continue
      const name = ref.slice('origin/'.length)
      if (name === 'HEAD' || name === head || protectedBranches.has(name)) continue
      const files = await this.lines([
        'diff',
        '--name-only',
        `-S${text}`,
        `${base}...${ref}`,
        '--',
        ...dirs.map((d) => d || '.')
      ])
      if (files.length > 0) found.push(name)
    }
    return found
  }

  // When each file directly in dir last changed: its last commit, for files without
  // changes since. A checkout gives every file the same time on disk, so the disk only
  // speaks for changed and new files, which are left out here.
  async changeTimes(dir: string): Promise<Map<string, number>> {
    const scope = dir || '.'
    const [log, status] = await Promise.all([
      this.git([
        '-c',
        'core.quotePath=false',
        'log',
        '--format=%x00%at',
        '--name-only',
        '--no-renames',
        '--',
        scope
      ]).catch(() => ''),
      this.git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', scope]).catch(
        () => ''
      )
    ])
    const dirty = new Set(
      status
        .split('\0')
        .filter((e) => e.length > 3)
        .map((e) => e.slice(3))
    )
    const times = new Map<string, number>()
    let time = 0
    for (const line of log.split('\n')) {
      if (line.startsWith('\0')) time = Number(line.slice(1)) * 1000
      else if (line && !dirty.has(line) && !times.has(line)) {
        const rest = dir ? line.slice(dir.length + 1) : line
        if (!rest.includes('/')) times.set(line, time)
      }
    }
    return times
  }

  // A review in progress in this checkout, while it is on the reviewed branch.
  private reviewOf(branch: string): Review | null {
    const review = loadSettings().review
    if (!review || review.repo !== this.path || review.branch !== branch) return null
    return { branch: review.branch, from: review.from }
  }

  private validBranch(name: string): Promise<boolean> {
    return this.git(['check-ref-format', '--branch', name]).then(
      () => true,
      () => false
    )
  }

  // The repository on GitHub, as owner/name, or null.
  async repoSlug(): Promise<string | null> {
    return this.slug().catch(() => null)
  }

  // Brings a colleague's branch from GitHub without touching the checkout; false when
  // GitHub has no such branch, e.g. after it was merged and removed.
  async fetchBranch(name: string): Promise<boolean> {
    if (!(await this.validBranch(name))) throw new Error(`${name} is not a branch name`)
    return this.op(`Getting ${name}…`, async () => {
      const ref = `+refs/heads/${name}:refs/remotes/origin/${name}`
      const found = await this.git(['fetch', 'origin', ref]).then(
        () => true,
        () => false
      )
      this.lastFetch = Date.now()
      return found
    })
  }

  // Switches to a fetched branch, up to date with GitHub, and remembers the branch to go
  // back to. Opening a second review keeps the first way back.
  async startReview(name: string): Promise<void> {
    if (!(await this.validBranch(name))) throw new Error(`${name} is not a branch name`)
    const { branch, review } = await this.status()
    const from = review?.from ?? branch
    await this.op(`Opening ${name}…`, async () => {
      await this.git(['switch', name])
      await this.git(['merge', '--ff-only', `origin/${name}`]).catch(() => undefined)
    })
    if (from && from !== name) {
      saveSettings({ ...loadSettings(), review: { repo: this.path, branch: name, from } })
    }
    await this.refresh()
  }

  // Back to the branch the review started from.
  async endReview(): Promise<void> {
    const review = loadSettings().review
    if (!review || review.repo !== this.path) return
    await this.switchBranch(review.from)
    const settings = loadSettings()
    delete settings.review
    saveSettings(settings)
    await this.refresh()
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
  onProgress: (line: string) => void,
  options: string[] = []
): Promise<void> {
  const bin = await gitBinary()
  const env = { ...process.env, ...(await gitEnv()) }
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, ['clone', '--progress', ...options, url, dest], { env })
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
