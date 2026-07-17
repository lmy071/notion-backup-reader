// ==============================================================
//  STORAGE: 存储层 API（前端 <-> Vite 中间件）
//
//  JSON 结构:
//    json/
//    └── {rootPageId}/         ← 同步会话根页面
//        └── {date}/           ← YYYY-MM-DD
//            ├── index.json    ← 该批次所有页面摘要
//            ├── {pageId}/
//            │   ├── page.json
//            │   ├── meta.json
//            │   └── children/
//            └── {childId}/...
// ==============================================================━━

import type { NotionPage, NotionDatabase } from '@/types/notion'
import type { GlobalIndex, PageSummary, SyncMeta, SyncResult } from '@/types/storage'

const API_BASE = '/api/storage'

export interface BatchSummary {
  rootPageId: string
  date: string
  pages: PageSummary[]
}

export interface BatchIndex {
  version: number
  updatedAt: string
  batches: BatchSummary[]
}

export const storage = {
  // ========== 全局索引 ==========

  async getIndex(): Promise<BatchIndex> {
    const response = await fetch(`${API_BASE}/index`)
    if (!response.ok) {
      return { version: 1, updatedAt: '', batches: [] }
    }
    return response.json()
  },

  // ========== 批次索引 ==========

  async getBatchIndex(rootPageId: string, date: string): Promise<{ version: number; pages: PageSummary[] } | null> {
    const response = await fetch(`${API_BASE}/batch-index/${rootPageId}/${date}`)
    if (!response.ok) return null
    return response.json()
  },

  // ========== 页面 ==========

  async getPage(rootPageId: string, date: string, pageId: string): Promise<SyncResult | null> {
    const response = await fetch(`${API_BASE}/page/${rootPageId}/${date}/${pageId}`)
    if (!response.ok) return null
    return response.json()
  },

  // ========== 反向链接 ==========

  async getBacklinks(rootPageId: string, date: string, pageId: string): Promise<import('@/types/storage').SubPageCard[]> {
    const response = await fetch(`${API_BASE}/backlinks/${rootPageId}/${date}/${pageId}`)
    if (!response.ok) return []
    return response.json()
  },

  // ========== 数据库 ==========

  async getDatabase(rootPageId: string, date: string, pageId: string, databaseId: string): Promise<NotionDatabase | null> {
    const response = await fetch(`${API_BASE}/database/${rootPageId}/${date}/${pageId}/${databaseId}`)
    if (!response.ok) return null
    return response.json()
  },

  // ========== 保存同步结果（批量） ==========

  async saveSyncResult(
    rootPageId: string,
    pages: Array<{ page: NotionPage; children?: Record<string, NotionPage>; databases?: Array<{ databaseId: string; database: NotionDatabase }> }>,
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootPageId, pages }),
    })
    if (!response.ok) {
      throw new Error(`Failed to save sync result: ${response.statusText}`)
    }
  },

  /**
   * SSE 流式保存 — 实时推送进度事件。
   * 返回 AbortController 用于取消。
   */
  saveSyncResultSSE(
    rootPageId: string,
    pages: Array<{ page: NotionPage; children?: Record<string, NotionPage>; databases?: Array<{ databaseId: string; database: NotionDatabase }> }>,
    onProgress: (event: {
      type: 'progress' | 'done' | 'error'
      stage?: string
      pageId?: string
      pageTitle?: string
      message?: string
      step?: number
      total?: number
    }) => void,
  ): AbortController {
    const controller = new AbortController()

    fetch(`${API_BASE}/save-sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootPageId, pages }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        onProgress({ type: 'error', message: `HTTP ${response.status}: ${response.statusText}` })
        return
      }
      const reader = response.body?.getReader()
      if (!reader) {
        onProgress({ type: 'error', message: 'ReadableStream not supported' })
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
          buffer = lines.pop() || ''

          let currentEvent = ''
          let currentData = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7)
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6)
            } else if (line === '' && currentEvent && currentData) {
              try {
                const parsed = JSON.parse(currentData)
                onProgress({ type: currentEvent as 'progress' | 'done' | 'error', ...parsed })
              } catch {
                // skip malformed JSON
              }
              currentEvent = ''
              currentData = ''
            }
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          onProgress({ type: 'error', message: e instanceof Error ? e.message : String(e) })
        }
      }
    }).catch((e) => {
      if (!controller.signal.aborted) {
        onProgress({ type: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    })

    return controller
  },

  // ========== 版本 ==========

  async getVersions(rootPageId: string): Promise<string[]> {
    const response = await fetch(`${API_BASE}/versions/${rootPageId}`)
    if (!response.ok) return []
    return response.json()
  },

  // ========== 清理 ==========

  async remove(rootPageId: string): Promise<void> {
    await fetch(`${API_BASE}/remove/${rootPageId}`, { method: 'DELETE' })
  },

  async cleanup(rootPageId: string): Promise<void> {
    await fetch(`${API_BASE}/cleanup/${rootPageId}`, { method: 'DELETE' })
  },
}
