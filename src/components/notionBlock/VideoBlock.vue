<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const url = (props.block as { url?: string }).url ?? ''
</script>

<template>
  <div class="my-4">
    <div
      v-if="url"
      class="p-4 rounded-lg"
      style="border: 1px solid var(--c-callout-border); background-color: var(--c-callout-bg)"
    >
      <p class="text-sm mb-2" style="color: var(--c-text-secondary)">🎬 Video</p>
      <a
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm break-all"
        style="color: var(--c-link)"
      >{{ url }}</a>
    </div>
    <div
      v-else
      class="p-4 rounded-lg text-center text-sm"
      style="background-color: var(--c-callout-bg); border: 1px solid var(--c-callout-border); color: var(--c-text-tertiary)"
    >
      Video (no URL)
    </div>
  </div>
</template>
