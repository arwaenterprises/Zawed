import type { ReactNode } from 'react'

/**
 * Every tab (Expenses, Documents, Locations, ...) is a self-contained module
 * registered here. To add a new tab later, add one entry to this list.
 */
export interface TabModule {
  id: string
  title: string
  icon: string
  color: string
  blurb: string
  render: () => ReactNode
}

export const tabs: TabModule[] = []

export function registerTab(tab: TabModule) {
  tabs.push(tab)
}
