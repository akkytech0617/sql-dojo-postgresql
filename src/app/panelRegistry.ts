import type { ComponentType } from 'react'
import type { Step } from '../shared/lessons'
export interface PanelProps { step?: Step }
export interface PanelDefinition {
  id: string
  label: string
  component: ComponentType<PanelProps>
  showOn?: (step?: Step) => boolean
  order?: number
}
const modules = import.meta.glob<{ panel?: PanelDefinition }>('../panels/*.tsx', { eager: true })
export const panelRegistry: PanelDefinition[] = Object.values(modules).flatMap(module => module.panel ? [module.panel] : [])
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id))
