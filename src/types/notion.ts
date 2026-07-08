export interface RichText {
  type: 'text' | 'mention' | 'equation'
  plain_text: string
  href: string | null
  /** Annotations are flattened by the parser for ergonomic template access */
  bold: boolean
  italic: boolean
  strikethrough: boolean
  underline: boolean
  code: boolean
  color: string
  content: string
  link: { url: string } | null
  mention?: Record<string, unknown>
  equation?: string
}

export interface NotionBlock {
  id: string
  type: string
  has_children: boolean
  children?: NotionBlock[]
  [key: string]: unknown
}

export interface NotionCover {
  type: 'external' | 'file'
  url: string
}

export interface NotionPage {
  pageId: string
  title: string
  icon: string | null
  cover: NotionCover | null
  properties: Record<string, unknown>
  blocks: NotionBlock[]
}

export interface NotionDatabase {
  databaseId: string
  title: string
  properties: Record<string, unknown>
  rows: NotionDatabaseRow[]
}

export interface NotionDatabaseRow {
  id: string
  properties: Record<string, unknown>
}
