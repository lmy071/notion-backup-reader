<script setup lang="ts">
import type { NotionBlock, RichText } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const url = (props.block as { url?: string }).url ?? ''
const caption = (props.block as { caption?: RichText[] }).caption ?? []
</script>

<template>
  <div class="my-4">
    <div v-if="url" class="rounded-lg overflow-hidden" style="border: 1px solid var(--c-callout-border)">
      <img :src="url" alt="Notion image" class="w-full block" loading="lazy" />
    </div>
    <div
      v-else
      class="p-4 rounded-lg text-center text-sm"
      style="border: 1px solid var(--c-callout-border); background-color: var(--c-callout-bg); color: var(--c-text-tertiary)"
    >
      Image (no URL)
    </div>
    <p
      v-if="caption.length > 0"
      class="text-sm mt-2 text-center"
      style="color: var(--c-text-tertiary)"
    >{{ caption.map(c => c.plain_text).join('') }}</p>
  </div>
</template>
