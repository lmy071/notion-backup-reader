<script setup lang="ts">
import type { NotionBlock, RichText } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

// parseBlock 已将 code 数据提取到顶层
const block = props.block as { language?: string; rich_text?: RichText[]; caption?: RichText[] }
const language = block.language ?? 'plain text'
const richText = block.rich_text ?? []

function getCodeContent(): string {
  return richText.map((rt) => rt.plain_text).join('')
}
</script>

<template>
  <div class="my-4 rounded-lg overflow-hidden border border-gray-200">
    <div class="flex items-center justify-between px-4 py-2 bg-gray-100 text-gray-500 text-xs font-mono">
      <span>{{ language }}</span>
    </div>
    <pre class="px-4 py-3 bg-gray-50 overflow-x-auto"><code class="text-sm font-mono text-gray-800">{{ getCodeContent() }}</code></pre>
  </div>
</template>
