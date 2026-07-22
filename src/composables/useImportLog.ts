/**
 * 导入日志 composable — 逐字终端式输出，匹配同步日志的 SSE 逐字面板风格。
 *
 * 用法:
 *   const { logLines, appendChar, log, logProgress, isFlushing, flushing } = useImportLog()
 *   log('正在解析 Excel...')
 *   await flushing() // 等待逐字输出完成
 *   logProgress(3, 20)
 */

import { ref } from 'vue'

const CHAR_DELAY = 12 // 逐字间隔（ms），比同步 SSE 的 CHAR_DELAY 稍快

export function useImportLog() {
  const logLines = ref<string[]>([])
  const isFlushing = ref(false)
  let flushResolve: (() => void) | null = null
  let queue: string[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  /** 逐字追加到当前行末尾 */
  function appendChar(ch: string) {
    const msgs = logLines.value
    if (ch === '\n') {
      logLines.value = [...msgs, '']
      return
    }
    if (msgs.length === 0) {
      logLines.value = [ch]
      return
    }
    const arr = [...msgs]
    arr[arr.length - 1] = (arr[arr.length - 1] || '') + ch
    logLines.value = arr
  }

  /** 将字符串加入逐字输出队列 */
  function pushChunk(chunk: string) {
    for (const ch of chunk) {
      queue.push(ch)
    }
    if (!timer) {
      scheduleFlush()
    }
  }

  function scheduleFlush() {
    timer = setTimeout(() => {
      const ch = queue.shift()
      if (ch !== undefined) {
        appendChar(ch)
      }
      if (queue.length > 0) {
        scheduleFlush()
      } else {
        timer = null
        if (flushResolve) {
          flushResolve()
          flushResolve = null
        }
      }
    }, CHAR_DELAY)
  }

  /** 输出一行日志（带逐字效果） */
  function log(msg: string) {
    pushChunk(msg + '\n')
  }

  /**
   * 等待当前逐字队列排空。
   * 对于短的 info 消息不需要等待，对于需要知道输出完成的场景使用。
   */
  function flushing(): Promise<void> {
    if (queue.length === 0 && !timer) return Promise.resolve()
    return new Promise(resolve => {
      flushResolve = resolve
    })
  }

  /**
   * 输出进度信息（JSON 格式，与同步日志中的 task 事件类似）。
   * 不经过逐字队列，直接推入新行。
   */
  function logProgress(done: number, total: number) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5))
    logLines.value = [...logLines.value, `[${bar}] ${done}/${total} (${pct}%)`, '']
  }

  /** 清空日志 */
  function clear() {
    queue = []
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    flushResolve = null
    logLines.value = []
  }

  return { logLines, appendChar, log, logProgress, flushing, isFlushing, clear }
}
