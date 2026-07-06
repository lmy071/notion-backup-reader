<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

interface VideoData {
  file?: { url: string }
  external?: { url: string }
}

const video = (props.block as { video: VideoData }).video
const url = video?.file?.url || video?.external?.url || ''
</script>

<template>
  <div class="my-4">
    <div v-if="url" class="p-4 rounded-lg border border-gray-200 bg-gray-50">
      <p class="text-sm text-gray-500 mb-2">🎬 Video</p>
      <a :href="url" target="_blank" rel="noopener noreferrer" class="text-blue-600 text-sm break-all hover:underline">
        {{ url }}
      </a>
    </div>
    <div v-else class="p-4 rounded-lg border border-gray-200 bg-gray-50 text-center text-gray-400 text-sm">
      Video (no URL)
    </div>
  </div>
</template>
