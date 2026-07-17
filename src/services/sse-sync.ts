/**
 * SSE 同步客户端 — 与 POST /api/sync/sse 配对。
 *
 * 用法:
 *   const ctrl = startSync({ pageIds: ['id1','id2'], apiKey:'...' }, {
 *     onLog(chunk)    // 逐字流式日志
 *     onTask(task)    // 单任务状态更新 {pageId,title,status,progress}
 *     onDone()        // 完成
 *     onError(msg)    // 错误
 *   })
 *   // 取消: ctrl.abort()
 */

export interface SyncTaskStatus {
  pageId: string
  title: string
  status: 'pending' | 'fetching' | 'parsing' | 'saving' | 'done' | 'error'
  progress: number
  error?: string
}

export interface SyncCallbacks {
  onLog?: (chunk: string) => void
  onFlush?: () => void // 每个 SSE 事件结束时触发，方便 UI 批量渲染
  onTask?: (task: SyncTaskStatus) => void
  onDone?: () => void
  onError?: (message: string) => void
}

export function startSyncSync(
  options: { pageIds: string[]; apiKey: string },
  callbacks: SyncCallbacks,
): AbortController {
  const controller = new AbortController()

  fetch('/api/sync/sse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Notion-Token': options.apiKey,
    },
    body: JSON.stringify({ pageIds: options.pageIds }),
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok) {
      callbacks.onError?.(`HTTP ${response.status}: ${response.statusText}`)
      return
    }
    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError?.('ReadableStream not supported')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // 保留最后一个不完整行
        buffer = lines.pop() || ''

        let eventType = ''
        let eventData = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6)
          } else if (line === '' && eventType) {
            // SSE 事件完结
            processEvent(eventType, eventData, callbacks)
            eventType = ''
            eventData = ''
          }
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        callbacks.onError?.(e instanceof Error ? e.message : String(e))
      }
    }

    callbacks.onFlush?.()
  }).catch((e) => {
    if (!controller.signal.aborted) {
      callbacks.onError?.(e instanceof Error ? e.message : String(e))
    }
  })

  return controller
}

function processEvent(type: string, data: string, cbs: SyncCallbacks): void {
  try {
    const payload = JSON.parse(data)

    switch (type) {
      case 'log':
        if (payload.chunk) cbs.onLog?.(payload.chunk)
        break
      case 'task':
        cbs.onTask?.(payload as SyncTaskStatus)
        break
      case 'done':
        cbs.onDone?.()
        break
      case 'error':
        cbs.onError?.(payload.message || 'Unknown error')
        break
    }
  } catch {
    // skip malformed payloads
  }

  cbs.onFlush?.()
}
