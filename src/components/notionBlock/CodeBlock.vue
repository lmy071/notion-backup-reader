<script setup lang="ts">
import { ref } from 'vue'
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const language = (props.block as { language?: string }).language ?? 'plain text'
const copied = ref(false)

function getCodeContent(): string {
  const richText = (props.block as { rich_text?: Array<{ plain_text?: string }> }).rich_text ?? []
  return richText.map(rt => rt.plain_text ?? '').join('')
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(getCodeContent())
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // Fallback
    const textarea = document.createElement('textarea')
    textarea.value = getCodeContent()
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
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
      <button
        class="text-xs cursor-pointer border-none bg-transparent"
        style="color: var(--c-text-secondary)"
        @click="copyCode"
      >
        {{ copied ? '✅ Copied' : '📋 Copy' }}
      </button>
    </div>
    <pre
      class="px-4 py-3 overflow-x-auto"
      style="background-color: var(--c-code-bg)"
    ><code class="text-sm font-mono" style="color: var(--c-text)">{{ getCodeContent() }}</code></pre>
  </div>
</template>
