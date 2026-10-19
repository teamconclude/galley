import { existsSync } from 'fs'
import { basename, dirname, join } from 'path'
import type { Placement, SiteInfo } from '../shared/types'

const documentFile = /\.(docx?|odt|rtf|pages|pdf|xlsx?|numbers|csv|pptx?|key|zip)$/i
const imageFile = /\.(png|jpe?g|gif|webp|svg|avif)$/i
const temporaryFile = /^(\.DS_Store|~\$.*|.*\.tmp|.*~)$/i

// Why a new file looks out of place, in words for editors, or null when it fits.
// The path is relative to the checkout and need not exist yet.
export function placementWarning(root: string, rel: string, site: SiteInfo): string | null {
  const name = basename(rel)
  const inContent = rel.startsWith(site.contentDir + '/')
  const inStatic = rel.startsWith(site.staticDir + '/')
  if (temporaryFile.test(name)) {
    return `${name} is a temporary file made by Finder or Office. It does not belong in the site.`
  }
  if (documentFile.test(name) && !inStatic) {
    return (
      `${name} is a document, and the site cannot use it from here. Keep drafts outside the ` +
      `site; a download for readers goes in the ${site.staticDir} folder.`
    )
  }
  if (/\.(md|markdown)$/i.test(name) && inStatic) {
    return `${name} is a page, and pages go in ${site.contentDir}.`
  }
  const home = imageHome(root, rel, site)
  if (home) {
    return `Pages look for images in the ${site.imagesDir} folder. Put ${name} in ${home} instead.`
  }
  if ((inContent || inStatic) && /[A-Z\s]/.test(name)) {
    return `${name} becomes part of a web address. Use lowercase letters and hyphens, no spaces.`
  }
  return null
}

// What to do with a file dropped at a path: images among the pages go to their section's
// images folder without asking, anything else out of place is asked about.
export function dropPlacement(root: string, rel: string, site: SiteInfo): Placement {
  const home = imageHome(root, rel, site)
  return { warning: home ? null : placementWarning(root, rel, site), home }
}

// Where an image put among the pages belongs: the images folder of its section. A folder
// holding index.md is a page bundle, which keeps its images next to it.
function imageHome(root: string, rel: string, site: SiteInfo): string | null {
  if (!imageFile.test(rel) || !rel.startsWith(site.contentDir + '/')) return null
  if (existsSync(join(root, dirname(rel), 'index.md'))) return null
  const parts = rel.slice(site.contentDir.length + 1).split('/')
  return parts.length > 1 ? `${site.imagesDir}/${parts[0]}` : site.imagesDir
}
