import { useEffect, useMemo, useState } from 'react'
import type { ComponentSchema, DataLists, SiteInfo, Snippet } from '../../../shared/types'
import { emptyLists, SchemaContext, type Schemas } from '../lib/contexts'
import { setImagesUrl, setKeys } from '../lib/schema'

interface Props {
  repoPath: string
  site: SiteInfo
  children: React.ReactNode
}

// Loads the component schemas, data pickers and image list from the checkout and keeps
// them current when those files change.
export function SchemaProvider({ repoPath, site, children }: Props): React.JSX.Element {
  const [components, setComponents] = useState<ComponentSchema[]>([])
  const [lists, setLists] = useState<DataLists>(emptyLists)
  const [images, setImages] = useState<string[]>([])
  const [snippets, setSnippets] = useState<Snippet[]>([])

  useEffect(() => {
    let live = true
    setImagesUrl(site.imagesUrl)
    const loadComponents = (): void => {
      void window.api.repo.components().then((lib) => {
        if (!live) return
        setKeys(lib.blockKey, lib.listKey)
        setComponents(lib.components)
      })
    }
    const loadLists = (): void => {
      void window.api.repo.data().then((d) => live && setLists(d))
    }
    const loadSnippets = (): void => {
      void window.api.repo.snippets().then((s) => live && setSnippets(s))
    }
    const loadImages = (): void => {
      void window.api.repo.images().then((i) => live && setImages(i))
    }
    loadComponents()
    loadLists()
    loadSnippets()
    loadImages()
    const off = window.api.repo.onChanged((paths) => {
      if (paths.some((p) => p.startsWith(site.componentsDir + '/'))) loadComponents()
      if (paths.some((p) => p.startsWith('data/'))) loadLists()
      if (paths.some((p) => p.startsWith('layouts/shortcodes/'))) loadSnippets()
      if (paths.some((p) => p.startsWith(site.imagesDir))) loadImages()
    })
    return () => {
      live = false
      off()
    }
  }, [repoPath, site.imagesDir, site.imagesUrl, site.componentsDir])

  const value = useMemo<Schemas>(
    () => ({
      site,
      schemas: new Map(components.map((c) => [c.name, c])),
      standalone: components.filter((c) => c.standalone),
      lists,
      snippets,
      images,
      importImage: async (dir) => {
        const path = await window.api.repo.importImage(dir)
        if (path) setImages(await window.api.repo.images())
        return path
      }
    }),
    [site, components, lists, snippets, images]
  )

  return <SchemaContext.Provider value={value}>{children}</SchemaContext.Provider>
}
