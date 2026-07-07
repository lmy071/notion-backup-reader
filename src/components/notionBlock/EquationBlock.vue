<script setup lang="ts">
import { computed } from 'vue'
import katex from 'katex'
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const expression = (props.block as { expression?: string }).expression ?? ''

const renderedHtml = computed(() => {
  if (!expression) return ''
  try {
    return katex.renderToString(expression, {
      throwOnError: false,
      displayMode: true,
      strict: false,
    })
  } catch {
    return `<code class="math-error">${expression}</code>`
  }
})
</script>

<template>
  <div class="my-4 overflow-x-auto">
    <div v-if="expression" v-html="renderedHtml" class="text-center" />
    <div
      v-else
      class="p-4 rounded-lg text-center text-sm"
      style="border: 1px solid var(--c-code-border); background-color: var(--c-code-bg); color: var(--c-text-tertiary)"
    >
      Equation (empty)
    </div>
  </div>
</template>
