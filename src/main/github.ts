import { net, safeStorage } from 'electron'
import type { GitHubUser, PublishResult } from '../shared/types'
import { loadSettings, saveSettings } from './settings'

// The client id of Galley's GitHub OAuth app (device flow enabled). Fill in the built-in
// value once the app is registered; the environment variable is for development.
const builtInClientId = 'Ov23liFRTZql1HNrCybR'
export const clientId = process.env['GALLEY_GITHUB_CLIENT_ID'] ?? builtInClientId

const scope = 'repo read:user user:email'

export interface DeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  interval: number
  expiresAt: number
}

async function post(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await net.fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  return (await res.json()) as Record<string, unknown>
}

export async function startDeviceFlow(): Promise<DeviceCode> {
  const r = await post('https://github.com/login/device/code', { client_id: clientId, scope })
  return {
    deviceCode: String(r.device_code),
    userCode: String(r.user_code),
    verificationUri: String(r.verification_uri),
    interval: Number(r.interval) || 5,
    expiresAt: Date.now() + (Number(r.expires_in) || 900) * 1000
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Polls until the user has entered the code on github.com.
export async function waitForToken(code: DeviceCode, live: () => boolean): Promise<string> {
  let interval = code.interval
  while (live()) {
    await sleep(interval * 1000)
    if (!live()) break
    if (Date.now() > code.expiresAt) throw new Error('The sign-in code expired; try again')
    const r = await post('https://github.com/login/oauth/access_token', {
      client_id: clientId,
      device_code: code.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })
    if (typeof r.access_token === 'string') return r.access_token
    if (r.error === 'slow_down') interval += 5
    else if (r.error !== 'authorization_pending') {
      throw new Error(
        typeof r.error_description === 'string' ? r.error_description : String(r.error)
      )
    }
  }
  throw new Error('Sign-in cancelled')
}

export function token(): string | null {
  const stored = loadSettings().githubToken
  if (!stored || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return null
  }
}

export function storeToken(value: string | null): void {
  const settings = loadSettings()
  if (value === null) delete settings.githubToken
  else settings.githubToken = safeStorage.encryptString(value).toString('base64')
  saveSettings(settings)
}

async function request(
  method: string,
  path: string,
  tok: string,
  body?: Record<string, string>
): Promise<unknown> {
  const res = await net.fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: 'application/vnd.github+json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  })
  if (res.status === 401) throw new Error('GitHub no longer accepts the saved sign-in')
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { message?: string }).message
    throw new Error(detail ? `GitHub: ${detail}` : `GitHub answered ${res.status}`)
  }
  return res.status === 204 ? null : res.json()
}

const api = (path: string, tok: string): Promise<unknown> => request('GET', path, tok)

interface PullRequest {
  number: number
  html_url: string
}

// Opens (or reuses) a pull request from head to base and merges it; without a sign-in
// or when GitHub refuses the merge, the caller sends the user to the page instead.
export async function publish(slug: string, head: string, base: string): Promise<PublishResult> {
  const tok = token()
  if (!tok) {
    return {
      url: `https://github.com/${slug}/compare/${base}...${head}?expand=1`,
      merged: false,
      error: 'Galley is not signed in to GitHub'
    }
  }
  const owner = slug.split('/')[0]
  const query = `state=open&base=${encodeURIComponent(base)}&head=${encodeURIComponent(`${owner}:${head}`)}`
  const open = (await api(`/repos/${slug}/pulls?${query}`, tok)) as PullRequest[]
  const pr =
    open[0] ??
    ((await request('POST', `/repos/${slug}/pulls`, tok, {
      title: `Publish ${head} to ${base}`,
      head,
      base,
      body: 'Opened from Galley.'
    })) as PullRequest)
  try {
    await request('PUT', `/repos/${slug}/pulls/${pr.number}/merge`, tok, { merge_method: 'merge' })
    return { url: pr.html_url, merged: true }
  } catch (e) {
    return { url: pr.html_url, merged: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function fetchUser(tok: string): Promise<GitHubUser> {
  const u = (await api('/user', tok)) as {
    login: string
    name: string | null
    email: string | null
  }
  let email = u.email
  if (!email) {
    const emails = (await api('/user/emails', tok).catch(() => [])) as {
      email: string
      primary: boolean
    }[]
    email = emails.find((e) => e.primary)?.email ?? emails[0]?.email ?? null
  }
  return {
    login: u.login,
    name: u.name ?? u.login,
    email: email ?? `${u.login}@users.noreply.github.com`
  }
}
