<script setup lang="ts">
import { computed } from 'vue'
import type { NotionBlock } from '@/types/notion'
import NotionRenderer from './NotionRenderer.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const listType = props.block.type as 'bulleted_list' | 'numbered_list'
const children = (props.block as { children?: NotionBlock[] }).children ?? []

const listTag = computed(() => (listType === 'bulleted_list' ? 'ul' : 'ol'))
</script>

<template>
  <component :is="listTag" class="my-2 pl-5" :style="{ color: 'var(--c-text)' }">
    <li v-for="child in children" :key="child.id">
      <NotionRenderer :blocks="[child]" />
    </li>
  </component>
</template>
