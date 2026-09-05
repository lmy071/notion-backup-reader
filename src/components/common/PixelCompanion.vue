<script setup lang="ts">
import { computed, inject, type ComputedRef } from 'vue'
import companion from '@/assets/images/pixel-reading-cat.png'
import animatedCompanion from '@/assets/images/heading-cat-frames/heading-cat-reading.png'
import stillCompanion from '@/assets/images/heading-cat-frames/heading-cat-reading-still.png'
const props = withDefaults(defineProps<{ animated?: boolean }>(), { animated: false })
const motionEnabled = inject<ComputedRef<boolean>>(
  'catMotionEnabled',
  computed(() => false),
)
const source = computed(() =>
  props.animated ? (motionEnabled.value ? animatedCompanion : stillCompanion) : companion,
)
</script>
<template>
  <img
    :src="source"
    class="pixel-companion"
    :class="{ 'is-frame-animation': animated }"
    alt=""
    aria-hidden="true"
    width="148"
    height="148"
    draggable="false"
  />
</template>
<style scoped>
.pixel-companion.is-frame-animation {
  animation: none !important;
  transform: none;
}
</style>
