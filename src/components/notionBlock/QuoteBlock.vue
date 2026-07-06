<script setup lang="ts">
import type { NotionBlock, RichText } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const richText = (props.block as { rich_text?: RichText[] }).rich_text ?? []
</script>

<template>
  <blockquote class="my-4 pl-4 border-l-4 border-gray-300 text-gray-600 italic">
    <RichTextBlock :rich-text="(richText as any)" />
  </blockquote>
</template>
