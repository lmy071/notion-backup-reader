import { ref, computed } from 'vue'
import { usePageHistory } from '@/composables/usePageHistory'
import { sync } from '@/services/sync'
import type { BatchSyncProgress } from '@/services/sync'

export function useSyncLogic() {
  const inputText = ref('')
  const selectedIds = ref<Set<string>>(new Set())
  const isSyncing = ref(false)
  const isPaused = ref(false)
  const overallProgress = ref(0)
  const logMessages = ref<string[]>([])
  const taskMap = ref<Map<string, { title: string; status: string; progress: number }>>(new Map())
  const { items: historyList, addOrUpdate } = usePageHistory()

  /** 从 Notion 页面链接中提取 page ID */
  function extractId(raw: string): string | null {
    const s = raw.trim()
    if (!s) return null

    // URL 格式: https://app.notion.com/p/{32hex}?... 或 https://notion.so/{32hex}?...
    const urlMatch = s.match(/\/(?:pages?\/)?([0-9a-fA-F]{32})(?:[?#]|$)/)
    if (urlMatch) return urlMatch[1]

    // 带横线的 UUID 格式
    const uuidMatch = s.match(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    )
    if (uuidMatch) return uuidMatch[0]

    // 纯 32 位 hex
    const hexMatch = s.match(/^[0-9a-fA-F]{32}$/)
    if (hexMatch) return hexMatch[0]

    return null
  }

  const parsedIds = computed(() => {
    return inputText.value
      .split(/[\n,]+/)
      .map(s => extractId(s))
      .filter((id): id is string => id !== null)
  })

  const allTargetIds = computed(() => {
    return [...new Set([...selectedIds.value, ...parsedIds.value])]
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

  function parseInputIds(): string[] {
    return parsedIds.value
  }

  function handleProgress(progress: BatchSyncProgress) {
    overallProgress.value = progress.overall
    const map = new Map<string, { title: string; status: string; progress: number }>()
    for (const [id, task] of progress.tasks) {
      map.set(id, {
        title: task.title,
        status: task.status,
        progress: task.progress,
      })
      // 只在新状态出现时打印一次日志（避免重复回调导致的冗余日志）
      const prev = taskMap.value.get(id)
      if (task.status !== prev?.status) {
        if (task.status === 'done') {
          addLog(`✅ ${task.title} — 同步完成`)
        } else if (task.status === 'error') {
          addLog(`❌ ${task.title} — ${task.error || '同步失败'}`)
        }
      }
    }
    taskMap.value = map
  }

  async function startBatchSync() {
    const allIds = allTargetIds.value
    if (allIds.length === 0) return

    isSyncing.value = true
    isPaused.value = false
    overallProgress.value = 0
    logMessages.value = []
    taskMap.value = new Map()

    addLog(`开始批量同步 ${allIds.length} 个页面...`)

    try {
      await sync.syncPages(allIds, handleProgress)
      addLog('全部同步任务完成')
    } catch (e) {
      addLog(`同步中断: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      isSyncing.value = false
      isPaused.value = false
    }
  }

  function pauseSync() {
    isPaused.value = true
    addLog('⏸ 同步已暂停')
  }

  function resumeSync() {
    isPaused.value = false
    addLog('▶ 同步已恢复')
  }

  function cancelSync() {
    sync.cancel()
    isSyncing.value = false
    isPaused.value = false
    addLog('⏹ 同步已取消')
  }

  return {
    inputText,
    selectedIds,
    historyList,
    isSyncing,
    isPaused,
    overallProgress,
    logMessages,
    taskMap,
    allTargetIds,
    parsedIds,
    toggleSelectId,
    selectAllHistory,
    clearSelection,
    addLog,
    parseInputIds,
    startBatchSync,
    pauseSync,
    resumeSync,
    cancelSync,
  }
}
