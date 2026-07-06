import { ref, onMounted } from 'vue'
import { storage, type BatchSummary } from '@/services/storage'
import type { PageSummary } from '@/types/storage'

export function useHomeLogic() {
  const batches = ref<BatchSummary[]>([])
  const loading = ref(false)

  async function loadPages() {
    loading.value = true
    try {
      const index = await storage.getIndex()
      batches.value = index.batches
    } catch (e) {
      console.error('Failed to load pages:', e)
    } finally {
      loading.value = false
    }
  }

  onMounted(loadPages)

  return { batches, loading, loadPages }
}
