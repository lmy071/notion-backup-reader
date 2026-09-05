<script setup lang="ts">
import { computed, inject, type ComputedRef } from 'vue'
import { catPoses } from '@/data/catPoses'
const props = defineProps<{ pose: number }>()
const motionEnabled = inject<ComputedRef<boolean>>(
  'catMotionEnabled',
  computed(() => false),
)
const images = import.meta.glob<string>('/src/assets/images/cat-frames/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})
const poseIndex = computed(() =>
  Number.isInteger(props.pose) && props.pose >= 0 && props.pose < catPoses.length ? props.pose : 0,
)
const source = computed(() => {
  const name = String(poseIndex.value + 1).padStart(2, '0')
  const suffix = motionEnabled.value ? '' : '-still'
  return images[`/src/assets/images/cat-frames/cat-${name}${suffix}.png`]
})
</script>
<template>
  <img
    :src="source"
    class="pixel-companion cat-pose"
    :data-pose="poseIndex"
    width="192"
    height="192"
    alt=""
    aria-hidden="true"
    draggable="false"
  />
</template>
<style scoped>
/* Animation lives in the PNG frames. CSS motion must not move it a second time. */
.pixel-companion.cat-pose {
  display: block;
  image-rendering: pixelated;
  aspect-ratio: 1;
  object-fit: contain;
  animation: none !important;
  transform: none;
}
</style>
