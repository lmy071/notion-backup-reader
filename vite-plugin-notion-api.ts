import type { Plugin, ViteDevServer } from 'vite'
import { readFile, writeFile, mkdir, readdir, stat, unlink, appendFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'

const JSON_DIR = join(process.cwd(), 'json')
const LOG_DIR = join(process.cwd(), 'log')
const MAX_VERSIONS = 10
const MAX_LOG_FILES = 30

// ── JSON helpers ────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status)
}

async function readJson(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function readJsonSafe(filePath: string): Promise<unknown> {
  try {
    return await readJson(filePath)
  } catch {
    return null
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

// ── Log helpers ──────────────────────────────────────────────────

async function appendToLog(fileName: string, line: string): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true })
  const filePath = join(LOG_DIR, fileName)
  await appendFile(filePath, line, 'utf-8')
}

async function readLogs(
  date?: string,
  _level?: string,
  _pageId?: string,
): Promise<unknown[]> {
  if (date) {
    const filePath = join(LOG_DIR, `${date}.log`)
    try {
      const content = await readFile(filePath, 'utf-8')
      return content
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    } catch {
      return []
    }
  }

  // Read all log files
  let files: string[]
  try {
    files = await readdir(LOG_DIR)
  } catch {
    return []
  }

  const results: unknown[] = []
  for (const file of files.sort().reverse().slice(0, 10)) {
    const filePath = join(LOG_DIR, file)
    try {
      const content = await readFile(filePath, 'utf-8')
      const entries = content
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      results.push(...entries)
    } catch {
      // skip corrupted files
    }
  }
  return results
}

async function cleanupLogs(): Promise<void> {
  let files: string[]
  try {
    files = await readdir(LOG_DIR)
  } catch {
    return
  }

  const logFiles = files.filter((f) => f.endsWith('.log')).sort()
  while (logFiles.length > MAX_LOG_FILES) {
    const oldest = logFiles.shift()!
    await unlink(join(LOG_DIR, oldest))
  }
}

// ── API routes ───────────────────────────────────────────────────

