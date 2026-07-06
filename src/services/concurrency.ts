/**
 * 并发控制工具 — 队列 + 信号量控制并发数
 * 用于同步时控制对 Notion API 的请求速率
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

  async function processQueue() {
    while (!cancelled && queue.length > 0) {
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
      if (elapsed < config.minInterval) {
        await delay(config.minInterval - elapsed)
        continue
      }

      const task = queue.shift()
      if (!task) continue

      running++
      lastRequestTime = Date.now()

      try {
        const result = await task.fn()
        if (!cancelled) {
          task.resolve(result)
        }
      } catch (e) {
        if (!cancelled) {
          task.reject(e instanceof Error ? e : new Error(String(e)))
        }
      } finally {
        running--
      }
    }
  }

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (cancelled) {
      return Promise.reject(new Error('Task cancelled'))
    }

    return new Promise<T>((resolve, reject) => {
      queue.push({ fn, resolve, reject } as QueueTask<unknown>)
      processQueue()
    })
  }

  function pause() {
    paused = true
  }

  function resume() {
    paused = false
    processQueue()
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
