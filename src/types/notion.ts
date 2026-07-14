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

export interface RawDatabaseProperties {
  [columnName: string]: DatabasePropertyConfig
}

export interface DatabasePropertyConfig {
  id: string
  name: string
  type: string
  [key: string]: unknown
}

export interface NotionDatabase {
  id: string
  title: string
  properties: RawDatabaseProperties
  rows: NotionDatabaseRow[]
}

export interface NotionDatabaseRow {
  id: string
  properties: Record<string, DatabasePropertyValue>
}

export interface DatabasePropertyValue {
  type: string
  title?: Array<{ plain_text: string }>
  rich_text?: Array<{ plain_text: string }>
  select?: { name: string; color?: string }
  multi_select?: Array<{ name: string; color?: string }>
  date?: { start: string; end?: string }
  number?: number
  checkbox?: boolean
  url?: string
  email?: string
  phone_number?: string
  status?: { name: string; color?: string }
  formula?: { type: string; string?: string; number?: number; boolean?: boolean }
  people?: Array<{ name?: string; person?: { email?: string } }>
  files?: Array<{ name: string; type: string; external?: { url: string }; file?: { url: string } }>
  created_time?: string
  last_edited_time?: string
  [key: string]: unknown
}
