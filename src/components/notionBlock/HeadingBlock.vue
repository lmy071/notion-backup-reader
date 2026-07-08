<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const richText = (props.block as { rich_text?: unknown[] }).rich_text ?? []
const level = parseInt(props.block.type.replace('heading_', '')) || 1

const tag = `h${level}` as keyof HTMLElementTagNameMap
const sizeMap: Record<number, string> = { 1: 'var(--fs-3xl)', 2: 'var(--fs-2xl)', 3: 'var(--fs-xl)' }
</script>

<template>
  <component
    :is="tag"
    :id="block.id"
    :data-block-id="block.id"
    class="font-bold mt-6 mb-2 scroll-mt-24"
    :style="{ fontSize: sizeMap[level] || 'var(--fs-xl)', color: 'var(--c-text-primary)', scrollMarginTop: '80px' }"
  >
    <RichTextBlock :rich-text="(richText as any)" />
  </component>
</template>
