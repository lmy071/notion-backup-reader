<script setup lang="ts">
import CatPose from './CatPose.vue'
import { catPoses } from '@/data/catPoses'
defineProps<{ side: 'left' | 'right'; poses: number[] }>()
</script>

<template>
  <aside class="cat-margin" :class="`cat-margin-${side}`" aria-hidden="true" inert>
    <div
      v-for="(pose, slot) in poses"
      :key="slot"
      :class="
        slot === 1
          ? 'cat-sticker-mini'
          : ['cat-sticker', slot === 0 ? 'cat-sticker-top' : 'cat-sticker-bottom']
      "
    >
      <span v-if="slot !== 1" class="cat-sticker-tape" />
      <span v-else class="cat-sparkle">✦</span>
      <CatPose :pose="pose" />
      <span v-if="slot !== 1" class="cat-caption">{{ catPoses[pose]?.label }}</span>
      <span v-else class="cat-sparkle">＋</span>
    </div>
  </aside>
</template>
