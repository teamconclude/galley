import type { SiteInfo } from './types'

// A stock Hugo site with no components, before the checkout has been read.
export const defaultSiteInfo: SiteInfo = {
  name: '',
  contentDir: 'content',
  staticDir: 'static',
  imagesDir: 'static/images',
  imagesUrl: '/images',
  componentsDir: 'components',
  markdownSuffix: null,
  textPreviews: {}
}
