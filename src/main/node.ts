import { app } from 'electron'
import { execFile } from 'child_process'
import { existsSync, promises as fs } from 'fs'
import { dirname, join } from 'path'
import { log } from './log'
import { loginPath, resolveCommand } from './shell'
import { download, json, pretendMissing, run, text } from './tools'
import { isNewer } from './updater'

// A checkout with a package.json runs some of its tools on Node, such as its scripts/check.
// Galley uses the Node the login shell finds, else downloads the current LTS release from
// nodejs.org into a folder of its own, and installs the site's packages when they are
// missing or older than the lock file.
const ownDir = (): string => join(app.getPath('userData'), 'node')
const ownBinary = (version: string): string => join(ownDir(), version, 'bin', 'node')
const installTimeout = 10 * 60_000

const needsNode = (repo: string): boolean => existsSync(join(repo, 'package.json'))

async function ownNode(): Promise<string | null> {
  const versions = await fs.readdir(ownDir()).catch(() => [] as string[])
  const usable = versions.filter((v) => existsSync(ownBinary(v)))
  if (usable.length === 0) return null
  return ownBinary(usable.reduce((best, v) => (isNewer(v, best) ? v : best)))
}

async function findNode(): Promise<string | null> {
  const onPath = pretendMissing('node') ? null : await resolveCommand('node')
  return onPath ?? (await ownNode())
}

async function downloadNode(): Promise<string> {
  const releases = (await json('https://nodejs.org/dist/index.json')) as {
    version: string
    lts: string | false
  }[]
  const lts = releases.find((r) => r.lts)
  if (!lts) throw new Error('nodejs.org lists no LTS release')
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const name = `node-${lts.version}-darwin-${arch}.tar.gz`
  const base = `https://nodejs.org/dist/${lts.version}`
  const sums = await text(`${base}/SHASUMS256.txt`)
  const expected = sums
    .split('\n')
    .find((line) => line.endsWith(`  ${name}`))
    ?.split(/\s+/)[0]
  if (!expected) throw new Error(`nodejs.org has no checksum for ${name}`)
  const version = lts.version.replace(/^v/, '')
  const dest = join(ownDir(), version)
  const tmp = await fs.mkdtemp(join(app.getPath('temp'), 'galley-node-'))
  try {
    const archive = join(tmp, name)
    const digest = await download(`${base}/${name}`, archive, () => undefined)
    if (digest !== expected) throw new Error('The Node download did not match its checksum')
    await fs.rm(dest, { recursive: true, force: true })
    await fs.mkdir(dest, { recursive: true })
    await run('/usr/bin/tar', ['-xzf', archive, '-C', dest, '--strip-components', '1'])
    for (const old of await fs.readdir(ownDir())) {
      if (old !== version) await fs.rm(join(ownDir(), old), { recursive: true, force: true })
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
  log('installed node', version)
  return ownBinary(version)
}

// npm writes node_modules/.package-lock.json with every install, so one older than the
// checkout's lock file means the packages changed since, after a pull for instance.
async function packagesCurrent(repo: string): Promise<boolean> {
  const installed = await fs
    .stat(join(repo, 'node_modules', '.package-lock.json'))
    .catch(() => null)
  if (!installed) return false
  const lock = await fs.stat(join(repo, 'package-lock.json')).catch(() => null)
  return !lock || installed.mtimeMs >= lock.mtimeMs
}

// Install scripts are not run, as the site's CI does; without a lock file nothing is
// written to the checkout but node_modules.
async function installPackages(repo: string, node: string): Promise<void> {
  const locked = existsSync(join(repo, 'package-lock.json'))
  const args = locked
    ? ['ci', '--ignore-scripts']
    : ['install', '--ignore-scripts', '--no-save', '--no-package-lock']
  const env = { ...process.env, PATH: `${dirname(node)}:${await loginPath()}` }
  await new Promise<void>((resolve, reject) => {
    execFile(
      join(dirname(node), 'npm'),
      args,
      { cwd: repo, env, timeout: installTimeout, maxBuffer: 16 << 20 },
      (err, _stdout, stderr) => (err ? reject(new Error(stderr.trim() || err.message)) : resolve())
    )
  })
  log('installed the packages of', repo)
}

const preparing = new Map<string, Promise<string | null>>()

// The node binary for the site's tools, with the site's packages installed; null when the
// site needs no Node or none could be had. Calls while one is under way share it.
export function prepareNode(repo: string): Promise<string | null> {
  if (!needsNode(repo)) return Promise.resolve(null)
  let pending = preparing.get(repo)
  if (!pending) {
    pending = prepare(repo).finally(() => preparing.delete(repo))
    preparing.set(repo, pending)
  }
  return pending
}

async function prepare(repo: string): Promise<string | null> {
  let node: string
  try {
    node = (await findNode()) ?? (await downloadNode())
  } catch (e) {
    log('node: could not get Node:', e instanceof Error ? e.message : String(e))
    return null
  }
  // Without its packages a tool still runs and says what is missing.
  if (!(await packagesCurrent(repo))) {
    await installPackages(repo, node).catch((e: unknown) =>
      log('node: npm failed:', e instanceof Error ? e.message : String(e))
    )
  }
  return node
}
