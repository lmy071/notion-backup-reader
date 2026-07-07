<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const fileName = (props.block as { name?: string }).name ?? 'Unnamed file'
const fileUrl = (props.block as { url?: string }).url ?? ''

function handleClick() {
  if (fileUrl) {
    window.open(fileUrl, '_blank', 'noopener,noreferrer')
  }
}
</script>

<template>
  <div class="my-4">
    <div
      class="flex items-center gap-3 p-3 rounded-lg"
      :class="fileUrl ? 'cursor-pointer' : ''"
      style="border: 1px solid var(--c-file-border); background-color: var(--c-file-bg)"
      :title="fileUrl ? '点击下载' : '下载链接不可用（需重新同步）'"
      @click="handleClick"
    >
      <span class="text-xl">{{ fileUrl ? '📎' : '📁' }}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm truncate" style="color: var(--c-text)">{{ fileName }}</p>
        <template v-if="fileUrl">
          <span class="text-xs break-all" style="color: var(--c-file-download)">{{ fileUrl }}</span>
        </template>
        <template v-else>
          <span class="text-xs" style="color: var(--c-text-tertiary)">下载链接不可用，请重新同步此页面</span>
        </template>
      </div>
      <span v-if="fileUrl" class="text-sm shrink-0" style="color: var(--c-link)">↓</span>
    </div>
  </div>
</template>
