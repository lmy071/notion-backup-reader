import type { Plugin, ViteDevServer } from 'vite'
import { readFile, writeFile, mkdir, readdir, stat, unlink, appendFile } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

// ── 常量定义 ──────────────────────────────────────────────────────

/** JSON 数据根目录（备份存储） */
const JSON_DIR = join(process.cwd(), 'json')
/** 图片存储目录 */
const IMAGES_DIR = join(process.cwd(), 'images')
/** 日志文件目录 */
const LOG_DIR = join(process.cwd(), 'log')
/** 每个根页面最多保留的版本数 */
const MAX_VERSIONS = 10
/** 最多保留的日志文件数 */
const MAX_LOG_FILES = 30

// ── JSON 文件助手 ────────────────────────────────────────────────

/** 返回 JSON 格式的 HTTP 响应 */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 返回错误响应 */
function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status)
}

/** 读取并解析 JSON 文件 */
async function readJson(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

/** 安全读取 JSON 文件（不存在或解析失败返回 null） */
async function readJsonSafe(filePath: string): Promise<unknown> {
  try {
    return await readJson(filePath)
  } catch {
    return null
  }
}

/** 写入 JSON 文件（自动创建父目录） */
async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

/** 列出目录下的子目录名 */
async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

// ── 日志助手 ──────────────────────────────────────────────────────

/** 向日志文件追加一行 */
async function appendToLog(fileName: string, line: string): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true })
  const filePath = join(LOG_DIR, fileName)
  await appendFile(filePath, line, 'utf-8')
}

/**
 * 读取日志。
 * - 指定 date 时读取对应日期的日志文件
 * - 未指定 date 时读取最近 10 个日志文件
 */
async function readLogs(
  date?: string,
  _level?: string,
  _pageId?: string,
): Promise<unknown[]> {
  // 按日期读取单个日志文件
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

  // 读取最近 10 个日志文件
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
      // 跳过损坏的日志文件
    }
  }
  return results
}

/**
 * 清理过期的日志文件。
 * 按文件名排序（YYYY-MM-DD.log），删除超出 MAX_LOG_FILES 的最旧文件。
 */
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

// ── 图片下载与替换 ──────────────────────────────────────────────────

/** Notion S3 文件 URL 正则（匹配 AWS S3 签名 URL） */
const NOTION_S3_RE = /https:\/\/prod-files-secure\.s3[^"'\s]+/g

/**
 * 深度遍历 JSON，将所有 Notion S3 图片 URL 下载到本地 images/ 目录，
 * 并替换为本地路径 `/api/images/{hash}.{ext}`。
 */
async function downloadAndReplaceImages(data: unknown): Promise<void> {
  if (!data || typeof data !== 'object') return

  if (Array.isArray(data)) {
    for (const item of data) await downloadAndReplaceImages(item)
    return
  }

  const obj = data as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    if (typeof val === 'string' && NOTION_S3_RE.test(val)) {
      obj[key] = await replaceUrlsInString(val)
    } else if (typeof val === 'object') {
      await downloadAndReplaceImages(val)
    }
  }
}

/**
 * 替换字符串中的所有 Notion S3 URL 为本地路径。
 * 同一 URL 只下载一次（基于内容哈希去重）。
 */
async function replaceUrlsInString(str: string): Promise<string> {
  const urls = str.match(NOTION_S3_RE) || []
  let result = str
  for (const url of urls) {
    const localPath = await downloadImage(url)
    if (localPath) result = result.replace(url, localPath)
  }
  return result
}

/** 下载单张图片到本地，返回本地路径。失败时返回空字符串（保留原 URL）。 */
async function downloadImage(remoteUrl: string): Promise<string> {
  let baseName = 'image'
  try {
    const urlObj = new URL(remoteUrl)
    const pathParts = urlObj.pathname.split('/')
    baseName = decodeURIComponent(pathParts[pathParts.length - 1]) || 'image'
  } catch { /* ignore */ }

  const hash = createHash('md5').update(remoteUrl).digest('hex').slice(0, 12)
  const ext = extname(baseName).slice(0, 8).toLowerCase() || '.bin'
  const fileName = `${hash}${ext}`
  const filePath = join(IMAGES_DIR, fileName)

  if (existsSync(filePath)) return `/api/images/${fileName}`

  try {
    const res = await fetch(remoteUrl)
    if (!res.ok) return ''
    const buffer = Buffer.from(await res.arrayBuffer())
    await mkdir(IMAGES_DIR, { recursive: true })
    await writeFile(filePath, buffer)
    return `/api/images/${fileName}`
  } catch {
    return ''
  }
}

