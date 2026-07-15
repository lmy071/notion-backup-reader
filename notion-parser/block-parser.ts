import type { RawBlock, RawRichText } from './types'
import type { NotionBlock, NotionBlockType, RichText } from '../src/types/notion'
import { parseRichText } from './rich-text-parser'

/** Simple rich_text extractor helper — unwraps the block's typed data. */
function getRichText(data: { rich_text?: RawRichText[] } | undefined): RichText[] {
  return parseRichText(data?.rich_text ?? [])
}

export function parseBlock(raw: RawBlock): NotionBlock {
  const block: NotionBlock = {
    id: raw.id,
    type: raw.type as NotionBlockType,
    has_children: raw.has_children ?? false,
  }

  switch (raw.type) {
    case 'paragraph':
      block.rich_text = getRichText(raw.paragraph)
      break

    case 'heading_1':
      block.rich_text = getRichText(raw.heading_1)
      break

    case 'heading_2':
      block.rich_text = getRichText(raw.heading_2)
      break

    case 'heading_3':
      block.rich_text = getRichText(raw.heading_3)
      break
    case 'heading_4':
      block.rich_text = getRichText(raw.heading_4)
      break

    case 'bulleted_list_item':
      block.rich_text = getRichText(raw.bulleted_list_item)
      break

    case 'numbered_list_item':
      block.rich_text = getRichText(raw.numbered_list_item)
      break

    case 'toggle':
      block.rich_text = getRichText(raw.toggle)
      break

    case 'quote':
      block.rich_text = getRichText(raw.quote)
      break

    case 'to_do':
      block.rich_text = getRichText(raw.to_do)
      block.checked = raw.to_do?.checked ?? false
      break

    case 'callout':
      block.rich_text = getRichText(raw.callout)
      block.color = raw.callout?.color ?? 'default'
      block.icon = raw.callout?.icon?.emoji ?? null
      break

    case 'code':
      block.rich_text = getRichText(raw.code)
      block.language = raw.code?.language ?? 'plain text'
      block.caption = parseRichText(raw.code?.caption ?? [])
      break

    case 'image': {
      const d = raw.image
      if (d) block.url = d.external?.url ?? d.file?.url ?? ''
      break
    }

    case 'video': {
      const d = raw.video
      if (d) block.url = d.external?.url ?? d.file?.url ?? ''
      break
    }

    case 'file': {
      const d = raw.file
      if (d) {
        block.url = d.external?.url ?? d.file?.url ?? ''
        block.name = d.name ?? ''
      }
      break
    }

    case 'bookmark': {
      const d = raw.bookmark
      if (d) block.url = d.url ?? ''
      break
    }

    case 'link_preview': {
      const d = raw.link_preview
      if (d) block.url = d.url ?? ''
      break
    }

    case 'embed': {
      const d = raw.embed
      if (d) block.url = d.url ?? ''
      break
    }

    case 'equation': {
      const d = raw.equation
      if (d) block.expression = d.expression ?? ''
      break
    }

    case 'table': {
      const d = raw.table
      if (d) {
        block.table_width = d.table_width ?? 0
        block.has_column_header = d.has_column_header ?? false
        block.has_row_header = d.has_row_header ?? false
        block.children = parseBlocks(d.children ?? [])
      }
      break
    }

    case 'table_row': {
      const d = raw.table_row
      if (d) {
        block.cells = (d.cells ?? []).map((cellGroup) => parseRichText(cellGroup))
      }
      break
    }

    case 'child_page': {
      const d = raw.child_page
      if (d) block.title = d.title ?? ''
      break
    }

    case 'child_database': {
      const d = raw.child_database
      if (d) block.title = d.title ?? ''
      break
    }

    // divider, table_of_contents, column_list, column — no extra data
    default:
      break
  }

  // 递归解析嵌套子块（toggle/column_list 等由 Vite 中间件的 fetchNestedChildren 预先拉取）
  if (raw.children && raw.children.length > 0) {
    block.children = parseBlocks(raw.children)
  }

  return block
}

export function parseBlocks(rawBlocks: RawBlock[]): NotionBlock[] {
  if (!rawBlocks || !Array.isArray(rawBlocks)) return []

  const parsed = rawBlocks.map(parseBlock)
  return mergeListItems(parsed)
}

function mergeListItems(blocks: NotionBlock[]): NotionBlock[] {
  const result: NotionBlock[] = []
  let i = 0

  while (i < blocks.length) {
    const block = blocks[i]

    if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
      const listType = block.type === 'bulleted_list_item' ? 'bulleted_list' as const : 'numbered_list' as const
      const groupId = `list-${i}`
      const children: NotionBlock[] = []

      while (i < blocks.length && blocks[i].type === (listType === 'bulleted_list' ? 'bulleted_list_item' : 'numbered_list_item')) {
        children.push(blocks[i])
        i++
      }

      result.push({
        id: groupId,
        type: listType,
        has_children: true,
        children,
      })
    } else {
      result.push(block)
      i++
    }
  }

  return result
}
