<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

defineProps<{
  block: NotionBlock
}>()
</script>

<template>
  <div class="my-1 py-1 flex items-center gap-1.5 text-xs" style="color: var(--c-text-tertiary)">
    <span class="opacity-50">⊘</span>
    <span>
      暂不支持此块类型：
      <code class="text-xs" style="color: var(--c-text-tertiary)">{{ block.type }}</code>
    </span>
  </div>
</template>
