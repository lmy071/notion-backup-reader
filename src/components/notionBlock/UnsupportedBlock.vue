<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

defineProps<{
  block: NotionBlock
}>()
</script>

<template>
  <div
    class="my-2 p-3 rounded-lg flex items-center gap-2"
    style="background-color: var(--c-unsupported-bg); border: 1px solid var(--c-unsupported-border)"
  >
    <span style="color: var(--c-warning)">⚠️</span>
    <span class="text-sm" style="color: var(--c-unsupported-text)">
      Unsupported block type:
      <code
        class="px-1 py-0.5 rounded text-xs font-mono"
        style="background-color: var(--c-unsupported-border); color: var(--c-unsupported-text)"
      >{{ block.type }}</code>
    </span>
  </div>
</template>
