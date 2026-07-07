<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const router = useRouter()

const isDatabase = props.block.type === 'child_database'
// parseBlock 已将 title 提取到顶层，block.id 即是 Notion page_id
const title = (props.block as { title?: string }).title ?? 'Untitled'
const icon = isDatabase ? '🗄️' : '📄'
const label = isDatabase ? 'Database' : 'Page'
const childPageId = props.block.id

// 从 ReaderView 通过 provide 注入的参数
import { inject, type Ref } from 'vue'
const readerRootPageId = inject<Ref<string>>('readerRootPageId')
const readerDate = inject<Ref<string>>('readerDate')

function navigateToChild() {
  const root = readerRootPageId?.value ?? ''
  const date = readerDate?.value ?? ''
  if (isDatabase || !root || !date) return
  router.push({
    name: 'reader',
    params: { pageId: childPageId },
    query: { root, date },
  })
}
</script>

<template>
  <div
    class="my-2 p-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center gap-3 transition-colors"
    :class="isDatabase ? 'cursor-default' : 'hover:bg-gray-100 cursor-pointer'"
    @click="navigateToChild"
  >
    <span class="text-xl">{{ icon }}</span>
    <div>
      <p class="font-medium text-gray-800">{{ title }}</p>
      <p class="text-xs text-gray-400">Child {{ label }}</p>
    </div>
  </div>
</template>
