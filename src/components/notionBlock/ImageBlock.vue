<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

// parseBlock 已将 URL 提取到 block.url 顶层
const url = (props.block as { url?: string }).url ?? ''
</script>

<template>
  <figure class="my-4">
    <img
      v-if="url"
      :src="url"
      alt=""
      class="max-w-full h-auto rounded-lg"
      loading="lazy"
    />
  </figure>
</template>