// URL 解析辅助：从 path 提取路由参数
// GET /api/storage/page/:rootPageId/:date/:pageId
// GET /api/storage/batch-index/:rootPageId/:date
// GET /api/storage/versions/:rootPageId
// DELETE /api/storage/cleanup/:rootPageId

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method
  const segments = path.split('/').filter(Boolean)

  // ── GET /api/storage/index
  if (method === 'GET' && path === '/api/storage/index') {
    return jsonResponse(await buildGlobalIndex())
  }

  // ── GET /api/storage/page/:rootPageId/:date/:pageId
  if (method === 'GET' && path.startsWith('/api/storage/page/')) {
    // segments = ['api','storage','page','rootPageId','date','pageId']
    if (segments.length < 6) return errorResponse('Invalid path', 400)
    const rootPageId = segments[3]
    const date = segments[4]
    const pageId = segments.slice(5).join('/')

    const pageDir = join(JSON_DIR, rootPageId, date, pageId)
    const page = await readJsonSafe(join(pageDir, 'page.json'))
    if (!page) return jsonResponse(null, 404)

    const children: Record<string, unknown> = {}
    const childrenDir = join(pageDir, 'children')
    if (existsSync(childrenDir)) {
      const childFiles = await readdir(childrenDir)
      for (const childFile of childFiles) {
        const childId = childFile.replace('.json', '')
        const childData = await readJsonSafe(join(childrenDir, childFile))
        if (childData) children[childId] = childData
      }
    }

    // Load embedded databases
    const databases: Record<string, unknown> = {}
    const databasesDir = join(pageDir, 'databases')
    if (existsSync(databasesDir)) {
      const dbFiles = await readdir(databasesDir)
      for (const dbFile of dbFiles) {
        const dbId = dbFile.replace('.json', '')
        const dbData = await readJsonSafe(join(databasesDir, dbFile))
        if (dbData) databases[dbId] = dbData
      }
    }

    return jsonResponse({ page, children, databases, subPages: extractSubPageCards(page) })
  }

  // ── GET /api/storage/batch-index/:rootPageId/:date
  if (method === 'GET' && path.startsWith('/api/storage/batch-index/')) {
    if (segments.length < 6) return errorResponse('Invalid path', 400)
    const rootPageId = segments[3]
    const date = segments[4]
    const indexFile = join(JSON_DIR, rootPageId, date, 'index.json')
    const index = await readJsonSafe(indexFile)
    if (index) return jsonResponse(index)
    return jsonResponse(null, 404)
  }

  // ── POST /api/storage/save
  // body: { rootPageId, pages: [{ page, children?, databases? }] }
  if (method === 'POST' && path === '/api/storage/save') {
    const body = (await req.json()) as Record<string, unknown>
    const rootPageId = body.rootPageId as string
    const pages = body.pages as Array<Record<string, unknown>> | undefined

    if (!rootPageId) return errorResponse('Missing rootPageId', 400)
    if (!pages || pages.length === 0) return errorResponse('Missing pages', 400)

    const today = new Date().toISOString().slice(0, 10)
    const batchDir = join(JSON_DIR, rootPageId, today)
    const batchEntries: unknown[] = []

    for (const entry of pages) {
      const page = entry.page as Record<string, unknown>
      const pageId = page?.pageId as string | undefined
      if (!pageId) continue

      const pageDir = join(batchDir, pageId)

      // Save page.json
      await writeJson(join(pageDir, 'page.json'), page)

      // Save children
      const children = entry.children as Record<string, unknown> | undefined
      const childrenEntries = children ? Object.keys(children) : []
      if (children && childrenEntries.length > 0) {
        const childrenDir = join(pageDir, 'children')
        for (const [childId, childData] of Object.entries(children)) {
          await writeJson(join(childrenDir, `${childId}.json`), childData)
        }
      }

      // Save databases
      const databases = entry.databases as Array<Record<string, unknown>> | undefined
      const databaseIds: string[] = []
      if (databases && databases.length > 0) {
        const databasesDir = join(pageDir, 'databases')
        for (const dbItem of databases) {
          const dbId = dbItem.databaseId as string
          const db = dbItem.database as Record<string, unknown>
          if (dbId && db) {
            await writeJson(join(databasesDir, `${dbId}.json`), db)
            databaseIds.push(dbId)
          }
        }
      }

      // Save meta.json
      const blocks = (page as { blocks?: unknown[] })?.blocks
      const meta: Record<string, unknown> = {
        pageId,
        rootPageId,
        title: (page as { title?: string }).title ?? '',
        syncedAt: new Date().toISOString(),
        blockCount: Array.isArray(blocks) ? blocks.length : 0,
        childPages: childrenEntries,
        databases: databaseIds,
        errors: [],
      }
      await writeJson(join(pageDir, 'meta.json'), meta)

      batchEntries.push({
        pageId,
        rootPageId,
        title: (page as { title?: string }).title ?? '',
        icon: (page as { icon?: unknown }).icon ?? null,
        coverUrl: (page as { cover?: Record<string, unknown> })?.cover?.url ?? null,
        lastSync: new Date().toISOString(),
        childCount: childrenEntries.length,
        blockCount: Array.isArray(blocks) ? blocks.length : 0,
      })
    }

    const batchIndex = {
      version: 1,
      rootPageId,
      date: today,
      syncedAt: new Date().toISOString(),
      pages: batchEntries,
    }
    await writeJson(join(batchDir, 'index.json'), batchIndex)

    // Cleanup old versions for this root
    const allDates = (await listDirs(join(JSON_DIR, rootPageId))).sort().reverse()
    for (const oldDate of allDates.slice(MAX_VERSIONS)) {
      await rmRecursive(join(JSON_DIR, rootPageId, oldDate))
    }

    return jsonResponse({ ok: true })
  }

  // ── GET /api/storage/database/:rootPageId/:date/:pageId/:databaseId
  if (method === 'GET' && path.startsWith('/api/storage/database/')) {
    // segments = ['api','storage','database','rootPageId','date','pageId','databaseId']
    if (segments.length < 7) return errorResponse('Invalid path', 400)
    const rootPageId = segments[3]
    const date = segments[4]
    const pageId = segments[5]
    const databaseId = segments[6]

    const dbPath = join(JSON_DIR, rootPageId, date, pageId, 'databases', `${databaseId}.json`)
    const db = await readJsonSafe(dbPath)
    if (!db) return jsonResponse(null, 404)
    return jsonResponse(db)
  }

  // ── GET /api/storage/backlinks/:rootPageId/:date/:pageId
  if (method === 'GET' && path.startsWith('/api/storage/backlinks/')) {
    if (segments.length < 7) return errorResponse('Invalid path', 400)
    const rootPageId = segments[3]
    const date = segments[4]
    const pageId = segments.slice(5).join('/')
    return jsonResponse(await buildBacklinks(rootPageId, date, pageId))
  }

  // ── GET /api/storage/versions/:rootPageId
  if (method === 'GET' && path.startsWith('/api/storage/versions/')) {
    const rootPageId = segments[3]
    const versions = (await listDirs(join(JSON_DIR, rootPageId))).sort().reverse()
    return jsonResponse(versions)
  }

  // ── DELETE /api/storage/cleanup/:rootPageId
  if (method === 'DELETE' && path.startsWith('/api/storage/cleanup/')) {
    const rootPageId = segments[3]
    const allDates = (await listDirs(join(JSON_DIR, rootPageId))).sort().reverse()
    for (const oldDate of allDates.slice(MAX_VERSIONS)) {
      await rmRecursive(join(JSON_DIR, rootPageId, oldDate))
    }
    return jsonResponse({ ok: true })
  }

  // ── POST /api/storage/append-log
  if (method === 'POST' && path === '/api/storage/append-log') {
    const body = (await req.json()) as { fileName: string; line: string }
    await appendToLog(body.fileName, body.line)
    return jsonResponse({ ok: true })
  }

  // ── GET /api/storage/logs
  if (method === 'GET' && path === '/api/storage/logs') {
    const date = url.searchParams.get('date') ?? undefined
    const level = url.searchParams.get('level') ?? undefined
    const pageId = url.searchParams.get('pageId') ?? undefined
    const logs = await readLogs(date, level, pageId)
    return jsonResponse(logs)
  }

  // ── POST /api/storage/cleanup-logs
  if (method === 'POST' && path === '/api/storage/cleanup-logs') {
    await cleanupLogs()
    return jsonResponse({ ok: true })
  }

  // ── Notion API proxy — 浏览器不直连 api.notion.com（CORS），由中间件转发
  if (path.startsWith('/api/notion/')) {
    return handleNotionProxy(req)
  }

  return new Response('Not Found', { status: 404 })
}

