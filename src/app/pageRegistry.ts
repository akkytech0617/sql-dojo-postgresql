import type { ComponentType } from 'react'
import { PlaygroundPage } from '../pages/PlaygroundPage'
export interface PageDefinition { id: string; label: string; component: ComponentType }
export const pageRegistry: PageDefinition[] = [
  { id: 'playground', label: '自由練習', component: PlaygroundPage },
]
