import { ref, onMounted } from 'vue'
import { storage } from '@/services/storage'
import type { PageSummary } from '@/types/storage'

export function useHomeLogic() {
  const pages = ref<PageSummary[]>([])
  const loading = ref(false)

  async function loadPages() {
    loading.value = true
    try {
      const index = await storage.getIndex()
      pages.value = index.pages
    } catch (e) {
      console.error('Failed to load pages:', e)
    } finally {
      loading.value = false
    }
  }

  onMounted(loadPages)

  return { pages, loading, loadPages }
}
