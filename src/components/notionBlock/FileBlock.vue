<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const fileName = (props.block as { name?: string }).name ?? 'Unnamed file'
const url = (props.block as { url?: string }).url ?? ''
</script>

<template>
  <div class="my-4">
    <div class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
      <span class="text-xl">📎</span>
      <div class="flex-1 min-w-0">
        <p class="font-medium text-gray-800 text-sm truncate">{{ fileName }}</p>
        <template v-if="url">
          <a
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-600 text-xs break-all hover:underline"
          >
            {{ url }}
          </a>
        </template>
      </div>
    </div>
  </div>
</template>
