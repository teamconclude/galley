// Review links open a colleague's branch in Galley: galley://open?branch=…&page=…, or the
// same query on an https page that forwards to it, since chat and GitHub only make https
// links clickable. A link only names things; Galley checks each before acting on it.
export const reviewPage = 'https://conclude.io/galley/open/'

export interface ReviewLink {
  // The GitHub repository, owner/name, when the link names one.
  repo: string | null
  branch: string
  // A page to open, as its path in the checkout, or by its address on the site.
  page: string | null
  url: string | null
}

// Slashes stay readable: branch=buket/pylon rather than buket%2Fpylon.
const param = (name: string, value: string): string =>
  `${name}=${encodeURIComponent(value).replace(/%2F/gi, '/')}`

export function reviewLink(link: Omit<ReviewLink, 'url'>): string {
  const query = [
    link.repo && param('repo', link.repo),
    param('branch', link.branch),
    link.page && param('page', link.page)
  ].filter(Boolean)
  return `${reviewPage}?${query.join('&')}`
}

// What git accepts as a branch name, roughly; git check-ref-format has the last word.
const branchName = /^(?!-)(?!.*\.\.)(?!.*\/\/)[\w.\-/]+(?<![./])$/
const repoName = /^[\w.-]+\/[\w.-]+$/
// A file inside the checkout: no absolute paths, no way up.
const pagePath = /^(?!\/)(?!.*(^|\/)\.\.?(\/|$))[\w.\-/]+\.md$/
const address = /^\/(?!\/)[\w.\-/]*$/

// A page address as Hugo lists it: /compare/pylon becomes /compare/pylon/, files stay.
export const pageAddress = (url: string): string =>
  url.endsWith('/') || /\.[a-z0-9]+$/i.test(url) ? url : url + '/'

// The link's parts, or null for anything that is not a well-formed review link.
export function parseReviewLink(text: string): ReviewLink | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  const fromApp = url.protocol === 'galley:' && url.hostname === 'open'
  const fromPage = `${url.origin}${url.pathname.replace(/\/?$/, '/')}` === reviewPage
  if (!fromApp && !fromPage) return null
  const get = (name: string): string | null => url.searchParams.get(name)?.trim() || null
  const branch = get('branch')
  const repo = get('repo')
  const page = get('page')
  const path = get('url')
  if (!branch || !branchName.test(branch)) return null
  if (repo && !repoName.test(repo)) return null
  if (page && !pagePath.test(page)) return null
  if (path && !address.test(path)) return null
  return { repo, branch, page, url: path }
}
