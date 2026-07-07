<script setup lang="ts">
import type { NotionBlock, RichText } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const url = (props.block as { url?: string }).url ?? ''
const caption = (props.block as { caption?: RichText[] }).caption ?? []

function getHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace('www.', '')
  } catch {
    return rawUrl
  }
}
</script>

<template>
  <a
    v-if="url"
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
    class="block my-4 p-4 rounded-lg no-underline transition-colors"
    style="background-color: var(--c-bookmark-bg); border: 1px solid var(--c-bookmark-border)"
  >
    <p v-if="caption.length > 0" class="text-sm font-medium truncate" style="color: var(--c-text)">
      {{ caption.map(c => c.plain_text).join('') }}
    </p>
    <p class="text-xs truncate" style="color: var(--c-text-tertiary); margin-top: var(--s-1)">
      {{ getHostname(url) }}
    </p>
  </a>
  <div
    v-else
    class="my-4 p-4 rounded-lg text-center text-sm"
    style="background-color: var(--c-callout-bg); border: 1px solid var(--c-callout-border); color: var(--c-text-tertiary)"
  >
    Bookmark (no URL)
  </div>
</template>
