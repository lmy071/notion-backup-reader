import { computed, type ComputedRef } from 'vue'
import { useLocalStorage } from './useLocalStorage'
import { storage } from '@/services/storage'

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

  /** 清理 localStorage 中不属于根页面的子页面条目 */
  async function cleanupStaleEntries(): Promise<void> {
    if (raw.value.length === 0) return
    try {
      const index = await storage.getIndex()
      const rootIds = new Set(index.batches.map(b => b.rootPageId))
      const before = raw.value.length
      raw.value = raw.value.filter(p => rootIds.has(p.id))
      if (raw.value.length < before) {
        console.log(`[history] cleaned ${before - raw.value.length} stale child-page entries`)
      }
    } catch {
      // ignore — index may not be available
    }
  }

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

  return { items, addOrUpdate, remove, clear, cleanupStaleEntries }
}
