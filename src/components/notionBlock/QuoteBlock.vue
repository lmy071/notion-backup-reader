<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const richText = (props.block as { rich_text?: unknown[] }).rich_text ?? []
</script>

<template>
  <blockquote
    class="my-4 pl-4 italic"
    style="border-left: 4px solid var(--c-quote-border); color: var(--c-quote-text)"
  >
    <RichTextBlock :rich-text="(richText as any)" />
  </blockquote>
</template>
