/**
 * 并发控制工具 — 队列 + 信号量控制并发数
 * 用于同步时控制对 Notion API 的请求速率
 *
 * 注意：使用单一 processLoop 消费队列，避免多实例竞态
 */

export interface ConcurrencyController {
  maxConcurrency: number
  minInterval: number
}

interface QueueTask<T> {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

export function createConcurrencyController(
  options: Partial<ConcurrencyController> = {},
) {
  const config: ConcurrencyController = {
    maxConcurrency: options.maxConcurrency ?? 2,
    minInterval: options.minInterval ?? 350,
  }

  let running = 0
  let lastRequestTime = 0
  let paused = false
  let cancelled = false
  let processing = false
  const queue: QueueTask<unknown>[] = []

  function updateConfig(newConfig: Partial<ConcurrencyController>) {
    if (newConfig.maxConcurrency !== undefined) {
      config.maxConcurrency = newConfig.maxConcurrency
    }
    if (newConfig.minInterval !== undefined) {
      config.minInterval = newConfig.minInterval
    }
  }

  async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 单一消费者循环，避免多个 processQueue 实例竞争 queue.shift()。
   * enqueue 只负责唤醒，不启动新循环。
   */
  async function processLoop() {
    if (processing) return
    processing = true

    try {
      while (!cancelled) {
        if (paused) {
          await delay(100)
          continue
        }

        if (running >= config.maxConcurrency) {
          await delay(50)
          continue
        }

        const now = Date.now()
        const elapsed = now - lastRequestTime
        if (queue.length > 0 && elapsed < config.minInterval) {
          await delay(config.minInterval - elapsed)
          continue
        }

        if (queue.length === 0) {
          // 队列为空，退出循环；下次 enqueue 会重新唤醒
          break
        }

        const task = queue.shift()
        if (!task) continue

        running++
        lastRequestTime = Date.now()

        // 不 await — 让多个 task 并发执行；完成后自减 running + 触发下一轮
        task.fn()
          .then((result) => {
            if (!cancelled) task.resolve(result)
          })
          .catch((e) => {
            if (!cancelled) task.reject(e instanceof Error ? e : new Error(String(e)))
          })
          .finally(() => {
            running--
            // 可能有空位了，继续处理
            processLoop()
          })
      }
    } finally {
      processing = false
    }
  }

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (cancelled) {
      return Promise.reject(new Error('Task cancelled'))
    }

    return new Promise<T>((resolve, reject) => {
      queue.push({ fn, resolve, reject } as QueueTask<unknown>)
      processLoop()
    })
  }

  function pause() {
    paused = true
  }

  function resume() {
    paused = false
    processLoop()
  }

  function cancel() {
    cancelled = true
    const remaining = queue.splice(0)
    for (const task of remaining) {
      task.reject(new Error('Task cancelled'))
    }
  }

  function reset() {
    cancelled = false
    paused = false
    queue.length = 0
    running = 0
    processing = false
  }

  function getStatus() {
    return {
      running,
      queued: queue.length,
      paused,
      cancelled,
    }
  }

  return {
    enqueue,
    pause,
    resume,
    cancel,
    reset,
    getStatus,
    updateConfig,
  }
}
