export interface RawBlock {
  id: string
  type: string
  has_children: boolean
  children?: RawBlock[]
  paragraph?: { rich_text: RawRichText[] }
  heading_1?: { rich_text: RawRichText[] }
  heading_2?: { rich_text: RawRichText[] }
  heading_3?: { rich_text: RawRichText[] }
  heading_4?: { rich_text: RawRichText[] }
  bulleted_list_item?: { rich_text: RawRichText[] }
  numbered_list_item?: { rich_text: RawRichText[] }
  to_do?: { rich_text: RawRichText[]; checked: boolean }
  toggle?: { rich_text: RawRichText[] }
  quote?: { rich_text: RawRichText[] }
  callout?: { rich_text: RawRichText[]; icon: { emoji: string } | null; color: string }
  code?: { rich_text: RawRichText[]; language: string; caption: RawRichText[] }
  image?: { type: string; external?: { url: string }; file?: { url: string }; caption: RawRichText[] }
  video?: { type: string; external?: { url: string }; file?: { url: string } }
  file?: { type: string; external?: { url: string }; file?: { url: string }; name: string }
  bookmark?: { url: string; caption: RawRichText[] }
  embed?: { url: string }
  equation?: { expression: string }
  divider?: Record<string, never>
  table_of_contents?: { color: string }
  column_list?: Record<string, never>
  column?: Record<string, never>
  table?: { table_width: number; has_column_header: boolean; has_row_header: boolean; children: RawBlock[] }
  table_row?: { cells: RawRichText[][] }
  child_page?: { title: string }
  child_database?: { title: string }
  link_preview?: { url: string }
}

export interface RawRichText {
  type: string
  plain_text: string
  href?: string | null
  annotations?: { bold: boolean; italic: boolean; strikethrough: boolean; underline: boolean; code: boolean; color: string }
  text?: { content: string; link?: { url: string } | null }
  mention?: Record<string, unknown>
  equation?: { expression: string }
}

export interface RawPage {
  id: string
  properties: Record<string, unknown>
  icon?: { type: string; emoji?: string; external?: { url: string }; file?: { url: string } } | null
  cover?: { type: string; external?: { url: string }; file?: { url: string } } | null
}