// ── Notion API proxy ───────────────────────────────────────────

const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

/**
 * 扫描 json/ 目录构建全局索引。
 * 结构：json/{rootPageId}/{date}/index.json → 聚合所有批次
 */
async function buildGlobalIndex(): Promise<Record<string, unknown>> {
  const batches: unknown[] = []
  let rootDirs: string[]
  try {
    rootDirs = await readdir(JSON_DIR)
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), batches: [] }
  }

  for (const rootId of rootDirs) {
    const rootPath = join(JSON_DIR, rootId)
    let statInfo
    try { statInfo = await stat(rootPath) } catch { continue }
    if (!statInfo.isDirectory()) continue

    const dateDirs = (await listDirs(rootPath)).sort().reverse()
    for (const date of dateDirs) {
      const indexPath = join(rootPath, date, 'index.json')
      const idx = await readJsonSafe(indexPath) as Record<string, unknown> | null
      if (idx) {
        batches.push({
          rootPageId: rootId,
          date,
          pages: (idx.pages || []),
        })
      }
    }
  }

  return { version: 1, updatedAt: new Date().toISOString(), batches }
}

async function handleNotionProxy(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const method = req.method
  const path = url.pathname

  // Extract the Notion API token from the request header
  const notionToken = req.headers.get('X-Notion-Token')
  if (!notionToken) {
    return errorResponse('Missing X-Notion-Token header (set apiKey in config)', 401)
  }

  const commonHeaders: Record<string, string> = {
    'Authorization': `Bearer ${notionToken}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }

  try {
    // ── POST /api/notion/test-connection
    if (method === 'POST' && path === '/api/notion/test-connection') {
      // Use the user endpoint as a lightweight connectivity test
      const res = await fetch(`${NOTION_API_BASE}/users/me`, { headers: commonHeaders })
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>
        return jsonResponse({
          ok: true,
          message: `Connected as ${(data as Record<string, unknown>).name || (data as Record<string, unknown>).type || 'bot'}`,
        })
      }
      const err = await res.text()
      return jsonResponse({ ok: false, message: `Notion API error: ${res.status} ${err}` }, 502)
    }

    // ── POST /api/notion/fetch-page
    if (method === 'POST' && path === '/api/notion/fetch-page') {
      const body = await req.json() as { pageId: string }
      const { pageId } = body

      // Fetch page metadata + blocks in parallel
      const [pageRes, blocksRes] = await Promise.all([
        fetch(`${NOTION_API_BASE}/pages/${pageId}`, { headers: commonHeaders }),
        fetchBlocks(pageId, commonHeaders),
      ])

      if (!pageRes.ok) {
        const err = await pageRes.text()
        return jsonResponse({ error: `Failed to fetch page: ${pageRes.status} ${err}` }, 502)
      }

      const page = await pageRes.json() as Record<string, unknown>
      return jsonResponse({ page, blocks: blocksRes })
    }

    // ── POST /api/notion/fetch-block-children
    if (method === 'POST' && path === '/api/notion/fetch-block-children') {
      const body = await req.json() as { blockId: string; startCursor?: string }
      const { blockId, startCursor } = body

      let queryUrl = `${NOTION_API_BASE}/blocks/${blockId}/children?page_size=100`
      if (startCursor) queryUrl += `&start_cursor=${startCursor}`

      const res = await fetch(queryUrl, { headers: commonHeaders })
      if (!res.ok) {
        const err = await res.text()
        return jsonResponse({ error: `Failed to fetch blocks: ${res.status} ${err}` }, 502)
      }
      const data = await res.json() as Record<string, unknown>
      return jsonResponse(data)
    }

    // ── POST /api/notion/fetch-database
    if (method === 'POST' && path === '/api/notion/fetch-database') {
      const body = await req.json() as { databaseId: string }
      const { databaseId } = body

      const res = await fetch(
        `${NOTION_API_BASE}/databases/${databaseId}/query`,
        { method: 'POST', headers: commonHeaders, body: JSON.stringify({ page_size: 100 }) },
      )
      if (!res.ok) {
        const err = await res.text()
        return jsonResponse({ error: `Failed to query database: ${res.status} ${err}` }, 502)
      }
      const data = await res.json() as Record<string, unknown>
      return jsonResponse({ database: data, results: (data as { results?: unknown }).results || [] })
    }

    // ── POST /api/notion/fetch-database-schema
    if (method === 'POST' && path === '/api/notion/fetch-database-schema') {
      const body = await req.json() as { databaseId: string }
      const { databaseId } = body

      const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, { headers: commonHeaders })
      if (!res.ok) {
        const err = await res.text()
        return jsonResponse({ error: `Failed to fetch database schema: ${res.status} ${err}` }, 502)
      }
      const data = await res.json() as Record<string, unknown>
      return jsonResponse({ database: data })
    }

    return errorResponse(`Unknown Notion proxy endpoint: ${path}`, 404)
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    return errorResponse(`Notion proxy error: ${errMsg}`)
  }
}

/** Paginated fetch of all block children. */
async function fetchBlocks(
  blockId: string,
  headers: Record<string, string>,
): Promise<unknown[]> {
  const allBlocks: unknown[] = []
  let cursor: string | undefined
  let hasMore = true

  while (hasMore) {
    let url = `${NOTION_API_BASE}/blocks/${blockId}/children?page_size=100`
    if (cursor) url += `&start_cursor=${cursor}`

    const res = await fetch(url, { headers })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Failed to fetch blocks: ${res.status} ${err}`)
    }

    const data = await res.json() as Record<string, unknown>
    const results = (data.results || []) as unknown[]
    allBlocks.push(...results)

    hasMore = Boolean(data.has_more)
    cursor = data.next_cursor as string | undefined
  }

  // 递归拉取嵌套子块（toggle、column_list 等的 children）
  await fetchNestedChildren(allBlocks, headers)

  return allBlocks
}

