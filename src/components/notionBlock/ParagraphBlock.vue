<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

// parseBlock 已将 rich_text 提取到顶层
const richText = (props.block as { rich_text?: unknown[] }).rich_text ?? []
</script>

<template>
  <p class="my-1 leading-relaxed text-gray-800">
    <RichTextBlock :rich-text="(richText as any)" />
  </p>
</template>
