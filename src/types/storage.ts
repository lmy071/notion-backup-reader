export interface GlobalIndex {
  version: number
  updatedAt: string
  pages: PageSummary[]
}

export interface PageSummary {
  pageId: string
  rootPageId: string
  title: string
  icon: string | null
  coverUrl: string | null
  lastSync: string
  childCount: number
  blockCount: number
}

export interface SyncMeta {
  pageId: string
  rootPageId: string
  title: string
  syncedAt: string
  blockCount: number
  childPages: string[]
  databases: string[]
  errors: string[]
}

export interface SyncResult {
  page: import('./notion').NotionPage
  children: Record<string, import('./notion').NotionPage>
  databases: Record<string, import('./notion').NotionDatabase>
}
