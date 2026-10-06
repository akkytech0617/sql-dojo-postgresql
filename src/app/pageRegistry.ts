import type { ComponentType } from 'react'
export interface PageDefinition { id: string; label: string; component: ComponentType; order?: number }
const modules = import.meta.glob<{ page?: PageDefinition }>('../pages/*.tsx', { eager: true })
export const pageRegistry: PageDefinition[] = Object.values(modules).flatMap(module => module.page ? [module.page] : [])
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id))
