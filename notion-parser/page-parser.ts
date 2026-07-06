import type { RawBlock, RawPage } from './types'
import type { NotionPage } from '../src/types/notion'
import { parseBlocks } from './block-parser'

/**
 * Extract a plain-text title from a page's properties.
 * Notion page title is typically stored under a 'title' property
 * as an array of rich text objects.
 */
function extractTitle(properties: Record<string, unknown>): string {
  const titleProp = properties['title'] ?? properties['Name'] ?? properties['name']
  if (titleProp && typeof titleProp === 'object') {
    const obj = titleProp as Record<string, unknown>
    // Standalone title shape: { title: [{ plain_text: '...' }, ...] }
    if (Array.isArray(obj['title'])) {
      return obj['title']
        .map((t: { plain_text?: string } | string) =>
          typeof t === 'string' ? t : (t?.plain_text ?? '')
        )
        .join('')
    }
    // Fallback: { plain_text: '...' }
    if (typeof obj['plain_text'] === 'string') {
      return obj['plain_text']
    }
  }
  return ''
}

/**
 * Extract an icon from a page. Returns an emoji string if emoji icon,
 * or a URL string if external/file icon, or null.
 */
function extractIcon(rawPage: RawPage): string | null {
  const icon = rawPage.icon
  if (!icon) return null

  if (icon.type === 'emoji' && icon.emoji) {
    return icon.emoji
  }
  if (icon.type === 'external' && icon.external?.url) {
    return icon.external.url
  }
  if (icon.type === 'file' && icon.file?.url) {
    return icon.file.url
  }
  return null
}

/**
 * Extract a cover from a page, or null.
 */
function extractCover(rawPage: RawPage): { type: 'external' | 'file'; url: string } | null {
  const cover = rawPage.cover
  if (!cover) return null

  if (cover.type === 'external' && cover.external?.url) {
    return { type: 'external', url: cover.external.url }
  }
  if (cover.type === 'file' && cover.file?.url) {
    return { type: 'file', url: cover.file.url }
  }
  return null
}

/**
 * Parse a raw page + its raw blocks into a NotionPage.
 */
export function parsePage(rawPage: RawPage, rawBlocks: RawBlock[]): NotionPage {
  return {
    pageId: rawPage.id,
    title: extractTitle(rawPage.properties),
    icon: extractIcon(rawPage),
    cover: extractCover(rawPage),
    properties: rawPage.properties,
    blocks: parseBlocks(rawBlocks),
  }
}
