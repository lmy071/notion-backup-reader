<script setup lang="ts">
import type { NotionBlock, RichText } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

interface ImageData {
  file?: { url: string }
  external?: { url: string }
  caption?: RichText[]
}

const image = (props.block as { image: ImageData }).image
const url = image?.file?.url || image?.external?.url || ''
const caption = image?.caption ?? []
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
    <figcaption v-if="caption.length > 0" class="mt-2 text-center text-sm text-gray-500">
      <RichTextBlock :rich-text="(caption as any)" />
    </figcaption>
  </figure>
</template>
