import { ref, computed, onMounted } from 'vue'
import { storage, type BatchSummary } from '@/services/storage'
import type { PageSummary } from '@/types/storage'

export interface RootGroup {
  rootPageId: string
  title: string
  availableDates: string[]
  selectedDate: string
  pages: PageSummary[]
  /** The root page card itself (pageId === rootPageId) */
  rootPage: PageSummary | null
}

export function useHomeLogic() {
  const rawBatches = ref<BatchSummary[]>([])
  const loading = ref(false)
  const selectedDates = ref<Record<string, string>>({})

  // 按 rootPageId 分组 → dates 列表
  const allDatesByRoot = computed(() => {
    const map: Record<string, string[]> = {}
    for (const batch of rawBatches.value) {
      if (!map[batch.rootPageId]) map[batch.rootPageId] = []
      if (!map[batch.rootPageId].includes(batch.date)) {
        map[batch.rootPageId].push(batch.date)
      }
    }
    for (const rootId of Object.keys(map)) {
      map[rootId].sort((a, b) => b.localeCompare(a)) // 降序
    }
    return map
  })

  // 根分组标题：取该 rootPageId 最新批次第一个页面标题
  function getRootTitle(rootId: string): string {
    const batches = rawBatches.value
      .filter(b => b.rootPageId === rootId && b.pages.length > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
    return batches[0]?.pages[0]?.title || rootId
  }

  // 最终展示的根分组列表（每个 root 只显示根页面本身一张卡片）
  const roots = computed<RootGroup[]>(() => {
    const datesByRoot = allDatesByRoot.value
    const groups: RootGroup[] = Object.keys(datesByRoot).map(rootId => {
      const availableDates = datesByRoot[rootId]
      const sel = selectedDates.value[rootId] ?? availableDates[0] ?? ''

      const batch = rawBatches.value.find(
        b => b.rootPageId === rootId && b.date === sel,
      )

      const allPages = batch?.pages ?? []

      // 根页面 = pages 中 pageId（去横线后）=== rootPageId 的那条；兜底取第一条
      const rootPage = allPages.find(p => p.pageId.replace(/-/g, '') === rootId) ?? allPages[0] ?? null

      return {
        rootPageId: rootId,
        title: getRootTitle(rootId),
        availableDates,
        selectedDate: sel,
        pages: allPages,
        rootPage,
      }
    })

    // 按最新备份日期降序排序
    groups.sort((a, b) => (b.availableDates[0] ?? '').localeCompare(a.availableDates[0] ?? ''))
    return groups
  })

  function selectDate(rootPageId: string, date: string) {
    selectedDates.value = { ...selectedDates.value, [rootPageId]: date }
  }

  async function loadPages() {
    loading.value = true
    try {
      const index = await storage.getIndex()
      rawBatches.value = index.batches
    } catch (e) {
      console.error('Failed to load pages:', e)
    } finally {
      loading.value = false
    }
  }

  onMounted(loadPages)

  async function removeRoot(rootPageId: string) {
    await storage.remove(rootPageId)
    selectedDates.value = { ...selectedDates.value }
    delete selectedDates.value[rootPageId]
    await loadPages()
  }

  return { roots, loading, loadPages, selectDate, removeRoot }
}
