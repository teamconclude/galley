import { net, safeStorage } from 'electron'
import type { GitHubUser } from '../shared/types'
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

async function api(path: string, tok: string): Promise<unknown> {
  const res = await net.fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json' },
    cache: 'no-store'
  })
  if (res.status === 401) throw new Error('GitHub no longer accepts the saved sign-in')
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  return res.json()
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
