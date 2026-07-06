<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'
import NotionRenderer from './NotionRenderer.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const children = props.block.children ?? []
</script>

<template>
  <div class="flex gap-4 my-4">
    <div
      v-for="column in children"
      :key="column.id"
      class="flex-1 min-w-0"
    >
      <NotionRenderer :blocks="column.children ?? []" />
    </div>
  </div>
</template>
