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
  const { items: historyList, cleanupStaleEntries } = usePageHistory()

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

  /** 打字机缓冲 — 当前正在构建的行内容 */
  let currentLine = ''
  /** 已经确认完成的固定行数 */
  let committedCount = 0
  let rafId = 0

  /**
   * 逐字到达时调用。将字符拼入 currentLine，
   * 通过 RAF 以最大帧率更新 UI，产生打字机效果。
   */
  function onLogChar(chunk: string) {
    currentLine += chunk
    scheduleFlush()
  }

  /**
   * 一行结束时调用。将当前行固定到日志数组，开始新行。
   */
  function onLogLineEnd() {
    if (currentLine) {
      logMessages.value.push(currentLine)
      committedCount++
      currentLine = ''
    }
    // 空行也占位
    if (!currentLine && logMessages.value.length === committedCount) {
      logMessages.value.push('')
      committedCount++
    }
  }

  function scheduleFlush() {
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      const msgs = logMessages.value
      // 如果还没有固定行，推入第一行
      if (committedCount === 0 && msgs.length === 0) {
        logMessages.value = [currentLine]
        return
      }
      // 删除旧打字行，追加新打字行
      const fixed = msgs.slice(0, committedCount)
      logMessages.value = currentLine ? [...fixed, currentLine] : fixed
    })
  }

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
            onLog(chunk) {
              if (chunk === '\n') {
                onLogLineEnd()
              } else {
                onLogChar(chunk)
              }
            },
            onFlush() {
              // no-op: RAF 已在流式更新中处理
            },
            onTask(task) {
              const map = new Map(taskMap.value)
              map.set(task.pageId, task)
              taskMap.value = map

              // 计算整体进度
              let sum = 0
              for (const t of map.values()) sum += t.progress
              overallProgress.value = map.size > 0
                ? Math.round(sum / map.size)
                : 0
            },
            onDone() {
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
