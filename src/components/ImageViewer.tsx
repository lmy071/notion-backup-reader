import { ref, defineComponent, onMounted, onUnmounted } from 'vue'

export default defineComponent({
  props: {
    src: { type: String, required: true },
  },
  emits: ['close'],
  setup(props, { emit }) {
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

    function zoomIn() {
      scale.value = Math.min(MAX_SCALE, +(scale.value + 0.2).toFixed(1))
    }

    function zoomOut() {
      scale.value = Math.max(MIN_SCALE, +(scale.value - 0.2).toFixed(1))
      if (scale.value <= 1) position.value = { x: 0, y: 0 }
    }

    function reset() {
      scale.value = 1
      position.value = { x: 0, y: 0 }
    }

    onMounted(() => {
      document.addEventListener('keydown', onKeydown)
      document.body.style.overflow = 'hidden'
    })

    onUnmounted(() => {
      document.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
    })

    return () => (
      <div
        class="image-viewer-backdrop"
        onClick={onBackdropClick}
        onWheel={onWheel}
        onMousemove={onMouseMove}
        onMouseup={onMouseUp}
        onMouseleave={onMouseUp}
      >
        <button class="image-viewer-close" onClick={() => emit('close')} aria-label="关闭">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div class="image-viewer-controls">
          <button onClick={zoomIn} title="放大">+</button>
          <span class="image-viewer-zoom-level">{Math.round(scale.value * 100)}%</span>
          <button onClick={zoomOut} title="缩小">−</button>
          <button onClick={reset} title="重置">1:1</button>
        </div>

        <img
          src={props.src}
          alt=""
          class="image-viewer-img"
          style={{
            transform: `translate(${position.value.x}px, ${position.value.y}px) scale(${scale.value})`,
            cursor: scale.value > 1 ? (isDragging.value ? 'grabbing' : 'grab') : 'default',
          }}
          onMousedown={onMouseDown}
          draggable={false}
        />
      </div>
    )
  },
})
