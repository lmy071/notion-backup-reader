import type { NotionBlock, NotionPage, NotionDatabase } from '@/types/notion'
import { createMcpClient, type FetchPageResponse } from './mcp'
import { storage } from './storage'
import { logger } from './logger'
import { createConcurrencyController } from './concurrency'
import { parsePage, parseDatabase } from '../../notion-parser/index'
import type { RawBlock, RawPage } from '../../notion-parser/types'

// ── Progress types ─────────────────────────────────────────────────

export interface SyncProgress {
  pageId: string
  title: string
  status: 'pending' | 'fetching' | 'parsing' | 'saving' | 'done' | 'error'
  progress: number
  error?: string
}

export interface BatchSyncProgress {
  tasks: Map<string, SyncProgress>
  overall: number
}

export type SyncCallback = (progress: BatchSyncProgress) => void

// ── Internal state ─────────────────────────────────────────────────

let cancelled = false
let currentBatch: BatchSyncProgress | null = null
let currentCallback: SyncCallback | null = null
let currentConcurrency: ReturnType<typeof createConcurrencyController> | null = null
const visitedPages = new Set<string>()

type McpClient = ReturnType<typeof createMcpClient>
let mcpClient: McpClient | null = null
let rootPageId: string | null = null
let collectedPages: Array<{ page: NotionPage; databases?: Array<{ databaseId: string; database: NotionDatabase }> }> = []

// ── Helpers ────────────────────────────────────────────────────────

function computeOverall(): number {
  if (!currentBatch || currentBatch.tasks.size === 0) return 0
  let sum = 0
  for (const task of currentBatch.tasks.values()) {
    sum += task.progress
  }
  return Math.round(sum / currentBatch.tasks.size)
}

function report(): void {
  if (currentBatch && currentCallback) {
    currentBatch.overall = computeOverall()
    currentCallback({
      tasks: new Map(currentBatch.tasks),
      overall: currentBatch.overall,
    })
  }
}

function ensureTask(pageId: string, title: string): SyncProgress {
  if (!currentBatch) {
    currentBatch = { tasks: new Map(), overall: 0 }
  }
  let task = currentBatch.tasks.get(pageId)
  if (!task) {
    task = { pageId, title, status: 'pending', progress: 0 }
    currentBatch.tasks.set(pageId, task)
    report()
  }
  return task
}

function updateTask(pageId: string, update: Partial<SyncProgress>): void {
  const task = currentBatch?.tasks.get(pageId)
  if (task) {
    Object.assign(task, update)
    report()
  }
}

function extractTitleFromPageMap(
  pageData: Record<string, unknown>,
  fallback: string,
): string {
  const properties = pageData?.properties as Record<string, unknown> | undefined
  if (!properties) return fallback

  for (const key of Object.keys(properties)) {
    const prop = properties[key] as Record<string, unknown>
    if (prop?.type === 'title') {
      const titleArr = (prop.title as Array<{ plain_text: string }>) || []
      if (titleArr.length > 0) {
        return titleArr.map((t) => t.plain_text).join('') || fallback
      }
      break
    }
  }
  return fallback
}

// ── Child detection ────────────────────────────────────────────────

interface ChildReference {
  blockId: string
  type: 'child_page' | 'child_database'
  title: string
}

function extractChildren(blocks: NotionBlock[]): ChildReference[] {
  const children: ChildReference[] = []
  for (const block of blocks) {
    if (block.type === 'child_page' || block.type === 'child_database') {
      const data = block[block.type] as Record<string, unknown> | undefined
      children.push({
        blockId: block.id,
        type: block.type,
        title: (data?.title as string) || block.id,
      })
    }
  }
  return children
}

async function syncChildren(children: ChildReference[]): Promise<void> {
  if (cancelled) return

  // IMPORTANT: children run sequentially within the parent's slot.
  // We must NOT enqueue them into currentConcurrency — that creates a deadlock:
  // all slots are held by parent pages awaiting children, but children need
  // a slot to start. Sequential execution avoids this classic deadlock.
  for (const child of children) {
    if (cancelled) break
    if (visitedPages.has(child.blockId)) continue

    if (child.type === 'child_page') {
      await syncOnePage(child.blockId, child.title, true)
    } else if (child.type === 'child_database') {
      await syncChildDatabasePages(child.blockId)
    }
  }
}

