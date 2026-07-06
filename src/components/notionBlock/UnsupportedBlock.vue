<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

defineProps<{
  block: NotionBlock
}>()
</script>

<template>
  <div class="my-2 p-3 rounded-lg border border-yellow-200 bg-yellow-50 flex items-center gap-2">
    <span class="text-yellow-500">⚠️</span>
    <span class="text-sm text-yellow-800">
      Unsupported block type: <code class="px-1 py-0.5 bg-yellow-100 rounded text-xs font-mono">{{ block.type }}</code>
    </span>
  </div>
</template>