// ── API 路由分发 ─────────────────────────────────────────────────

// URL 路径 → 路由参数映射：
// GET  /api/storage/page/:rootPageId/:date/:pageId         — 读取页面
// GET  /api/storage/batch-index/:rootPageId/:date          — 批次索引
// POST /api/storage/save                                   — 保存同步结果
// GET  /api/storage/database/:rootPageId/:date/:pageId/:db — 读取数据库
// GET  /api/storage/backlinks/:rootPageId/:date/:pageId    — 反向链接
// GET  /api/storage/versions/:rootPageId                   — 版本列表
// DELETE /api/storage/remove/:rootPageId                   — 删除整个根页面备份
// DELETE /api/storage/cleanup/:rootPageId                  — 清理旧版本
// POST /api/storage/append-log                             — 追加日志
// GET  /api/storage/logs                                   — 查询日志
// POST /api/storage/cleanup-logs                           — 清理日志
// POST /api/notion/*                                       — Notion API 代理

/** 总路由分发：根据 method + path 分发到对应的处理逻辑 */
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method
  const segments = path.split('/').filter(Boolean)

  // ── GET /api/images/:fileName — 提供本地缓存的图片 ──
  if (method === 'GET' && path.startsWith('/api/images/')) {
    const fileName = segments[2]
    if (!fileName || fileName.includes('..') || fileName.includes('/')) {
      return errorResponse('Invalid filename', 400)
    }
    const filePath = join(IMAGES_DIR, fileName)
    try {
      const buffer = await readFile(filePath)
      const contentType = getContentType(extname(fileName))
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch {
      return errorResponse('Image not found', 404)
    }
  }

  // ── GET /api/storage/index — 全局索引（首页卡片列表） ──
  if (method === 'GET' && path === '/api/storage/index') {
    return jsonResponse(await buildGlobalIndex())
  }

  // ── GET /api/storage/page/:rootPageId/:date/:pageId — 读取单个页面 ──
  if (method === 'GET' && path.startsWith('/api/storage/page/')) {
    // segments = ['api','storage','page','rootPageId','date','pageId',...]
    if (segments.length < 6) return errorResponse('Invalid path', 400)
    const rootPageId = segments[3]
    const date = segments[4]
    const pageId = segments.slice(5).join('/')

    // 读取页面的 page.json
    const pageDir = join(JSON_DIR, rootPageId, date, pageId)
    const page = await readJsonSafe(join(pageDir, 'page.json'))
    if (!page) return jsonResponse(null, 404)

    // 读取子页面（children 目录）
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

    // 读取内嵌数据库（databases 目录）
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

    // 返回页面 + 子页面 + 数据库 + 子页面摘要
    return jsonResponse({ page, children, databases, subPages: extractSubPageCards(page) })
  }

  // ── GET /api/storage/batch-index/:rootPageId/:date — 批次索引 ──
  if (method === 'GET' && path.startsWith('/api/storage/batch-index/')) {
    if (segments.length < 6) return errorResponse('Invalid path', 400)
    const rootPageId = segments[3]
    const date = segments[4]
    const indexFile = join(JSON_DIR, rootPageId, date, 'index.json')
    const index = await readJsonSafe(indexFile)
    if (index) return jsonResponse(index)
    return jsonResponse(null, 404)
  }

  // ── POST /api/storage/save — 批量保存同步结果 ──
  // 请求体: { rootPageId, pages: [{ page, children?, databases? }] }
  if (method === 'POST' && path === '/api/storage/save') {
    const body = (await req.json()) as Record<string, unknown>
    const rootPageId = body.rootPageId as string
    const pages = body.pages as Array<Record<string, unknown>> | undefined

    if (!rootPageId) return errorResponse('Missing rootPageId', 400)
    if (!pages || pages.length === 0) return errorResponse('Missing pages', 400)

    // 下载所有远程图片到本地 images/ 目录，替换 URL
    await downloadAndReplaceImages(pages)

    const today = new Date().toISOString().slice(0, 10)
    const batchDir = join(JSON_DIR, rootPageId, today)
    const batchEntries: unknown[] = []

    for (const entry of pages) {
      const page = entry.page as Record<string, unknown>
      const pageId = page?.pageId as string | undefined
      if (!pageId) continue

      const pageDir = join(batchDir, pageId)

      // 保存主页面 JSON
      await writeJson(join(pageDir, 'page.json'), page)

      // 保存子页面（children 目录）
      const children = entry.children as Record<string, unknown> | undefined
      const childrenEntries = children ? Object.keys(children) : []
      if (children && childrenEntries.length > 0) {
        const childrenDir = join(pageDir, 'children')
        for (const [childId, childData] of Object.entries(children)) {
          await writeJson(join(childrenDir, `${childId}.json`), childData)
        }
      }

      // 保存内嵌数据库（databases 目录）
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

      // 保存元信息（meta.json）
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

      // 构建批次条目（供首页 index.json 使用）
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

    // 保存批次摘要（batchDir/index.json）
    const batchIndex = {
      version: 1,
      rootPageId,
      date: today,
      syncedAt: new Date().toISOString(),
      pages: batchEntries,
    }
    await writeJson(join(batchDir, 'index.json'), batchIndex)

    // 清理过旧版本（超过 MAX_VERSIONS 的日期目录）
    const allDates = (await listDirs(join(JSON_DIR, rootPageId))).sort().reverse()
    for (const oldDate of allDates.slice(MAX_VERSIONS)) {
      await rmRecursive(join(JSON_DIR, rootPageId, oldDate))
    }

    return jsonResponse({ ok: true })
  }

  // ── GET /api/storage/database/:rootPageId/:date/:pageId/:databaseId — 读取数据库 ──
  if (method === 'GET' && path.startsWith('/api/storage/database/')) {
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

  // ── GET /api/storage/backlinks/:rootPageId/:date/:pageId — 反向链接 ──
  if (method === 'GET' && path.startsWith('/api/storage/backlinks/')) {
    if (segments.length < 7) return errorResponse('Invalid path', 400)
    const rootPageId = segments[3]
    const date = segments[4]
    const pageId = segments.slice(5).join('/')
    return jsonResponse(await buildBacklinks(rootPageId, date, pageId))
  }

  // ── GET /api/storage/versions/:rootPageId — 版本列表 ──
  if (method === 'GET' && path.startsWith('/api/storage/versions/')) {
    const rootPageId = segments[3]
    const versions = (await listDirs(join(JSON_DIR, rootPageId))).sort().reverse()
    return jsonResponse(versions)
  }

  // ── DELETE /api/storage/remove/:rootPageId — 删除整个根页面备份 ──
  if (method === 'DELETE' && path.startsWith('/api/storage/remove/')) {
    const rootPageId = segments[3]
    const rootDir = join(JSON_DIR, rootPageId)
    if (existsSync(rootDir)) {
      await rmRecursive(rootDir)
    }
    return jsonResponse({ ok: true })
  }

  // ── DELETE /api/storage/cleanup/:rootPageId — 清理旧版本 ──
  if (method === 'DELETE' && path.startsWith('/api/storage/cleanup/')) {
    const rootPageId = segments[3]
    const allDates = (await listDirs(join(JSON_DIR, rootPageId))).sort().reverse()
    for (const oldDate of allDates.slice(MAX_VERSIONS)) {
      await rmRecursive(join(JSON_DIR, rootPageId, oldDate))
    }
    return jsonResponse({ ok: true })
  }

  // ── POST /api/storage/append-log — 追加日志行 ──
  if (method === 'POST' && path === '/api/storage/append-log') {
    const body = (await req.json()) as { fileName: string; line: string }
    await appendToLog(body.fileName, body.line)
    return jsonResponse({ ok: true })
  }

  // ── GET /api/storage/logs — 查询日志 ──
  if (method === 'GET' && path === '/api/storage/logs') {
    const date = url.searchParams.get('date') ?? undefined
    const level = url.searchParams.get('level') ?? undefined
    const pageId = url.searchParams.get('pageId') ?? undefined
    const logs = await readLogs(date, level, pageId)
    return jsonResponse(logs)
  }

  // ── POST /api/storage/cleanup-logs — 清理过期日志 ──
  if (method === 'POST' && path === '/api/storage/cleanup-logs') {
    await cleanupLogs()
    return jsonResponse({ ok: true })
  }

  // ── GET /api/images/:filename — 提供本地缓存的图片 ──
  if (method === 'GET' && path.startsWith('/api/images/')) {
    const filename = segments.slice(2).join('/')
    const imagePath = join(IMAGES_DIR, filename)
    try {
      const buf = await readFile(imagePath)
      const ext = extname(filename).toLowerCase()
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon',
      }
      const mime = mimeMap[ext] ?? 'application/octet-stream'
      return new Response(buf, {
        status: 200,
        headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000, immutable' },
      })
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  }

  // ── /api/notion/* — 转发到 Notion API 代理 ──
  if (path.startsWith('/api/notion/')) {
    return handleNotionProxy(req)
  }

  // 未匹配任何路由
  return new Response('Not Found', { status: 404 })
}

// ── Notion API 代理 ───────────────────────────────────────────────

/** Notion REST API 基础地址 */
const NOTION_API_BASE = 'https://api.notion.com/v1'
/** Notion API 版本 */
const NOTION_VERSION = '2022-06-28'

/**
 * 构建全局索引。
 * 扫描 json/{rootPageId}/{date}/index.json，聚合所有批次的页面摘要，
 * 供首页「已备份页面」列表使用。
 */
async function buildGlobalIndex(): Promise<Record<string, unknown>> {
  const batches: unknown[] = []

  // 读取所有根页面目录
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

    // 按日期降序遍历
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

/**
 * Notion API 代理分发。
 * 浏览器无法直连 api.notion.com（CORS 限制），
 * 所有 Notion API 请求由 Vite 中间件转发，apiKey 通过 X-Notion-Token header 传递。
 */
async function handleNotionProxy(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const method = req.method
  const path = url.pathname

  // 从请求头提取 API token
  const notionToken = req.headers.get('X-Notion-Token')
  if (!notionToken) {
    return errorResponse('Missing X-Notion-Token header (set apiKey in config)', 401)
  }

  // 构造 Notion API 公共请求头
  const commonHeaders: Record<string, string> = {
    'Authorization': `Bearer ${notionToken}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }

  try {
    // ── POST /api/notion/test-connection — 测试连接（调用 /users/me 验证 token 有效性） ──
    if (method === 'POST' && path === '/api/notion/test-connection') {
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

    // ── POST /api/notion/fetch-page — 获取 Notion 页面原始数据（页面元数据 + blocks） ──
    if (method === 'POST' && path === '/api/notion/fetch-page') {
      const body = await req.json() as { pageId: string }
      const { pageId } = body

      // 并行请求页面元数据和所有 blocks
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

    // ── POST /api/notion/fetch-block-children — 获取 block 的子节点 ──
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

    // ── POST /api/notion/fetch-database — 查询数据库（获取所有行） ──
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

    // ── POST /api/notion/fetch-database-schema — 获取数据库 schema 定义 ──
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

    // ── POST /api/notion/inspect-database — 综合检查（同时返回 schema + query 原始响应） ──
    // 用于诊断数据库权限、权限不足等问题，保留完整的 Notion API 返回
    if (method === 'POST' && path === '/api/notion/inspect-database') {
      const body = await req.json() as { databaseId: string }
      const { databaseId } = body

      // 并行请求 schema 和 query
      const [schemaRes, queryRes] = await Promise.all([
        fetch(`${NOTION_API_BASE}/databases/${databaseId}`, { headers: commonHeaders }),
        fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`,
          { method: 'POST', headers: commonHeaders, body: JSON.stringify({ page_size: 100 }) },
        ),
      ])

      const schemaText = await schemaRes.text()
      const queryText = await queryRes.text()

      return jsonResponse({
        databaseId,
        schema: {
          status: schemaRes.status,
          ok: schemaRes.ok,
          body: tryJsonParse(schemaText),
        },
        query: {
          status: queryRes.status,
          ok: queryRes.ok,
          body: tryJsonParse(queryText),
        },
      })
    }

    return errorResponse(`Unknown Notion proxy endpoint: ${path}`, 404)
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    return errorResponse(`Notion proxy error: ${errMsg}`)
  }
}

