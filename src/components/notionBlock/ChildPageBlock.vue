<script setup lang="ts">
import { inject, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const router = useRouter()

const isDatabase = props.block.type === 'child_database'
const title = (props.block as { title?: string }).title || 'Untitled'
const icon = (props.block as { icon?: string }).icon ?? null
const defaultIcon = isDatabase ? '🗄️' : '📄'
const childPageId = props.block.id

const readerRootPageId = inject<Ref<string>>('readerRootPageId')
const readerDate = inject<Ref<string>>('readerDate')

function navigateToChild() {
  const root = readerRootPageId?.value ?? ''
  const date = readerDate?.value ?? ''

  if (isDatabase) {
    // Inline databases aren't rendered in the reader yet;
    // fall back to opening in Notion web.
    openInNotion()
    return
  }

  if (!root || !date) return
  router.push({
    name: 'reader',
    params: { pageId: childPageId },
    query: { root, date },
  })
}

function openInNotion() {
  // Notion URL format: https://notion.so/{32-char-id-without-dashes}
  window.open(`https://notion.so/${childPageId.replace(/-/g, '')}`, '_blank')
}
</script>

<template>
  <div
    class="my-3 p-3 rounded-lg flex items-center gap-3 transition-all cursor-pointer hover:shadow-md"
    style="border: 1px solid var(--c-border); background-color: var(--c-bg)"
    @click="navigateToChild"
  >
    <span class="text-xl">{{ icon || defaultIcon }}</span>
    <div>
      <p class="text-sm font-medium" style="color: var(--c-text)">{{ title }}</p>
      <p v-if="isDatabase" class="text-xs mt-0.5" style="color: var(--c-text-tertiary)">数据库</p>
    </div>
    <span class="ml-auto text-xs" style="color: var(--c-text-tertiary)">
      {{ isDatabase ? '🔗' : '→' }}
    </span>
  </div>
</template>
