<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'
import NotionRenderer from './NotionRenderer.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const columns = (props.block as { children?: NotionBlock[] }).children ?? []
</script>

<template>
  <div class="flex gap-4 my-4">
    <div
      v-for="col in columns"
      :key="col.id"
      class="flex-1 min-w-0"
    >
      <NotionRenderer
        v-if="(col as { children?: NotionBlock[] }).children"
        :blocks="(col as { children?: NotionBlock[] }).children ?? []"
      />
    </div>
  </div>
</template>