/**
 * 分页拉取 block 的所有子节点。
 * 处理 Notion API 分页（cursor-based），并递归拉取嵌套子块（toggle、column 等）。
 */
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

  // 拉取嵌套子块（toggle/column_list 等内嵌 children）
  await fetchNestedChildren(allBlocks, headers)

  return allBlocks
}

/**
 * 需要递归拉取嵌套子块的 block 类型白名单。
 * Notion API 的 /blocks/{id}/children 只返回顶层块，
 * toggle、column、table 等类型的 children 字段为 null，
 * 需要额外调用 /blocks/{block_id}/children 获取。
 */
const NESTED_BLOCK_TYPES = new Set([
  'toggle',
  'column_list',
  'column',
  'bulleted_list_item',
  'numbered_list_item',
  'synced_block',
  'table',
])

/**
 * 递归拉取 has_children 块的嵌套子内容。
 * 将拉取结果填充到对应 block 的 children 字段中。
 */
async function fetchNestedChildren(
  blocks: unknown[],
  headers: Record<string, string>,
): Promise<void> {
  if (!blocks || blocks.length === 0) return

  const childFetchTasks: Promise<void>[] = []

  for (const block of blocks) {
    const b = block as Record<string, unknown>
    // has_children = true 但 children 为 null → 需要拉取
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

// ── 子页面摘要提取 ────────────────────────────────────────────────

/** 子页面摘要 */
interface SubPageCard {
  pageId: string
  title: string
  icon: string | null
  coverUrl: string | null
  blockCount: number
  childCount: number
  direction: 'child'
}

/**
 * 在已解析的页面 block 树中提取所有 child_page 类型的子页面摘要。
 * 递归扫描整棵 block 树（包括嵌套子块）。
 */
function extractSubPageCards(page: Record<string, unknown>): SubPageCard[] {
  const cards: SubPageCard[] = []

  /** 递归遍历 blocks 数组 */
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
      // 递归扫描嵌套子块
      if (block.children && Array.isArray(block.children)) {
        walk(block.children as unknown[])
      }
    }
  }

  walk((page.blocks || []) as unknown[])
  return cards
}

