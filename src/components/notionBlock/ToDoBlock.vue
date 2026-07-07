<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const richText = (props.block as { rich_text?: unknown[] }).rich_text ?? []
const checked = (props.block as { checked?: boolean }).checked ?? false
</script>

<template>
  <div class="flex items-start gap-2 my-1">
    <div
      class="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 cursor-default"
      :style="{
        backgroundColor: checked ? 'var(--c-todo-checked-bg)' : 'transparent',
        borderColor: checked ? 'var(--c-todo-checked-border)' : 'var(--c-todo-border)',
      }"
    >
      <span v-if="checked" style="color: #fff; font-size: 12px">✓</span>
    </div>
    <span
      style="color: var(--c-text)"
      :style="checked ? 'text-decoration: line-through; color: var(--c-text-secondary)' : ''"
    >
      <RichTextBlock :rich-text="(richText as any)" />
    </span>
  </div>
</template>
