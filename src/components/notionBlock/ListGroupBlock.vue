<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'
import NotionRenderer from './NotionRenderer.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const isOrdered = props.block.type === 'numbered_list'
const children = props.block.children ?? []
</script>

<template>
  <ol v-if="isOrdered" class="my-2 pl-6 list-decimal list-outside space-y-1">
    <li v-for="child in children" :key="child.id">
      <NotionRenderer :blocks="[child]" />
    </li>
  </ol>
  <ul v-else class="my-2 pl-6 list-disc list-outside space-y-1">
    <li v-for="child in children" :key="child.id">
      <NotionRenderer :blocks="[child]" />
    </li>
  </ul>
</template>
