import { app, net } from 'electron'
import { execFile, spawn } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { token as githubToken } from './github'
import { log } from './log'
import { resolveCommand } from './shell'
import { isNewer } from './updater'

export interface Tool {
  bin: string
  env: Record<string, string>
}

// GALLEY_FRESH=git,claude,hugo makes Galley behave as if those tools were missing, to
// exercise the downloads on a machine that has them.
export const pretendMissing = (name: string): boolean =>
  (process.env['GALLEY_FRESH'] ?? '').split(',').includes(name)

const ownDir = (name: string): string => join(app.getPath('userData'), name)

function ok(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => execFile(cmd, args, (err) => resolve(!err)))
}

// Apple ships /usr/bin/git as a stub that only offers to install the Command Line Tools.
async function systemGit(): Promise<string | null> {
  if (pretendMissing('git')) return null
  const bin = await resolveCommand('git')
  if (!bin) return null
  if (bin !== '/usr/bin/git') return bin
  return (await ok('/usr/bin/xcode-select', ['-p'])) ? bin : null
}

async function newestVersion(dir: string, probe: (v: string) => string): Promise<string | null> {
  const versions = (await fs.readdir(dir).catch(() => [] as string[])).filter((v) =>
    existsSync(probe(v))
  )
  if (versions.length === 0) return null
  return versions.reduce((best, v) => (isNewer(v, best) ? v : best))
}

async function ownGit(): Promise<Tool | null> {
  const version = await newestVersion(ownDir('git'), (v) => join(ownDir('git'), v, 'bin', 'git'))
  if (!version) return null
  const dir = join(ownDir('git'), version)
  const env: Record<string, string> = {
    GIT_EXEC_PATH: join(dir, 'libexec', 'git-core'),
    GIT_TEMPLATE_DIR: join(dir, 'share', 'git-core', 'templates'),
    PREFIX: dir
  }
  const certs = join(dir, 'ssl', 'cacert.pem')
  if (existsSync(certs)) env.GIT_SSL_CAINFO = certs
  return { bin: join(dir, 'bin', 'git'), env }
}

let gitTool: Tool | null | undefined

export async function findGit(): Promise<Tool | null> {
  if (gitTool === undefined) {
    const system = await systemGit()
    gitTool = system ? { bin: system, env: {} } : await ownGit()
  }
  return gitTool
}

// A portable git from GitHub Desktop's dugite-native project, for Macs without the
// Command Line Tools.
export async function downloadGit(progress: (percent: number) => void): Promise<Tool> {
  const release = await json('https://api.github.com/repos/desktop/dugite-native/releases/latest')
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const assets = release as {
    tag_name: string
    assets: { name: string; browser_download_url: string }[]
  }
  const suffix = `-macOS-${arch}.tar.gz`
  const asset = assets.assets.find((a) => a.name.endsWith(suffix))
  const sum = assets.assets.find((a) => a.name.endsWith(`${suffix}.sha256`))
  if (!asset || !sum) throw new Error('No portable git build for this Mac')
  const expected = (await text(sum.browser_download_url)).trim().split(/\s+/)[0]
  const version = assets.tag_name.replace(/^v/, '')
  const dest = join(ownDir('git'), version)
  const tmp = await fs.mkdtemp(join(app.getPath('temp'), 'galley-git-'))
  try {
    const archive = join(tmp, asset.name)
    const digest = await download(asset.browser_download_url, archive, progress)
    if (digest !== expected) throw new Error('The git download did not match its checksum')
    await fs.rm(dest, { recursive: true, force: true })
    await fs.mkdir(dest, { recursive: true })
    await run('/usr/bin/tar', ['-xzf', archive, '-C', dest])
    for (const old of await fs.readdir(ownDir('git'))) {
      if (old !== version) await fs.rm(join(ownDir('git'), old), { recursive: true, force: true })
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
  const tool = await ownGit()
  if (!tool) throw new Error('The git download is missing its binary')
  gitTool = tool
  log('installed git', tool.bin)
  return tool
}

let askpass: string | null = null

// Environment for every git call: the portable git's paths when in use, and the GitHub
// token as git's only credential helper, so neither a prompt nor a helper installed on
// the Mac, such as Git Credential Manager, gets in the way.
export async function gitEnv(): Promise<Record<string, string>> {
  const tool = await findGit()
  const env: Record<string, string> = { GIT_TERMINAL_PROMPT: '0', ...(tool?.env ?? {}) }
  const tok = githubToken()
  if (tok) {
    askpass ??= await writeAskpass()
    env.GIT_ASKPASS = askpass
    env.GALLEY_GIT_TOKEN = tok
    env.GIT_CONFIG_COUNT = '2'
    env.GIT_CONFIG_KEY_0 = 'credential.helper'
    env.GIT_CONFIG_VALUE_0 = ''
    env.GIT_CONFIG_KEY_1 = 'credential.helper'
    env.GIT_CONFIG_VALUE_1 =
      '!f() { echo username=x-access-token; echo "password=$GALLEY_GIT_TOKEN"; }; f'
  }
  return env
}

async function writeAskpass(): Promise<string> {
  const path = join(app.getPath('userData'), 'askpass.sh')
  const script =
    '#!/bin/sh\ncase "$1" in\n  *sername*) echo x-access-token ;;\n  *) echo "$GALLEY_GIT_TOKEN" ;;\nesac\n'
  await fs.writeFile(path, script, { mode: 0o755 })
  return path
}

const claudeHome = join(homedir(), '.local', 'bin', 'claude')

export async function findClaude(): Promise<string | null> {
  if (pretendMissing('claude')) return null
  return (await resolveCommand('claude')) ?? (existsSync(claudeHome) ? claudeHome : null)
}

// The official installer puts a native binary under ~/.local/bin without admin rights.
export function installClaude(onLine: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }
    const proc = spawn('/bin/bash', ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'], {
      env
    })
    let output = ''
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString()
      output = (output + text).slice(-4000)
      for (const line of text.split(/[\r\n]+/)) if (line.trim()) onLine(line.trim())
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('error', reject)
    proc.on('exit', (code) => {
      if (code !== 0) {
        return reject(new Error(output.trim().split('\n').slice(-3).join('\n') || 'install failed'))
      }
      if (!existsSync(claudeHome))
        return reject(new Error('The installer finished but claude is missing'))
      log('installed claude', claudeHome)
      resolve(claudeHome)
    })
  })
}

async function json(url: string): Promise<unknown> {
  const res = await net.fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.json()
}

async function text(url: string): Promise<string> {
  const res = await net.fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.text()
}

// Streams a download to disk and returns its SHA-256.
export async function download(
  url: string,
  path: string,
  progress: (percent: number) => void
): Promise<string> {
  const res = await net.fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  const total = Number(res.headers.get('content-length'))
  const hash = createHash('sha256')
  const chunks: Buffer[] = []
  let received = 0
  let reported = -1
  for await (const chunk of res.body) {
    const buf = Buffer.from(chunk)
    chunks.push(buf)
    hash.update(buf)
    received += buf.length
    const percent = total ? Math.floor((received / total) * 100) : 0
    if (percent !== reported) progress((reported = percent))
  }
  await fs.writeFile(path, Buffer.concat(chunks))
  return hash.digest('hex')
}

export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message))
      else resolve(stdout)
    })
  })
}
