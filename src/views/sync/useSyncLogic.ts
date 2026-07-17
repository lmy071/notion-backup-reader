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

  // ══════════ 打字机动画 ══════════
  const TYPING_SPEED = 30 // 每个字符间隔（ms）

  /** 待动画的行队列 */
  let lineQueue: string[] = []
  /** 当前正在动画的行已显示字符数 */
  let typedCount = 0
  let timerId: ReturnType<typeof setTimeout> | null = null

  /** 清空打字机状态（同步开始/取消时） */
  function resetTypewriter() {
    if (timerId) { clearTimeout(timerId); timerId = null }
    lineQueue = []
    typedCount = 0
  }

  /** 打字动画 — 每次 tick 追加一个字符到当前行 */
  function typeTick() {
    if (lineQueue.length === 0) {
      timerId = null
      return
    }

    const fullLine = lineQueue[0]
    typedCount++

    // 更新日志：最后一行是正在构建的打字行
    const arr = [...logMessages.value]
    arr[arr.length - 1] = fullLine.slice(0, typedCount)
    logMessages.value = arr

    if (typedCount >= fullLine.length) {
      // 当前行动画完成 → 确认，取下一行
      lineQueue.shift()
      typedCount = 0
      if (lineQueue.length > 0) {
        logMessages.value.push('') // 为下一行预留空位
        timerId = setTimeout(typeTick, TYPING_SPEED * 4) // 行间略停顿
      } else {
        timerId = null
      }
    } else {
      timerId = setTimeout(typeTick, TYPING_SPEED)
    }
  }

  /** 推入一行到动画队列，如果空闲则启动动画 */
  function enqueueTypingLine(line: string) {
    const wasIdle = lineQueue.length === 0 && typedCount === 0
    lineQueue.push(line)
    if (wasIdle) {
      // 推入第一个占位空行（将被动画填充）
      logMessages.value.push('')
      typeTick()
    }
  }

  /** 立即刷完队列中所有剩余行（同步结束时调用） */
  function flushTypewriter() {
    if (timerId) { clearTimeout(timerId); timerId = null }
    // 将当前未完成的打字行补齐
    if (lineQueue.length > 0) {
      const arr = [...logMessages.value]
      arr[arr.length - 1] = lineQueue[0]
      // 剩余行直接追加
      for (let i = 1; i < lineQueue.length; i++) {
        arr.push(lineQueue[i])
      }
      logMessages.value = arr
    }
    resetTypewriter()
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
    resetTypewriter()

    const { config } = useConfigStore()

    try {
      await new Promise<void>((resolve, reject) => {
        startSyncSync(
          { pageIds: allIds, apiKey: config.apiKey },
          {
            onLog(line: string) {
              enqueueTypingLine(line)
            },
            onDone() {
              flushTypewriter()
              resolve()
            },
            onError(msg) {
              flushTypewriter()
              logMessages.value.push(`💥 ${msg}`)
              reject(new Error(msg))
            },
          },
        )
      })
    } catch (e) {
      // error already logged via onError
    } finally {
      flushTypewriter()
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
    resetTypewriter()
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
