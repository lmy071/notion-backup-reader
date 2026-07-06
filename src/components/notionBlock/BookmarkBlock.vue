<script setup lang="ts">
import type { NotionBlock, RichText } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

// parseBlock 已将 url 提取到顶层，但 caption 未保留
const block = props.block as { url?: string; caption?: RichText[] }
const url = block.url ?? ''
const caption = block.caption ?? []

function getHostname(u: string): string {
  try {
    return new URL(u).hostname
  } catch {
    return u
  }
}
</script>

<template>
  <a
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
    class="block my-4 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-colors no-underline"
  >
    <div class="flex items-center gap-3">
      <span class="text-lg">🔗</span>
      <div class="flex-1 min-w-0">
        <p v-if="caption.length > 0" class="text-sm text-gray-700 font-medium truncate">
          <RichTextBlock :rich-text="(caption as any)" />
        </p>
        <p class="text-xs text-gray-400 truncate">{{ getHostname(url) }}</p>
      </div>
    </div>
  </a>
</template>
