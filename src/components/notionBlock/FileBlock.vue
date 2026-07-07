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
      class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50"
      :class="fileUrl ? 'cursor-pointer hover:bg-gray-100' : 'opacity-60'"
      :title="fileUrl ? '点击下载' : '下载链接不可用（需重新同步）'"
      @click="handleClick"
    >
      <span class="text-xl">{{ fileUrl ? '📎' : '📁' }}</span>
      <div class="flex-1 min-w-0">
        <p class="font-medium text-gray-800 text-sm truncate">{{ fileName }}</p>
        <template v-if="fileUrl">
          <span class="text-blue-600 text-xs break-all hover:underline">{{ fileUrl }}</span>
        </template>
        <template v-else>
          <span class="text-gray-400 text-xs">下载链接不可用，请重新同步此页面</span>
        </template>
      </div>
      <span v-if="fileUrl" class="text-blue-500 text-sm shrink-0">↓</span>
    </div>
  </div>
</template>
