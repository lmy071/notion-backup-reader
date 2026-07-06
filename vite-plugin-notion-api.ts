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

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // ── GET /api/storage/index
  if (method === 'GET' && path === '/api/storage/index') {
    const indexPath = join(JSON_DIR, 'index.json')
    const index = await readJsonSafe(indexPath)
    if (index) return jsonResponse(index)
    return jsonResponse({ version: 1, updatedAt: '', pages: [] })
  }

  // ── GET /api/storage/page/:pageId
  if (method === 'GET' && path.startsWith('/api/storage/page/')) {
    const pageId = path.split('/api/storage/page/')[1].split('?')[0]
    const dateParam = url.searchParams.get('date')

    const pageDir = join(JSON_DIR, pageId)
    if (!existsSync(pageDir)) return jsonResponse(null, 404)

    const dates = dateParam ? [dateParam] : (await listDirs(pageDir)).sort().reverse()
    if (dates.length === 0) return jsonResponse(null, 404)

    const latestDate = dates[0]
    const dateDir = join(pageDir, latestDate)

    const page = await readJsonSafe(join(dateDir, 'page.json'))
    if (!page) return jsonResponse(null, 404)

    const children: Record<string, unknown> = {}
    const childrenDir = join(dateDir, 'children')
    if (existsSync(childrenDir)) {
      const childFiles = await readdir(childrenDir)
      for (const childFile of childFiles) {
        const childId = childFile.replace('.json', '')
        const childData = await readJsonSafe(join(childrenDir, childFile))
        if (childData) children[childId] = childData
      }
    }

    return jsonResponse({ page, children, databases: {} })
  }

  // ── POST /api/storage/save
  if (method === 'POST' && path === '/api/storage/save') {
    const body = (await req.json()) as Record<string, unknown>
    const page = body.page as Record<string, unknown> | undefined
    const pageId = page?.pageId as string | undefined

    if (!pageId) return errorResponse('Missing pageId', 400)

    const today = new Date().toISOString().slice(0, 10)
    const dateDir = join(JSON_DIR, pageId, today)

    // Save page.json
    await writeJson(join(dateDir, 'page.json'), page)

    // Save children
    const children = body.children as Record<string, unknown> | undefined
    if (children) {
      const childrenDir = join(dateDir, 'children')
      for (const [childId, childData] of Object.entries(children)) {
        await writeJson(join(childrenDir, `${childId}.json`), childData)
      }
    }

    // Save meta.json
    const blocks = (page as { blocks?: unknown[] })?.blocks
    const childrenEntries = children ? Object.keys(children) : []
    const meta = {
      pageId,
      title: (page as { title?: string }).title ?? '',
      syncedAt: new Date().toISOString(),
      blockCount: Array.isArray(blocks) ? blocks.length : 0,
      childPages: childrenEntries,
      databases: [],
      errors: [],
    }
    await writeJson(join(dateDir, 'meta.json'), meta)

    // Update index.json
    const indexPath = join(JSON_DIR, 'index.json')
    let index = (await readJsonSafe(indexPath)) as Record<string, unknown> | null
    if (!index || typeof index.pages !== 'object') {
      index = { version: 1, updatedAt: '', pages: [] }
    }

    const pages = (index.pages as unknown[]) || []
    const existingIdx = pages.findIndex(
      (p) => (p as Record<string, unknown>).pageId === pageId,
    )

    const pageEntry = {
      pageId,
      title: (page as { title?: string }).title ?? '',
      icon: (page as { icon?: unknown }).icon ?? null,
      coverUrl: (page as { cover?: Record<string, unknown> })?.cover?.url ?? null,
      lastSync: new Date().toISOString(),
      childCount: childrenEntries.length,
      blockCount: Array.isArray(blocks) ? blocks.length : 0,
    }

    if (existingIdx >= 0) {
      pages[existingIdx] = pageEntry
    } else {
      pages.push(pageEntry)
    }

    await writeJson(indexPath, {
      version: (index.version as number) ?? 1,
      updatedAt: new Date().toISOString(),
      pages,
    })

    // Cleanup old versions
    const allDates = (await listDirs(join(JSON_DIR, pageId))).sort().reverse()
    for (const oldDate of allDates.slice(MAX_VERSIONS)) {
      const oldDir = join(JSON_DIR, pageId, oldDate)
      await rmRecursive(oldDir)
    }

    return jsonResponse({ ok: true })
  }

  // ── GET /api/storage/versions/:pageId
  if (method === 'GET' && path.startsWith('/api/storage/versions/')) {
    const pageId = path.split('/api/storage/versions/')[1]
    const versions = (await listDirs(join(JSON_DIR, pageId))).sort().reverse()
    return jsonResponse(versions)
  }

  // ── DELETE /api/storage/cleanup/:pageId
  if (method === 'DELETE' && path.startsWith('/api/storage/cleanup/')) {
    const pageId = path.split('/api/storage/cleanup/')[1]
    const allDates = (await listDirs(join(JSON_DIR, pageId))).sort().reverse()
    for (const oldDate of allDates.slice(MAX_VERSIONS)) {
      await rmRecursive(join(JSON_DIR, pageId, oldDate))
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

  return allBlocks
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
