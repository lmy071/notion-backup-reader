import { ref, computed } from 'vue'
import { usePageHistory } from '@/composables/usePageHistory'
import { useConfigStore } from '@/stores/config'
import { startSyncSync, type SyncTaskStatus } from '@/services/sse-sync'

export function useSyncLogic() {
  const inputText = ref('')
  const selectedIds = ref<Set<string>>(new Set())
  const isSyncing = ref(false)
  const isPaused = ref(false)
  const overallProgress = ref(0)
  const logMessages = ref<string[]>([])
  const taskMap = ref<Map<string, SyncTaskStatus>>(new Map())
  const { items: historyList, addOrUpdate, cleanupStaleEntries } = usePageHistory()

  cleanupStaleEntries()

  /** 从 Notion 页面链接中提取 page ID */
  function extractId(raw: string): string | null {
    const s = raw.trim()
    if (!s) return null
    const urlMatch = s.match(/\/(?:pages?\/)?([0-9a-fA-F]{32})(?:[?#]|$)/)
    if (urlMatch) return urlMatch[1]
    const uuidMatch = s.match(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    )
    if (uuidMatch) return uuidMatch[0]
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
    logMessages.value.push(msg)
  }

  // ══════════ 逐字日志渲染 ══════════
  // 服务端已逐字 SSE + charDelay 控制速度，前端只需简单追加

  function appendChar(ch: string) {
    const msgs = logMessages.value
    if (ch === '\n') {
      // 换行：当前行内容已经完整，推入空行占位，下一个字会填进去
      // 如果没有内容则也推入空行（连续两个 \n 的空行效果）
      logMessages.value = [...msgs, '']
      return
    }
    if (msgs.length === 0) {
      logMessages.value = [ch]
      return
    }
    // 追加到当前行末尾
    const arr = [...msgs]
    arr[arr.length - 1] = (arr[arr.length - 1] || '') + ch
    logMessages.value = arr
  }

  // ══════════ 同步逻辑 ══════════

  function parseInputIds(): string[] {
    return parsedIds.value
  }

  async function startBatchSync() {
    const allIds = allTargetIds.value
    if (allIds.length === 0) return

    isSyncing.value = true
    isPaused.value = false
    overallProgress.value = 0
    logMessages.value = []
    taskMap.value = new Map()

    const { config } = useConfigStore()

    try {
      await new Promise<void>((resolve, reject) => {
        startSyncSync(
          { pageIds: allIds, apiKey: config.apiKey },
          {
            onLog(chunk: string) {
              if (chunk === '\n') {
                appendChar(chunk)
              } else {
                appendChar(chunk)
              }
            },
            onTask(task) {
              const map = new Map(taskMap.value)
              map.set(task.pageId, task)
              taskMap.value = map

              let sum = 0
              for (const t of map.values()) sum += t.progress
              overallProgress.value = map.size > 0
                ? Math.round(sum / map.size)
                : 0
            },
            onDone() {
              // 同步完成后更新页面历史
              for (const [pageId, task] of taskMap.value) {
                if (task.status === 'done') {
                  addOrUpdate({ id: pageId, title: task.title, lastSync: new Date().toISOString() })
                }
              }
              cleanupStaleEntries()
              resolve()
            },
            onError(msg) {
              logMessages.value.push(`💥 ${msg}`)
              reject(new Error(msg))
            },
          },
        )
      })
    } catch (e) {
      // error already logged via onError
    } finally {
      isSyncing.value = false
      isPaused.value = false
    }
  }

  function pauseSync() {
    isPaused.value = true
  }

  function resumeSync() {
    isPaused.value = false
  }

  function cancelSync() {
    isSyncing.value = false
    isPaused.value = false
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
