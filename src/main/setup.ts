import { app, shell } from 'electron'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { defaultCheckoutDir, siteRepoUrl } from '../shared/site'
import type { GitHubUser, SetupStatus, SetupStep, SetupStepId } from '../shared/types'
import { clone, Git } from './git'
import * as github from './github'
import { ensureHugo } from './hugo'
import { log } from './log'
import { Repo } from './repo'
import { loadSettings, saveSettings } from './settings'
import { downloadGit, findClaude, findGit, installClaude } from './tools'

interface Deps {
  openRepo: (path: string) => void
  hasRepo: () => boolean
  restartHugo: () => void
}

const labels: Record<SetupStepId, string> = {
  git: 'git',
  hugo: 'Hugo, the site generator',
  claude: 'Claude Code',
  github: 'GitHub sign-in',
  site: 'The site checkout'
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// Gets a fresh Mac ready: downloads the tools Galley needs, signs the user in to GitHub
// and clones the site. Each step reports its state to the setup dialog.
export class Setup {
  status: SetupStatus = {
    steps: (Object.keys(labels) as SetupStepId[]).map((id) => ({
      id,
      label: labels[id],
      state: 'pending'
    })),
    complete: false,
    githubConfigured: github.clientId !== ''
  }
  private signingIn = false

  constructor(
    private notify: (status: SetupStatus) => void,
    private deps: Deps
  ) {}

  private step(id: SetupStepId): SetupStep {
    return this.status.steps.find((s) => s.id === id)!
  }

  private set(id: SetupStepId, patch: Partial<SetupStep>): void {
    Object.assign(this.step(id), { detail: undefined, percent: undefined }, patch)
    this.status.complete = this.status.steps.every(
      (s) => s.state === 'done' || s.state === 'skipped'
    )
    this.notify(this.status)
  }

  async run(): Promise<void> {
    await this.checkGit()
    await this.checkHugo()
    await this.checkClaude()
    await this.checkGithub()
    this.checkSite()
    log('setup', this.status.complete ? 'complete' : 'incomplete')
  }

  async retry(id: SetupStepId): Promise<void> {
    if (id === 'git') await this.checkGit()
    if (id === 'hugo') await this.checkHugo()
    if (id === 'claude') await this.checkClaude()
    if (id === 'github') await this.checkGithub()
    if (id === 'site') this.checkSite()
  }

  private async checkGit(): Promise<void> {
    if (await findGit()) return this.set('git', { state: 'done' })
    this.set('git', { state: 'running', detail: 'Downloading…' })
    try {
      await downloadGit((percent) => this.set('git', { state: 'running', percent }))
      this.set('git', { state: 'done', detail: 'Downloaded' })
    } catch (e) {
      log('git download failed', message(e))
      this.set('git', { state: 'failed', detail: message(e) })
    }
  }

  private async checkHugo(): Promise<void> {
    try {
      const downloaded = await ensureHugo((percent) =>
        this.set('hugo', { state: 'running', percent })
      )
      this.set('hugo', { state: 'done', detail: downloaded ? 'Downloaded' : undefined })
      if (downloaded) this.deps.restartHugo()
    } catch (e) {
      log('hugo download failed', message(e))
      this.set('hugo', { state: 'failed', detail: message(e) })
    }
  }

  private async checkClaude(): Promise<void> {
    if (await findClaude()) return this.set('claude', { state: 'done' })
    this.set('claude', { state: 'running', detail: 'Installing…' })
    try {
      await installClaude((line) => this.set('claude', { state: 'running', detail: line }))
      this.set('claude', {
        state: 'done',
        detail: 'Installed. Sign in when the Claude pane opens.'
      })
    } catch (e) {
      log('claude install failed', message(e))
      this.set('claude', { state: 'failed', detail: message(e) })
    }
  }

  private async checkGithub(): Promise<void> {
    const tok = github.token()
    if (tok) {
      try {
        this.status.user = await github.fetchUser(tok)
        return this.set('github', {
          state: 'done',
          detail: `Signed in as ${this.status.user.login}`
        })
      } catch (e) {
        github.storeToken(null)
        this.status.user = undefined
        log('github token rejected', message(e))
      }
    }
    if (!github.clientId) {
      return this.set('github', {
        state: 'skipped',
        detail: 'Not configured; git uses its own credentials'
      })
    }
    if (loadSettings().githubSkipped) return this.set('github', { state: 'skipped' })
    this.set('github', { state: 'action', detail: 'Sign in so Galley can fetch and push the site' })
  }

  async signIn(): Promise<void> {
    if (this.signingIn) return
    this.signingIn = true
    try {
      const code = await github.startDeviceFlow()
      this.status.device = { code: code.userCode, url: code.verificationUri }
      this.set('github', { state: 'action', detail: 'Enter the code on github.com' })
      void shell.openExternal(code.verificationUri)
      const tok = await github.waitForToken(code, () => this.signingIn)
      github.storeToken(tok)
      this.status.device = undefined
      const settings = loadSettings()
      delete settings.githubSkipped
      saveSettings(settings)
      await this.checkGithub()
    } catch (e) {
      this.status.device = undefined
      this.set('github', { state: 'failed', detail: message(e) })
    } finally {
      this.signingIn = false
    }
  }

  cancelSignIn(): void {
    this.signingIn = false
  }

  skipGithub(): void {
    this.signingIn = false
    this.status.device = undefined
    saveSettings({ ...loadSettings(), githubSkipped: true })
    this.set('github', { state: 'skipped' })
  }

  signOut(): void {
    github.storeToken(null)
    this.status.user = undefined
    void this.checkGithub()
  }

  defaultCheckout(): string {
    return join(homedir(), defaultCheckoutDir)
  }

  private checkSite(): void {
    if (this.deps.hasRepo()) return this.set('site', { state: 'done' })
    const dest = this.defaultCheckout()
    if (Repo.isSite(dest)) {
      this.deps.openRepo(dest)
      return this.set('site', { state: 'done' })
    }
    this.set('site', {
      state: 'action',
      detail: `Will be placed in ${dest.replace(homedir(), '~')}`
    })
  }

  async cloneSite(dest = this.defaultCheckout()): Promise<void> {
    if (existsSync(dest) && !Repo.isSite(dest)) {
      return this.set('site', { state: 'failed', detail: `${dest} exists and is not the site` })
    }
    this.set('site', { state: 'running', detail: 'Cloning…' })
    try {
      if (!Repo.isSite(dest)) {
        await clone(siteRepoUrl, dest, (line) =>
          this.set('site', { state: 'running', detail: line })
        )
      }
      this.deps.openRepo(dest)
      await this.applyIdentity(dest)
      this.set('site', { state: 'done' })
    } catch (e) {
      log('clone failed', message(e))
      this.set('site', { state: 'failed', detail: message(e) })
    }
  }

  // A fresh checkout gets the GitHub profile as commit identity when none is configured.
  private async applyIdentity(dest: string): Promise<void> {
    const user: GitHubUser | undefined = this.status.user
    if (!user) return
    const git = new Git(dest, () => {})
    const current = await git.identity().catch(() => null)
    if (current && (current.name || current.email)) return
    await git.setIdentity({ name: user.name, email: user.email }).catch(() => {})
  }

  siteOpened(): void {
    if (this.step('site').state !== 'done') this.set('site', { state: 'done' })
  }

  appVersion(): string {
    return app.getVersion()
  }
}
