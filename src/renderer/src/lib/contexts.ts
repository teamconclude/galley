import { createContext, useContext } from 'react'
import type { Document } from 'yaml'
import type { ComponentSchema, DataLists, SiteInfo, Snippet } from '../../../shared/types'
import { defaultSiteInfo } from '../../../shared/siteInfo'

// Applies a change to a copy of the frontmatter document and saves the result.
export type EditFn = (change: (doc: Document) => void) => void

export const EditContext = createContext<EditFn>(() => {})

export const useEdit = (): EditFn => useContext(EditContext)

export interface Schemas {
  site: SiteInfo
  schemas: Map<string, ComponentSchema>
  standalone: ComponentSchema[]
  lists: DataLists
  snippets: Snippet[]
  images: string[]
  // The open page, whose section decides where uploaded pictures go.
  page: string | null
  importImage: (dir: string) => Promise<string | null>
  // Copies dropped pictures into an images folder; returns their addresses.
  importFiles: (files: File[], dir: string) => Promise<string[]>
}

export const emptyLists: DataLists = {}

export const SchemaContext = createContext<Schemas>({
  site: defaultSiteInfo,
  schemas: new Map(),
  standalone: [],
  lists: emptyLists,
  snippets: [],
  images: [],
  page: null,
  importImage: async () => null,
  importFiles: async () => []
})

export const useSchemas = (): Schemas => useContext(SchemaContext)