// ── 反向链接 ──────────────────────────────────────────────────────

/**
 * 构建反向链接：扫描同批次下所有页面，找出引用了 targetPageId 的页面。
 * 反向链接表示"哪些页面链接到我"。
 */
async function buildBacklinks(
  rootPageId: string,
  date: string,
  targetPageId: string,
): Promise<SubPageCard[]> {
  const batchDir = join(JSON_DIR, rootPageId, date)
  if (!existsSync(batchDir)) return []

  const cards: SubPageCard[] = []

  // 列出批次下所有页面目录
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

    // 在 blocks 树中搜索 child_page 类型且 id === targetPageId 的块
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

// ── 文件系统助手 ──────────────────────────────────────────────────

/** 根据文件扩展名返回 MIME type */
function getContentType(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.avif': 'image/avif',
  }
  return map[ext.toLowerCase()] || 'application/octet-stream'
}

/** 递归删除目录及其所有内容 */
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
    // 删除空目录本身（注意：用 unlink 而非 rmdir，因为 Windows 兼容性需要）
    await unlink(dirPath)
  } catch {
    // 目录不存在时忽略
  }
}

/**
 * 尝试将字符串解析为 JSON。
 * 解析失败时返回原始字符串。
 */
function tryJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

// ── Vite 插件定义 ─────────────────────────────────────────────────

/**
 * Vite 中间件插件。
 * 拦截 /api/* 请求，将 Node.js IncomingMessage 转换为标准 Request，
 * 分发到 handleRequest 处理，再将 Response 写回 Node.js ServerResponse。
 */
export function notionApiPlugin(): Plugin {
  return {
    name: 'notion-api-plugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, _res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next()
        }

        // 从 Node.js 原生请求构造标准 Web Request
        const url = `http://localhost${req.url}`
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers.set(k, v)
          else if (Array.isArray(v)) headers.set(k, v.join(', '))
        }

        // 读取请求体
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

        // 分发请求 → 写回响应
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
