<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const expression = (props.block as { expression?: string }).expression ?? ''
</script>

<template>
  <div
    class="my-4 overflow-x-auto rounded p-3"
    style="border: 1px solid var(--c-code-border); background-color: var(--c-code-bg)"
  >
    <div class="mb-1">
      <span class="text-xs font-mono" style="color: var(--c-text-tertiary)">KaTeX</span>
    </div>
    <code class="text-sm font-mono" style="color: var(--c-text)">{{ expression }}</code>
  </div>
</template>
