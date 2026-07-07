<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const language = (props.block as { language?: string }).language ?? 'plain text'

function getCodeContent(): string {
  const richText = (props.block as { rich_text?: Array<{ plain_text?: string }> }).rich_text ?? []
  return richText.map(rt => rt.plain_text ?? '').join('')
}
</script>

<template>
  <div
    class="my-4 rounded-lg overflow-hidden"
    style="border: 1px solid var(--c-code-border)"
  >
    <div
      class="flex items-center justify-between px-4 py-2 text-xs font-mono"
      style="background-color: var(--c-code-header-bg); color: var(--c-text-secondary)"
    >
      <span>{{ language }}</span>
    </div>
    <pre
      class="px-4 py-3 overflow-x-auto"
      style="background-color: var(--c-code-bg)"
    ><code class="text-sm font-mono" style="color: var(--c-text)">{{ getCodeContent() }}</code></pre>
  </div>
</template>
