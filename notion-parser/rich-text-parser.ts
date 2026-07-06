import type { RawRichText } from './types'
import type { RichText } from '../src/types/notion'

export function parseRichText(raw: RawRichText[]): RichText[] {
  if (!raw || !Array.isArray(raw)) return []

  return raw.map((item) => {
    const annotations = item.annotations ?? {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default',
    }

    return {
      type: item.type ?? 'text',
      plain_text: item.plain_text ?? '',
      href: item.href ?? null,
      bold: annotations.bold ?? false,
      italic: annotations.italic ?? false,
      strikethrough: annotations.strikethrough ?? false,
      underline: annotations.underline ?? false,
      code: annotations.code ?? false,
      color: annotations.color ?? 'default',
      content: item.text?.content ?? item.plain_text ?? '',
      link: item.text?.link ?? null,
      mention: item.mention ?? null,
      equation: item.equation?.expression ?? null,
    }
  })
}
