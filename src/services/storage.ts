import type { NotionPage, NotionDatabase } from '@/types/notion'
import type { GlobalIndex, PageSummary, SyncMeta, SyncResult } from '@/types/storage'

const API_BASE = '/api/storage'

export const storage = {
  // ========== 索引 ==========

  async getIndex(): Promise<GlobalIndex> {
    const response = await fetch(`${API_BASE}/index`)
    if (!response.ok) {
      return { version: 1, updatedAt: '', pages: [] }
    }
    return response.json()
  },

  // ========== 页面 ==========

  async getPage(pageId: string, date?: string): Promise<SyncResult | null> {
    const params = date ? `?date=${encodeURIComponent(date)}` : ''
    const response = await fetch(`${API_BASE}/page/${pageId}${params}`)
    if (!response.ok) return null
    return response.json()
  },

  async saveSyncResult(result: SyncResult): Promise<void> {
    const response = await fetch(`${API_BASE}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    })
    if (!response.ok) {
      throw new Error(`Failed to save sync result: ${response.statusText}`)
    }
  },

  // ========== 版本 ==========

  async getVersions(pageId: string): Promise<string[]> {
    const response = await fetch(`${API_BASE}/versions/${pageId}`)
    if (!response.ok) return []
    return response.json()
  },

  // ========== 清理 ==========

  async cleanup(pageId: string): Promise<void> {
    await fetch(`${API_BASE}/cleanup/${pageId}`, { method: 'DELETE' })
  },
}
