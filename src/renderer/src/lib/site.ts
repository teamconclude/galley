import { useEffect, useState } from 'react'
import type { SiteInfo } from '../../../shared/types'
import { defaultSiteInfo } from '../../../shared/siteInfo'

// What the Hugo config says about the open checkout, refreshed when it changes.
export function useSiteInfo(repoPath: string | null): SiteInfo {
  const [site, setSite] = useState<SiteInfo>(defaultSiteInfo)
  useEffect(() => {
    if (!repoPath) return
    let live = true
    const load = (): void => {
      void window.api.repo.site().then((s) => live && setSite(s))
    }
    load()
    const off = window.api.repo.onChanged((paths) => {
      if (paths.some((p) => /^(config\/|(hugo|config)\.(ya?ml|toml|json)$|data\/)/.test(p))) load()
    })
    return () => {
      live = false
      off()
    }
  }, [repoPath])
  return site
}

// An image's URL path as pages write it, and the repository path behind it.
export const imagePath = (site: SiteInfo, url: string): string =>
  site.imagesDir + url.slice(site.imagesUrl.length)

export const imageUrl = (site: SiteInfo, rel: string): string =>
  site.imagesUrl + rel.slice(site.imagesDir.length)

export const isImageUrl = (site: SiteInfo, url: string): boolean =>
  url.startsWith(site.imagesUrl + '/')

// The folder an image URL lives in, or the images root.
export const imageFolder = (site: SiteInfo, url: string): string =>
  isImageUrl(site, url) ? url.slice(0, url.lastIndexOf('/')) : site.imagesUrl
