<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const richText = (props.block as { rich_text?: unknown[] }).rich_text ?? []

const tagLevel: Record<string, string> = {
  heading_1: 'h1',
  heading_2: 'h2',
  heading_3: 'h3',
}

const sizeClass: Record<string, string> = {
  heading_1: 'text-3xl font-bold mt-6 mb-2',
  heading_2: 'text-2xl font-semibold mt-5 mb-2',
  heading_3: 'text-xl font-semibold mt-4 mb-1',
}
</script>

<template>
  <component
    :is="tagLevel[block.type] || 'h2'"
    :class="sizeClass[block.type] || 'text-2xl font-semibold mt-5 mb-2'"
    class="text-gray-900"
  >
    <RichTextBlock :rich-text="(richText as any)" />
  </component>
</template>
