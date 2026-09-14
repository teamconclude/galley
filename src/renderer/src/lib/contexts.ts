import { createContext, useContext } from 'react'
import type { Document } from 'yaml'
import type { ComponentSchema, DataLists } from '../../../shared/types'

// Applies a change to a copy of the frontmatter document and saves the result.
export type EditFn = (change: (doc: Document) => void) => void

export const EditContext = createContext<EditFn>(() => {})

export const useEdit = (): EditFn => useContext(EditContext)

export interface Schemas {
  schemas: Map<string, ComponentSchema>
  standalone: ComponentSchema[]
  lists: DataLists
  images: string[]
  importImage: (dir: string) => Promise<string | null>
}

export const emptyLists: DataLists = { authors: [], categories: [], customercategories: [] }

export const SchemaContext = createContext<Schemas>({
  schemas: new Map(),
  standalone: [],
  lists: emptyLists,
  images: [],
  importImage: async () => null
})

export const useSchemas = (): Schemas => useContext(SchemaContext)
