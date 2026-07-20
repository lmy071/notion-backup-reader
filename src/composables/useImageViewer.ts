import { ref } from 'vue'

const visible = ref(false)
const src = ref('')

export function useImageViewer() {
  function open(url: string) {
    src.value = url
    visible.value = true
  }

  function close() {
    visible.value = false
    src.value = ''
  }

  return {
    visible,
    src,
    open,
    close,
  }
}
