<script setup lang="ts">
import type { NotionBlock, RichText } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

// parseBlock 已将 callout 数据提取到顶层
const block = props.block as { rich_text?: RichText[]; color?: string; icon?: string }
const richText = block.rich_text ?? []
const emoji = block.icon ?? ''
const color = block.color ?? 'default'

const bgColorMap: Record<string, string> = {
  default: 'bg-gray-50 border-gray-200',
  gray: 'bg-gray-50 border-gray-200',
  brown: 'bg-amber-50 border-amber-200',
  orange: 'bg-orange-50 border-orange-200',
  yellow: 'bg-yellow-50 border-yellow-200',
  green: 'bg-green-50 border-green-200',
  blue: 'bg-blue-50 border-blue-200',
  purple: 'bg-purple-50 border-purple-200',
  pink: 'bg-pink-50 border-pink-200',
  red: 'bg-red-50 border-red-200',
}
</script>

<template>
  <div :class="bgColorMap[color] || bgColorMap.default" class="flex items-start gap-3 my-4 p-4 rounded-lg border">
    <span v-if="emoji" class="text-xl leading-none pt-0.5">{{ emoji }}</span>
    <div class="flex-1 text-gray-800">
      <RichTextBlock :rich-text="(richText as any)" />
    </div>
  </div>
</template>
