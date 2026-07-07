<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const richText = (props.block as { rich_text?: unknown[] }).rich_text ?? []
const icon = (props.block as { icon?: string }).icon ?? '💡'
const color = (props.block as { color?: string }).color ?? 'default'
</script>

<template>
  <div
    class="my-4 p-4 rounded-lg flex gap-3"
    style="background-color: var(--c-callout-bg); border: 1px solid var(--c-callout-border)"
  >
    <span class="text-xl shrink-0 mt-0.5">{{ icon }}</span>
    <div class="flex-1" style="color: var(--c-text)">
      <RichTextBlock :rich-text="(richText as any)" />
    </div>
  </div>
</template>
