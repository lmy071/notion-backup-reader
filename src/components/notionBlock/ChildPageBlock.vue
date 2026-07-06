<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const isDatabase = props.block.type === 'child_database'
const childPage = (props.block as { child_page?: { title: string } }).child_page
const childDatabase = (props.block as { child_database?: { title: string } }).child_database
const data = childPage || childDatabase
const title = data?.title ?? 'Untitled'
const icon = isDatabase ? '🗄️' : '📄'
const label = isDatabase ? 'Database' : 'Page'
</script>

<template>
  <div class="my-2 p-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center gap-3 hover:bg-gray-100 cursor-pointer transition-colors">
    <span class="text-xl">{{ icon }}</span>
    <div>
      <p class="font-medium text-gray-800">{{ title }}</p>
      <p class="text-xs text-gray-400">Child {{ label }}</p>
    </div>
  </div>
</template>
