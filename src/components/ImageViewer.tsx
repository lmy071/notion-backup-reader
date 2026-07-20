import { ref, defineComponent, onMounted, onUnmounted } from 'vue'
import './ImageViewer.css'

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
    const hasMoved = ref(false)
    const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null)
    const isLongPress = ref(false)

    const MIN_SCALE = 0.2
    const MAX_SCALE = 10
    const LONG_PRESS_MS = 300
    const MOVE_THRESHOLD = 3

    function cancelLongPress() {
      if (longPressTimer.value) {
        clearTimeout(longPressTimer.value)
        longPressTimer.value = null
      }
    }

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
      // Only activate drag when zoomed in
      if (scale.value <= 1) return
      if (e.button !== 0) return
      e.preventDefault()

      const startX = e.clientX
      const startY = e.clientY
      dragStart.value = { x: startX, y: startY }
      posStart.value = { ...position.value }
      hasMoved.value = false

      // Start long-press timer: activate drag after hold
      longPressTimer.value = setTimeout(() => {
        isLongPress.value = true
        isDragging.value = true
      }, LONG_PRESS_MS)
    }

    function onMouseMove(e: MouseEvent) {
      const dx = e.clientX - dragStart.value.x
      const dy = e.clientY - dragStart.value.y

      // Track if mouse moved beyond threshold (to distinguish drag from click)
      if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
        hasMoved.value = true
      }

      if (!isDragging.value) return

      position.value = {
        x: posStart.value.x + dx,
        y: posStart.value.y + dy,
      }
    }

    function onMouseUp() {
      cancelLongPress()
      isDragging.value = false
      isLongPress.value = false
    }

    function onBackdropClick(e: MouseEvent) {
      // Don't close if we just finished a drag
      if (hasMoved.value || isLongPress.value) {
        hasMoved.value = false
        return
      }
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
      cancelLongPress()
    })

    return () => (
      <div
        class="image-viewer-backdrop"
        onClick={onBackdropClick}
        onWheel={onWheel}
        onMousedown={onMouseDown}
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
            cursor: scale.value > 1
              ? (isDragging.value ? 'grabbing' : 'grab')
              : 'default',
            transition: isDragging.value ? 'none' : undefined,
          }}
          draggable={false}
        />
      </div>
    )
  },
})
