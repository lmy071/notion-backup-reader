<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

function getRichText(): NotionBlock['paragraph'] {
  const type = props.block.type
  if (type === 'paragraph') return (props.block as { paragraph: Record<string, unknown> }).paragraph
  if (type === 'bulleted_list_item') return (props.block as { bulleted_list_item: Record<string, unknown> }).bulleted_list_item
  if (type === 'numbered_list_item') return (props.block as { numbered_list_item: Record<string, unknown> }).numbered_list_item
  if (type === 'to_do') return (props.block as { to_do: Record<string, unknown> }).to_do
  if (type === 'toggle') return (props.block as { toggle: Record<string, unknown> }).toggle
  return null
}

const richText = (getRichText() as { rich_text?: unknown[] })?.rich_text ?? []
</script>

<template>
  <p class="my-1 leading-relaxed text-gray-800">
    <RichTextBlock :rich-text="(richText as any)" />
  </p>
</template>