const NESTED_BLOCK_TYPES = new Set([
  'toggle',
  'column_list',
  'column',
  'bulleted_list_item',
  'numbered_list_item',
  'synced_block',
  'table',
])

/** 递归拉取 has_children 块的嵌套内容，填充到 block.children */
async function fetchNestedChildren(
  blocks: unknown[],
  headers: Record<string, string>,
): Promise<void> {
  if (!blocks || blocks.length === 0) return

  const childFetchTasks: Promise<void>[] = []

  for (const block of blocks) {
    const b = block as Record<string, unknown>
    if (b.has_children && !b.children) {
      const type = b.type as string
      const id = b.id as string

      if (!NESTED_BLOCK_TYPES.has(type)) continue

      childFetchTasks.push(
        fetchBlocks(id, headers).then((nestedBlocks) => {
          (b as Record<string, unknown>).children = nestedBlocks
          // 继续递归：嵌套子块可能还有更深层的子块
          return fetchNestedChildren(nestedBlocks, headers)
        }),
      )
    }
  }

  await Promise.all(childFetchTasks)
}

// ── Sub-page card extraction ───────────────────────────────────

interface SubPageCard {
  pageId: string
  title: string
  icon: string | null
  coverUrl: string | null
  blockCount: number
  childCount: number
  direction: 'child'
}

