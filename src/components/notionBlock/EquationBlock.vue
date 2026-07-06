<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const equation = (props.block as { equation: { expression: string } }).equation
const expression = equation?.expression ?? ''
</script>

<template>
  <div class="my-4 overflow-x-auto rounded bg-gray-50 p-3 border border-gray-200">
    <div class="flex items-center justify-between mb-1">
      <span class="text-xs text-gray-400 font-mono">KaTeX</span>
    </div>
    <code class="text-sm font-mono text-gray-700">{{ expression }}</code>
  </div>
</template>