async function syncChildDatabasePages(databaseId: string): Promise<void> {
  if (cancelled || visitedPages.has(databaseId)) return
  visitedPages.add(databaseId)

  try {
    const client = mcpClient!
    const dbResponse = await client.fetchDatabase(databaseId)
    const results = (dbResponse.results || []) as Record<string, unknown>[]

    if (cancelled || results.length === 0) return

    const tasks = results
      .filter((p) => !visitedPages.has(p.id as string))
      .map((p) => () =>
        syncOnePage(
          p.id as string,
          extractTitleFromPageMap(p, p.id as string),
          true,
        ),
      )

    if (tasks.length > 0) {
      await Promise.all(tasks.map((fn) => currentConcurrency!.enqueue(fn)))
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    logger.warn({
      action: 'child_fetch',
      pageId: databaseId,
      message: `获取子数据库失败: ${errMsg}`,
    })
  }
}

// ── History helper ─────────────────────────────────────────────────

function updateLocalHistory(pageId: string, title: string): void {
  try {
    const raw = localStorage.getItem('notion-synced-pages')
    const history: Array<{ id: string; title: string; lastSync: string }> =
      raw ? JSON.parse(raw) : []
    const idx = history.findIndex((h) => h.id === pageId)
    const entry = {
      id: pageId,
      title,
      lastSync: new Date().toISOString(),
    }
    if (idx >= 0) {
      history[idx] = entry
    } else {
      history.push(entry)
    }
    localStorage.setItem('notion-synced-pages', JSON.stringify(history))
  } catch {
    // ignore localStorage errors
  }
}

// ── Core: sync a single page ───────────────────────────────────────

async function syncOnePage(
  pageId: string,
  initialTitle?: string,
  isChild = false,
): Promise<void> {
  if (cancelled) return
  if (visitedPages.has(pageId)) return
  visitedPages.add(pageId)

  const startTime = Date.now()
  let title = initialTitle || pageId

  ensureTask(pageId, title)

  try {
    logger.info({ action: 'sync_start', pageId, message: '开始同步' })

    // ── Fetch page ──
    updateTask(pageId, { status: 'fetching', progress: 10 })

    const client = mcpClient!
    const pageResponse = await client.fetchPage(pageId)
    const rawPage: RawPage = {
      id: pageResponse.page?.id as string || pageId,
      properties: (pageResponse.page?.properties as Record<string, unknown>) || {},
      icon: pageResponse.page?.icon as RawPage['icon'],
      cover: pageResponse.page?.cover as RawPage['cover'],
    }

    title = extractTitleFromPageMap(
      pageResponse.page as Record<string, unknown>,
      title,
    )

    const rawBlocks = (pageResponse.blocks || []) as unknown as RawBlock[]

    updateTask(pageId, { title, status: 'fetching', progress: 50 })

    // ── Parse ──
    updateTask(pageId, { status: 'parsing', progress: 60 })

    const parsed = parsePage(rawPage, rawBlocks)

    // ── Scan for child_database blocks and fetch database data ──
    const databases: Array<{ databaseId: string; database: NotionDatabase }> = []
    for (const rawBlock of rawBlocks) {
      if (rawBlock.type === 'child_database') {
        const dbBlockId = rawBlock.id
        const dbTitle = rawBlock.child_database?.title || dbBlockId
        try {
          logger.info({ action: 'db_fetch', pageId, dbId: dbBlockId, message: `开始获取数据库 schema: ${dbTitle}` })
          const schemaRes = await client.fetchDatabaseSchema(dbBlockId)
          const schema = schemaRes.database as Record<string, unknown>

          logger.info({ action: 'db_fetch', pageId, dbId: dbBlockId, message: `开始查询数据库: ${dbTitle}` })
          const dbRes = await client.fetchDatabase(dbBlockId)

          const db = parseDatabase({
            id: dbBlockId,
            title: (schema as { title?: Array<{ plain_text: string }> })?.title?.map(t => t.plain_text ?? '').join('') ?? dbTitle,
            properties: (schema as { properties?: Record<string, unknown> }).properties ?? {},
            results: (dbRes.results ?? []) as unknown[],
          })
          databases.push({ databaseId: dbBlockId, database: db })
          logger.info({ action: 'db_fetch', pageId, dbId: dbBlockId, message: `数据库获取完成 (${db.rows.length} 行)` })
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e)
          logger.warn({ action: 'db_fetch', pageId, dbId: dbBlockId, message: `数据库获取失败: ${errMsg}` })
        }
      }
    }

    // ── Collect for batch save (instead of saving individually) ──
    collectedPages.push({ page: parsed, databases: databases.length > 0 ? databases : undefined })

    updateTask(pageId, { progress: 80 })

    // ── Detect children ──
    const blocks = rawBlocks as unknown as NotionBlock[]
    const children = extractChildren(blocks)

    if (children.length > 0) {
      logger.info({
        action: 'child_fetch',
        pageId,
        pageTitle: title,
        message: `发现 ${children.length} 个子页面/数据库`,
      })
    }

    // ── Log done ──
    const duration = Date.now() - startTime
    logger.info({
      action: 'sync_done',
      pageId,
      pageTitle: title,
      message: '同步完成',
      duration,
    })

    if (!isChild) {
      updateLocalHistory(pageId, title)
    }
    updateTask(pageId, { status: 'done', progress: 100 })

    // ── Recursively sync children ──
    if (children.length > 0 && !cancelled) {
      await syncChildren(children)
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    const duration = Date.now() - startTime

    logger.error({
      action: 'sync_error',
      pageId,
      pageTitle: title,
      message: `同步失败: ${errMsg}`,
      error: errMsg,
      duration,
    })

    updateTask(pageId, {
      title,
      status: 'error',
      error: errMsg,
      progress: 0,
    })
  }
}

// ── Public API ─────────────────────────────────────────────────────

export const sync = {
  async syncPage(
    pageId: string,
    onProgress?: SyncCallback,
  ): Promise<void> {
    cancelled = false
    visitedPages.clear()
    collectedPages = []
    rootPageId = pageId
    currentBatch = { tasks: new Map(), overall: 0 }
    currentCallback = onProgress || null

    const { useConfigStore } = await import('@/stores/config')
    const { config } = useConfigStore()
    mcpClient = createMcpClient(config.apiKey)
    currentConcurrency = createConcurrencyController({
      maxConcurrency: config.syncConcurrency,
      minInterval: config.requestDelay,
    })

    ensureTask(pageId, pageId)
    report()

    try {
      await currentConcurrency.enqueue(() => syncOnePage(pageId))
      // Batch save all collected pages
      if (collectedPages.length > 0 && !cancelled) {
        await storage.saveSyncResult(rootPageId!, collectedPages)
      }
    } finally {
      currentConcurrency = null
      currentBatch = null
      currentCallback = null
    }
  },

  async syncPages(
    pageIds: string[],
    onProgress?: SyncCallback,
  ): Promise<void> {
    if (pageIds.length === 0) return

    cancelled = false
    visitedPages.clear()
    collectedPages = []
    rootPageId = pageIds[0]
    currentBatch = { tasks: new Map(), overall: 0 }
    currentCallback = onProgress || null

    for (const pageId of pageIds) {
      ensureTask(pageId, pageId)
    }
    report()

    const { useConfigStore } = await import('@/stores/config')
    const { config } = useConfigStore()
    mcpClient = createMcpClient(config.apiKey)
    currentConcurrency = createConcurrencyController({
      maxConcurrency: config.syncConcurrency,
      minInterval: config.requestDelay,
    })

    try {
      const tasks = pageIds.map((pageId) => () => syncOnePage(pageId))
      await Promise.all(tasks.map((fn) => currentConcurrency!.enqueue(fn)))

      if (collectedPages.length > 0 && !cancelled) {
        await storage.saveSyncResult(rootPageId!, collectedPages)
      }
    } finally {
      currentConcurrency = null
      currentBatch = null
      currentCallback = null
    }
  },

  cancel(): void {
    cancelled = true
    visitedPages.clear()
    collectedPages = []
    if (currentConcurrency) {
      currentConcurrency.cancel()
      currentConcurrency = null
    }
    currentBatch = null
    currentCallback = null
  },
}
