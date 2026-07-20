<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  src: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const scale = ref(1)
const position = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const posStart = ref({ x: 0, y: 0 })

const MIN_SCALE = 0.2
const MAX_SCALE = 10

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value + delta))
  scale.value = newScale
  if (newScale <= 1) {
    position.value = { x: 0, y: 0 }
  }
}

function onMouseDown(e: MouseEvent) {
  if (scale.value <= 1 || e.button !== 0) return
  e.preventDefault()
  isDragging.value = true
  dragStart.value = { x: e.clientX, y: e.clientY }
  posStart.value = { ...position.value }
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  position.value = {
    x: posStart.value.x + (e.clientX - dragStart.value.x),
    y: posStart.value.y + (e.clientY - dragStart.value.y),
  }
}

function onMouseUp() {
  isDragging.value = false
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

function onCloseClick() {
  emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div
    class="image-viewer-backdrop"
    @click="onBackdropClick"
    @wheel="onWheel"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
  >
    <button class="image-viewer-close" @click="onCloseClick" aria-label="关闭">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>

    <div class="image-viewer-controls">
      <button @click="scale = Math.min(MAX_SCALE, +(scale + 0.2).toFixed(1))" title="放大">+</button>
      <span class="image-viewer-zoom-level">{{ Math.round(scale * 100) }}%</span>
      <button @click="scale = Math.max(MIN_SCALE, +(scale - 0.2).toFixed(1)); if (scale <= 1) position = { x: 0, y: 0 }" title="缩小">−</button>
      <button @click="scale = 1; position = { x: 0, y: 0 }" title="重置">1:1</button>
    </div>

    <img
      :src="props.src"
      alt=""
      class="image-viewer-img"
      :style="{
        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
        cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
      }"
      @mousedown="onMouseDown"
      draggable="false"
    />
  </div>
</template>

<style scoped>
.image-viewer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  animation: viewer-fade-in 0.2s ease;
}

.image-viewer-close {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10001;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.image-viewer-close:hover {
  background: rgba(255, 255, 255, 0.24);
}

.image-viewer-controls {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
}

.image-viewer-controls button {
  min-width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
}
.image-viewer-controls button:hover {
  background: rgba(255, 255, 255, 0.22);
}

.image-viewer-zoom-level {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.image-viewer-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
  transition: transform 0.08s ease-out;
  will-change: transform;
}

@keyframes viewer-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
