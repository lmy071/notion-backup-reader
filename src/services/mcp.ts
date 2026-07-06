import type { NotionPage, NotionBlock, NotionDatabase } from '@/types/notion'

/**
 * MCP 调用抽象层 — 所有与 Notion MCP 的通信收敛于此。
 * 通过 Vite 中间件的 /api/notion/* 端点代理到 mcporter CLI。
 */

export interface FetchPageResponse {
  page: Record<string, unknown>
  blocks: Record<string, unknown>[]
}

export interface FetchDatabaseResponse {
  database: Record<string, unknown>
  results: Record<string, unknown>[]
}

async function mcpRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/notion/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`MCP request failed [${endpoint}]: ${response.status} ${errorText}`)
  }

  return response.json()
}

export const mcp = {
  async fetchPage(pageId: string): Promise<FetchPageResponse> {
    return mcpRequest<FetchPageResponse>('fetch-page', { pageId })
  },

  async fetchBlock(blockId: string): Promise<NotionBlock> {
    return mcpRequest<NotionBlock>('fetch-block', { blockId })
  },

  async fetchBlockChildren(blockId: string): Promise<{ results: NotionBlock[]; has_more: boolean; next_cursor: string | null }> {
    return mcpRequest('fetch-block-children', { blockId })
  },

  async fetchDatabase(databaseId: string): Promise<FetchDatabaseResponse> {
    return mcpRequest<FetchDatabaseResponse>('fetch-database', { databaseId })
  },

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return mcpRequest('test-connection', {})
  },
}
