<script setup lang="ts">
import type { NotionBlock, RichText } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const todoData = (props.block as { to_do: { checked: boolean; rich_text: RichText[] } }).to_do
const checked = todoData?.checked ?? false
const richText = todoData?.rich_text ?? []
</script>

<template>
  <div class="flex items-start gap-2 my-1">
    <div
      :class="checked ? 'bg-blue-500 border-blue-500' : 'border-gray-300'"
      class="mt-0.5 w-4 h-4 flex-shrink-0 rounded border-2 flex items-center justify-center cursor-default"
    >
      <span v-if="checked" class="text-white text-xs leading-none">✓</span>
    </div>
    <span :class="{ 'line-through text-gray-400': checked }" class="text-gray-800">
      <RichTextBlock :rich-text="(richText as any)" />
    </span>
  </div>
</template>
