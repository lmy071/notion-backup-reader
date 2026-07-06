
<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

// parseBlock 已将 url 提取到顶层
const url = (props.block as { url?: string }).url ?? ''
</script>

<template>
  <div class="my-4">
    <iframe
      v-if="url"
      :src="url"
      class="w-full rounded-lg border border-gray-200"
      style="height: 400px"
      sandbox="allow-scripts allow-same-origin"
      loading="lazy"
    />
    <div v-else class="p-4 rounded-lg border border-gray-200 bg-gray-50 text-center text-gray-400 text-sm">
      Embed (no URL)
    </div>
  </div>
</template>