/** Walk a parsed page block tree and extract sub-page summaries. */
function extractSubPageCards(page: Record<string, unknown>): SubPageCard[] {
  const cards: SubPageCard[] = []

  function walk(blocks: unknown[]): void {
    if (!Array.isArray(blocks)) return
    for (const b of blocks) {
      const block = b as Record<string, unknown>
      const type = block.type as string
      if (type === 'child_page') {
        cards.push({
          pageId: block.id as string,
          title: (block.title as string) || '无标题',
          icon: (block.icon as string) ?? null,
          coverUrl: (block.coverUrl as string) ?? null,
          blockCount: (block.blockCount as number) ?? 0,
          childCount: (block.childCount as number) ?? 0,
          direction: 'child',
        })
      }
      if (block.children && Array.isArray(block.children)) {
        walk(block.children as unknown[])
      }
    }
  }

  walk((page.blocks || []) as unknown[])
  return cards
}

/** Scan all pages in the same batch for child_page references to targetPageId. */
async function buildBacklinks(
  rootPageId: string,
  date: string,
  targetPageId: string,
): Promise<SubPageCard[]> {
  const batchDir = join(JSON_DIR, rootPageId, date)
  if (!existsSync(batchDir)) return []

  const cards: SubPageCard[] = []
  let pageDirs: string[]
  try {
    pageDirs = await readdir(batchDir)
  } catch {
    return []
  }

  for (const dir of pageDirs) {
    if (dir === 'index.json') continue
    const pageFile = join(batchDir, dir, 'page.json')
    const page = await readJsonSafe(pageFile) as Record<string, unknown> | null
    if (!page || (page.pageId as string) === targetPageId) continue

    const blocks = page.blocks as unknown[] | undefined
    if (!Array.isArray(blocks)) continue

    let found = false
    function walk(b: unknown[]): void {
      for (const item of b) {
        const block = item as Record<string, unknown>
        if (block.type === 'child_page' && (block.id as string) === targetPageId) {
          found = true
          return
        }
        if (block.children && Array.isArray(block.children)) {
          walk(block.children as unknown[])
          if (found) return
        }
      }
    }
    walk(blocks)

    if (found) {
      cards.push({
        pageId: page.pageId as string,
        title: (page.title as string) || '无标题',
        icon: (page.icon as string) ?? null,
        coverUrl: (page.cover as Record<string, unknown>)?.['url'] as string ?? null,
        blockCount: Array.isArray(blocks) ? blocks.length : 0,
        childCount: 0,
        direction: 'child' as const,
      })
    }
  }

  return cards
}

async function rmRecursive(dirPath: string): Promise<void> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        await rmRecursive(fullPath)
      } else {
        await unlink(fullPath)
      }
    }
    await unlink(dirPath)
  } catch {
    // ignore if doesn't exist
  }
}

// ── Plugin ───────────────────────────────────────────────────────

export function notionApiPlugin(): Plugin {
  return {
    name: 'notion-api-plugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, _res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next()
        }

        // Build a minimal Request from the node http request
        const url = `http://localhost${req.url}`
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers.set(k, v)
          else if (Array.isArray(v)) headers.set(k, v.join(', '))
        }

        let body: string | undefined
        const chunks: Buffer[] = []
        await new Promise<void>((resolve) => {
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            body = Buffer.concat(chunks).toString()
            resolve()
          })
        })

        const request = new Request(url, {
          method: req.method,
          headers,
          body: body || undefined,
        })

        try {
          const response = await handleRequest(request)
          _res.statusCode = response.status
          response.headers.forEach((value, key) => {
            _res.setHeader(key, value)
          })
          const resBody = await response.text()
          _res.end(resBody)
        } catch (e) {
          console.error('[notion-api-plugin] error:', e)
          _res.statusCode = 500
          _res.setHeader('Content-Type', 'application/json')
          _res.end(JSON.stringify({ error: 'Internal server error' }))
        }
      })
    },
  }
}
