import { useEffect, useMemo, useState } from 'react'
import type { ComponentSchema, DataLists } from '../../../shared/types'
import { emptyLists, SchemaContext, type Schemas } from '../lib/contexts'

interface Props {
  repoPath: string
  children: React.ReactNode
}

// Loads the component schemas, data pickers and image list from the checkout and keeps
// them current when those files change.
export function SchemaProvider({ repoPath, children }: Props): React.JSX.Element {
  const [components, setComponents] = useState<ComponentSchema[]>([])
  const [lists, setLists] = useState<DataLists>(emptyLists)
  const [images, setImages] = useState<string[]>([])

  useEffect(() => {
    let live = true
    const loadComponents = (): void => {
      void window.api.repo.components().then((c) => live && setComponents(c))
    }
    const loadLists = (): void => {
      void window.api.repo.data().then((d) => live && setLists(d))
    }
    const loadImages = (): void => {
      void window.api.repo.images().then((i) => live && setImages(i))
    }
    loadComponents()
    loadLists()
    loadImages()
    const off = window.api.repo.onChanged((paths) => {
      if (paths.some((p) => p.startsWith('component-library/'))) loadComponents()
      if (paths.some((p) => p.startsWith('data/'))) loadLists()
      if (paths.some((p) => p.startsWith('static/images'))) loadImages()
    })
    return () => {
      live = false
      off()
    }
  }, [repoPath])

  const value = useMemo<Schemas>(
    () => ({
      schemas: new Map(components.map((c) => [c.name, c])),
      standalone: components.filter((c) => c.standalone),
      lists,
      images,
      importImage: async (dir) => {
        const path = await window.api.repo.importImage(dir)
        if (path) setImages(await window.api.repo.images())
        return path
      }
    }),
    [components, lists, images]
  )

  return <SchemaContext.Provider value={value}>{children}</SchemaContext.Provider>
}
