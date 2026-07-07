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
      class="flex items-center gap-2 w-full text-left cursor-pointer"
      style="color: var(--c-text); font-size: var(--fs-base)"
      @click="isOpen = !isOpen"
    >
      <span
        class="text-xs inline-block transition-transform"
        :style="{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }"
      >▶</span>
      <span>
        <RichTextBlock :rich-text="(richText as any)" />
      </span>
    </button>
    <div
      v-if="isOpen"
      class="pl-6 mt-1"
      style="border-left: 2px solid var(--c-border)"
    >
      <slot />
    </div>
  </div>
</template>
