<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const url = (props.block as { url?: string }).url ?? ''
</script>

<template>
  <div class="my-4">
    <iframe
      v-if="url"
      :src="url"
      class="w-full rounded-lg"
      style="border: 1px solid var(--c-embed-border); height: 400px"
      allowfullscreen
    />
    <div
      v-else
      class="p-4 rounded-lg text-center text-sm"
      style="background-color: var(--c-embed-bg); border: 1px solid var(--c-embed-border); color: var(--c-text-tertiary)"
    >
      Embed (no URL)
    </div>
  </div>
</template>
