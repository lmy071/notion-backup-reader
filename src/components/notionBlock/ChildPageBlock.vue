<script setup lang="ts">
import { inject, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const router = useRouter()

const isDatabase = props.block.type === 'child_database'
const title = (props.block as { title?: string }).title ?? 'Untitled'
const icon = isDatabase ? '🗄️' : '📄'
const label = isDatabase ? 'Database' : 'Page'
const childPageId = props.block.id

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
    class="my-2 p-3 rounded-lg flex items-center gap-3 transition-colors"
    style="border: 1px solid var(--c-border); background-color: var(--c-callout-bg)"
    :class="isDatabase ? 'cursor-default' : 'cursor-pointer'"
    @click="navigateToChild"
  >
    <span class="text-xl">{{ icon }}</span>
    <div>
      <p style="color: var(--c-text)">{{ title }}</p>
      <p class="text-xs" style="color: var(--c-text-tertiary)">Child {{ label }}</p>
    </div>
  </div>
</template>
