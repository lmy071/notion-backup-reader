<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const richText = (props.block as { rich_text?: unknown[] }).rich_text ?? []
</script>

<template>
  <p class="my-1 leading-relaxed" style="color: var(--c-text)">
    <RichTextBlock :rich-text="(richText as any)" />
  </p>
</template>
