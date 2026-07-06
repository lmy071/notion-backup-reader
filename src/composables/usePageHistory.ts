import { computed, type ComputedRef } from 'vue'
import { useLocalStorage } from './useLocalStorage'

export interface PageHistoryItem {
  id: string
  title: string
  lastSync: string
}

const STORAGE_KEY = 'notion-synced-pages'

export function usePageHistory() {
  const raw = useLocalStorage<PageHistoryItem[]>(STORAGE_KEY, [])

  const items: ComputedRef<PageHistoryItem[]> = computed(() =>
    [...raw.value].sort(
      (a, b) => new Date(b.lastSync).getTime() - new Date(a.lastSync).getTime(),
    ),
  )

  function addOrUpdate(page: { id: string; title: string; lastSync: string }): void {
    const idx = raw.value.findIndex((p) => p.id === page.id)
    if (idx >= 0) {
      raw.value[idx] = { ...raw.value[idx], ...page }
    } else {
      raw.value.push(page)
    }
  }

  function remove(pageId: string): void {
    raw.value = raw.value.filter((p) => p.id !== pageId)
  }

  function clear(): void {
    raw.value = []
  }

  return { items, addOrUpdate, remove, clear }
}
