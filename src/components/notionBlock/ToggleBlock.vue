<script setup lang="ts">
import { ref } from 'vue'
import type { NotionBlock, RichText } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const richText = (props.block as { rich_text?: RichText[] }).rich_text ?? []
const isOpen = ref(false)
</script>

<template>
  <div class="my-1">
    <button
      class="flex items-center gap-2 text-gray-800 hover:text-gray-600 w-full text-left cursor-pointer"
      @click="isOpen = !isOpen"
    >
      <span class="text-xs transition-transform" :class="{ 'rotate-90': isOpen }">▶</span>
      <span class="font-medium">
        <RichTextBlock :rich-text="(richText as any)" />
      </span>
    </button>
    <div v-if="isOpen" class="pl-6 mt-1 border-l-2 border-gray-200">
      <slot />
    </div>
  </div>
</template>
