import type { NotionBlock } from '@/types/notion'

/**
 * Notion API 调用抽象层 — 所有与 Notion 的通信收敛于此。
 * 通过 Vite 中间件的 /api/notion/* 端点代理，绕过 CORS 限制。
 * apiKey 通过 X-Notion-Token header 透传，仅在 localhost 内使用。
 */

export interface FetchPageResponse {
  page: Record<string, unknown>
  blocks: Record<string, unknown>[]
}

export interface FetchDatabaseResponse {
  database: Record<string, unknown>
  results: Record<string, unknown>[]
}

async function mcpRequest<T>(
  endpoint: string,
  body: Record<string, unknown> = {},
  apiKey: string,
): Promise<T> {
  const response = await fetch(`/api/notion/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Notion-Token': apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Notion API error [${endpoint}]: ${response.status} ${errorText}`)
  }

  return response.json()
}

export function createMcpClient(apiKey: string) {
  return {
    async fetchPage(pageId: string): Promise<FetchPageResponse> {
      return mcpRequest<FetchPageResponse>('fetch-page', { pageId }, apiKey)
    },

    async fetchBlock(blockId: string): Promise<NotionBlock> {
      return mcpRequest<NotionBlock>('fetch-block', { blockId }, apiKey)
    },

    async fetchBlockChildren(
      blockId: string,
      startCursor?: string,
    ): Promise<{ results: NotionBlock[]; has_more: boolean; next_cursor: string | null }> {
      return mcpRequest('fetch-block-children', { blockId, startCursor }, apiKey)
    },

    async fetchDatabase(databaseId: string): Promise<FetchDatabaseResponse> {
      return mcpRequest<FetchDatabaseResponse>('fetch-database', { databaseId }, apiKey)
    },

    async testConnection(): Promise<{ ok: boolean; message: string }> {
      return mcpRequest('test-connection', {}, apiKey)
    },
  }
}
