<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  width: number
  minWidth?: number
  maxWidth?: number
}>(), {
  minWidth: 200,
  maxWidth: 500,
})

const emit = defineEmits<{
  'update:width': [width: number]
}>()

const isResizing = ref(false)
const startX = ref(0)
const startWidth = ref(0)

function onPointerDown(e: PointerEvent) {
  isResizing.value = true
  startX.value = e.clientX
  startWidth.value = props.width
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onPointerMove(e: PointerEvent) {
  if (!isResizing.value) return
  const delta = e.clientX - startX.value
  const newWidth = Math.min(
    props.maxWidth,
    Math.max(props.minWidth, startWidth.value + delta),
  )
  emit('update:width', Math.round(newWidth))
}

function onPointerUp() {
  cleanup()
}

function cleanup() {
  if (!isResizing.value) return
  isResizing.value = false
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onUnmounted(cleanup)
</script>

<template>
  <div class="flex h-full relative" :style="{ width: `${width}px`, minWidth: `${minWidth}px` }">
    <!-- 内容区域 -->
    <div class="flex-1 overflow-hidden">
      <slot />
    </div>

    <!-- 可拖拽分隔条 -->
    <div
      class="absolute top-0 right-0 w-4px h-full cursor-col-resize z-10 transition-colors"
      :class="isResizing ? 'bg-[var(--c-primary)]' : 'bg-transparent hover:bg-[var(--c-primary-light)]'"
      @pointerdown.prevent="onPointerDown"
    />
  </div>
</template>
