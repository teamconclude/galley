import { existsSync, promises as fs } from 'fs'
import { join } from 'path'
import { parseDocument } from 'yaml'
import { templateRepoUrl, templateTag } from '../shared/site'
import type { Identity } from '../shared/types'
import { clone, run } from './git'

// Makes a new site at dest from the template: its files without its history, the name
// as the site title, and one commit on main. The template URL can be overridden for
// testing a template before it is tagged.
export async function createSite(
  name: string,
  dest: string,
  identity: Identity | null,
  onProgress: (line: string) => void
): Promise<void> {
  if (existsSync(dest)) throw new Error(`${dest} already exists`)
  const url = process.env['GALLEY_TEMPLATE_URL'] || templateRepoUrl
  await clone(url, dest, onProgress, ['--depth', '1', '--branch', templateTag])
  try {
    await fs.rm(join(dest, '.git'), { recursive: true, force: true })
    await setTitle(dest, name)
    onProgress('Making the first commit…')
    await run(dest, ['init', '-b', 'main'])
    if (identity) {
      await run(dest, ['config', 'user.name', identity.name])
      await run(dest, ['config', 'user.email', identity.email])
    }
    await run(dest, ['add', '-A'])
    await run(dest, ['commit', '-q', '-m', 'Start from the Galley template'])
  } catch (e) {
    await fs.rm(dest, { recursive: true, force: true })
    throw e
  }
}

async function setTitle(dest: string, name: string): Promise<void> {
  const file = join(dest, 'hugo.yaml')
  const doc = parseDocument(await fs.readFile(file, 'utf8'))
  doc.set('title', name)
  await fs.writeFile(file, doc.toString())
}
