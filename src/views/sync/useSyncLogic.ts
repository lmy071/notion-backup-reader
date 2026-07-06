import { ref, computed } from 'vue'
import { usePageHistory, type PageHistoryItem } from '@/composables/usePageHistory'
// import { sync } from '@/services/sync' — import when sync service is ready

export function useSyncLogic() {
  const inputText = ref('')
  const selectedIds = ref<Set<string>>(new Set())
  const isSyncing = ref(false)
  const overallProgress = ref(0)
  const logMessages = ref<string[]>([])
  const { items: historyList, addOrUpdate } = usePageHistory()

  const parsedIds = computed(() => {
    return inputText.value
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
  })

  function toggleSelectId(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  function selectAllHistory() {
    selectedIds.value = new Set(historyList.value.map(h => h.id))
  }

  function clearSelection() {
    selectedIds.value = new Set()
  }

  function addLog(msg: string) {
    logMessages.value.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
  }

  function removeHistory(id: string) {
    // delegating to usePageHistory later
  }

  function parseInputIds(): string[] {
    return parsedIds.value
  }

  async function startBatchSync() {
    const allIds = [...new Set([...selectedIds.value, ...parsedIds.value])]
    if (allIds.length === 0) return

    isSyncing.value = true
    overallProgress.value = 0
    logMessages.value = []

    addLog(`开始批量同步 ${allIds.length} 个页面...`)
    // TODO: integrate sync.syncPages(allIds) with concurrency control
    // For now: placeholder
    addLog('同步服务尚未连接，请先完成 Phase 2-3')

    isSyncing.value = false
  }

  function pauseSync() { /* placeholder */ }
  function resumeSync() { /* placeholder */ }
  function cancelSync() { isSyncing.value = false }

  return {
    inputText,
    selectedIds,
    historyList,
    isSyncing,
    overallProgress,
    logMessages,
    parsedIds,
    toggleSelectId,
    selectAllHistory,
    clearSelection,
    addLog,
    removeHistory,
    parseInputIds,
    startBatchSync,
    pauseSync,
    resumeSync,
    cancelSync,
  }
}
