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

/**
 * 将 Notion page ID 统一为 UUID 带破折号格式（与磁盘目录结构一致）。
 * 输入: "39f20a96745980a2b492c1f55148c845" 或 "39f20a96-7459-80a2-b492-c1f55148c845"
 * 输出: "39f20a96-7459-80a2-b492-c1f55148c845"
 */
function normalizePageId(id: string): string {
  const hex = id.replace(/-/g, '')
  if (hex.length !== 32) return id // 非标准 ID，原样返回
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

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

/** Notion S3 文件 URL */
const NOTION_S3_RE = /https:\/\/prod-files-secure\.s3[^"'\s]+/g

/** Gitee raw 图片 URL */
const GITEE_IMAGE_RE =
  /https:\/\/gitee\.com\/[^"'\s]+\/[^"'\s]+\.(?:png|jpe?g|gif|webp|svg|bmp|ico)(?:\?[^"'\s]*)?/g

/** 需要下载替换的外部文件 URL 模式列表 */
const EXTERNAL_FILE_URL_PATTERNS: RegExp[] = [NOTION_S3_RE, GITEE_IMAGE_RE]

/** 检查字符串是否匹配任一外部文件 URL 模式 */
function matchesExternalUrl(s: string): boolean {
  return EXTERNAL_FILE_URL_PATTERNS.some(re => re.test(s))
}

/** 提取字符串中所有匹配的外部文件 URL（去重） */
function extractExternalUrls(s: string): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const re of EXTERNAL_FILE_URL_PATTERNS) {
    re.lastIndex = 0
    for (const m of s.matchAll(re)) {
      if (!seen.has(m[0])) {
        seen.add(m[0])
        urls.push(m[0])
      }
    }
  }
  return urls
}

/**
 * 深度遍历 JSON，将所有外部图片 URL 下载到本地 images/{rootPageId}/ 目录，
 * 并替换为本地路径 `/api/images/{rootPageId}/{hash}.{ext}`。
 */
async function downloadAndReplaceImages(data: unknown, rootPageId: string): Promise<void> {
  if (!data || typeof data !== 'object') return

  if (Array.isArray(data)) {
    for (const item of data) await downloadAndReplaceImages(item, rootPageId)
    return
  }

  const obj = data as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    if (typeof val === 'string' && matchesExternalUrl(val)) {
      obj[key] = await replaceUrlsInString(val, rootPageId)
    } else if (typeof val === 'object') {
      await downloadAndReplaceImages(val, rootPageId)
    }
  }
}

/**
 * 替换字符串中的所有外部文件 URL 为本地路径。
 */
async function replaceUrlsInString(str: string, rootPageId: string): Promise<string> {
  const urls = extractExternalUrls(str)
  let result = str
  for (const url of urls) {
    const localPath = await downloadImage(url, rootPageId)
    if (localPath) result = result.replace(url, localPath)
  }
  return result
}

/** 下载单张图片到本地 images/{rootPageId}/，返回本地路径。失败时保留原 URL。 */
async function downloadImage(remoteUrl: string, rootPageId: string): Promise<string> {
  let baseName = 'image'
  try {
    const urlObj = new URL(remoteUrl)
    const pathParts = urlObj.pathname.split('/')
    baseName = decodeURIComponent(pathParts[pathParts.length - 1]) || 'image'
  } catch { /* ignore */ }

  // 基于 URL pathname 哈希生成唯一文件名（剔除 query string，避免 presigned URL 签名变化导致重复下载）
  const stableKey = new URL(remoteUrl).pathname
  const hash = createHash('md5').update(stableKey).digest('hex').slice(0, 12)
  const ext = extname(baseName).slice(0, 8).toLowerCase() || '.bin'
  const fileName = `${hash}${ext}`
  const rootDir = join(IMAGES_DIR, rootPageId)
  const filePath = join(rootDir, fileName)

  // 文件已存在则跳过下载
  if (existsSync(filePath)) return `/api/images/${rootPageId}/${fileName}`

  try {
    const res = await fetch(remoteUrl)
    if (!res.ok) return ''
    const buffer = Buffer.from(await res.arrayBuffer())
    await mkdir(rootDir, { recursive: true })
    await writeFile(filePath, buffer)
    return `/api/images/${rootPageId}/${fileName}`
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
// POST /api/images/import                                  — 暂存导入图片
// GET  /api/storage/logs                                   — 查询日志
// POST /api/storage/cleanup-logs                           — 清理日志
// POST /api/notion/*                                       — Notion API 代理

/** 总路由分发：根据 method + path 分发到对应的处理逻辑 */
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method
  const segments = path.split('/').filter(Boolean)

  // ── GET /api/images/:rootPageId/:fileName — 提供本地缓存的图片 ──
  if (method === 'GET' && path.startsWith('/api/images/')) {
    // segments = ['api','images','rootPageId','fileName']
    if (segments.length < 4) return errorResponse('Invalid path', 400)
    const rootPageId = segments[2]
    const fileName = segments[3]
    if (rootPageId.includes('..') || fileName.includes('..')) {
      return errorResponse('Invalid path', 400)
    }
    const filePath = join(IMAGES_DIR, rootPageId, fileName)
    try {
      const buffer = await readFile(filePath)
      const contentType = getContentType(extname(fileName))
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
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

  // ── POST /api/images/import — 暂存导入图片（返回外部 URL 供 Notion files 属性使用） ──
  if (method === 'POST' && path === '/api/images/import') {
    return handleImageImport(req)
  }

  // ── POST /api/db-import/create-page — 代理创建 Notion 数据库页面（绕 CORS） ──
  if (method === 'POST' && path === '/api/db-import/create-page') {
    return handleCreateDatabasePage(req)
  }

  // ── POST /api/sync/sse — 全链路 SSE 同步（fetch→parse→save 一站式流式输出） ──
  if (method === 'POST' && path === '/api/sync/sse') {
    return handleSyncSSE(req)
  }

  // ── GET /api/storage/page/:rootPageId/:date/:pageId — 读取单个页面 ──
  if (method === 'GET' && path.startsWith('/api/storage/page/')) {
    // segments = ['api','storage','page','rootPageId','date','pageId',...]
    if (segments.length < 6) return errorResponse('Invalid path', 400)
    const rootPageId = normalizePageId(segments[3])
    const date = segments[4]
    const pageId = normalizePageId(segments.slice(5).join('/'))

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
    return jsonResponse({ page, children, databases, subPages: extractSubPageCards(page as Record<string, unknown>) })
  }

  // ── GET /api/storage/batch-index/:rootPageId/:date — 批次索引 ──
  if (method === 'GET' && path.startsWith('/api/storage/batch-index/')) {
    if (segments.length < 6) return errorResponse('Invalid path', 400)
    const rootPageId = normalizePageId(segments[3])
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
    const result = await handleSave(body)
    return jsonResponse(result)
  }

  // ── POST /api/storage/save-sse — 批量保存（SSE 实时输出进度） ──
  if (method === 'POST' && path === '/api/storage/save-sse') {
    const body = (await req.json()) as Record<string, unknown>
    return handleSaveSSE(body)
  }

  // ── GET /api/storage/database/:rootPageId/:date/:pageId/:databaseId — 读取数据库 ──
  if (method === 'GET' && path.startsWith('/api/storage/database/')) {
    if (segments.length < 7) return errorResponse('Invalid path', 400)
    const rootPageId = normalizePageId(segments[3])
    const date = segments[4]
    const pageId = normalizePageId(segments[5])
    const databaseId = segments[6]

    const dbPath = join(JSON_DIR, rootPageId, date, pageId, 'databases', `${databaseId}.json`)
    const db = await readJsonSafe(dbPath)
    if (!db) return jsonResponse(null, 404)
    return jsonResponse(db)
  }

  // ── GET /api/storage/backlinks/:rootPageId/:date/:pageId — 反向链接 ──
  if (method === 'GET' && path.startsWith('/api/storage/backlinks/')) {
    if (segments.length < 6) return errorResponse('Invalid path', 400)
    const rootPageId = normalizePageId(segments[3])
    const date = segments[4]
    const pageId = normalizePageId(segments.slice(5).join('/'))
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
    const rootPageId = normalizePageId(segments[3])
    const rootDir = join(JSON_DIR, rootPageId)
    if (existsSync(rootDir)) {
      await rmRecursive(rootDir)
    }
    // 同时删除该根页面的图片缓存
    const imagesRootDir = join(IMAGES_DIR, rootPageId)
    if (existsSync(imagesRootDir)) {
      await rmRecursive(imagesRootDir)
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
        headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' },
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

// ═══════════════════════════════════════════════════════════════════
//  SSE 同步引擎（服务端全链路）
// ═══════════════════════════════════════════════════════════════════

/** 逐字发送日志到 SSE 流 */
const CHAR_DELAY = 30 // 逐字间隔（ms），匹配前端视觉刷新

async function snkLog(ctrl: ReadableStreamDefaultController, message: string): Promise<void> {
  const encoder = new TextEncoder()
  for (const char of message) {
    ctrl.enqueue(encoder.encode(sseEvent('log', { chunk: char })))
    // 每条 SSE 帧后让出宏任务：确保 Node.js HTTP 层 flush 到 TCP
    await new Promise<void>(r => setTimeout(r, CHAR_DELAY))
  }
  // 行结束信号
  ctrl.enqueue(encoder.encode(sseEvent('log', { chunk: '\n' })))
  await new Promise<void>(r => setTimeout(r, 0))
}

/** 发送单任务状态 */
function snkTask(ctrl: ReadableStreamDefaultController, task: Record<string, unknown>): void {
  ctrl.enqueue(new TextEncoder().encode(sseEvent('task', task)))
}

// ── POST /api/sync/sse 路由分发 ──

async function handleSyncSSE(req: Request): Promise<Response> {
  const notionToken = req.headers.get('X-Notion-Token')
  if (!notionToken) return errorResponse('Missing X-Notion-Token header', 401)

  const body = await req.json() as { pageIds: string[] }
  const pageIds = body.pageIds
  if (!pageIds || pageIds.length === 0) return errorResponse('Missing pageIds', 400)

  const commonHeaders: Record<string, string> = {
    'Authorization': `Bearer ${notionToken}`,
    'Notion-Version': NOTION_VERSION,
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const log = (msg: string) => snkLog(controller, msg)
      const task = (t: Record<string, unknown>) => snkTask(controller, t)
      const done = (message?: string) => {
        controller.enqueue(encoder.encode(sseEvent('done', { message: message || '同步完成' })))
      }
      const error = (msg: string) => {
        controller.enqueue(encoder.encode(sseEvent('error', { message: msg })))
      }

      try {
        const rootPageId = pageIds[0]
        const visited = new Set<string>()
        const collected: Array<{ page: Record<string, unknown>; databases?: Array<{ databaseId: string; database: Record<string, unknown>; results?: unknown }> }> = []

        await log(`🚀 开始同步 ${pageIds.length} 个页面...\n`)

        // 并发控制参数
        const maxConcurrency = 2
        const minInterval = 350
        let running = 0
        const queue: Array<() => Promise<void>> = []
        let lastReqTime = 0

        const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

        const enqueue = (fn: () => Promise<void>): Promise<void> => {
          return new Promise<void>((resolve, reject) => {
            queue.push(async () => {
              try { await fn(); resolve() } catch (e) { reject(e) }
            })
            pump()
          })
        }

        let pumping = false
        const pump = async () => {
          if (pumping) return
          pumping = true
          try {
            while (queue.length > 0) {
              if (running >= maxConcurrency) {
                await delay(50)
                continue
              }
              const elapsed = Date.now() - lastReqTime
              if (elapsed < minInterval) {
                await delay(minInterval - elapsed)
                continue
              }
              const job = queue.shift()
              if (!job) continue
              running++
              lastReqTime = Date.now()
              job().finally(() => { running--; pump() })
            }
          } finally {
            pumping = false
          }
        }

        // ── 同步单页 ──
        const syncOnePage = async (pageId: string, initialTitle?: string, isChild = false): Promise<void> => {
          if (visited.has(pageId)) return
          visited.add(pageId)

          let title = initialTitle || pageId

          task({ pageId, title, status: 'pending', progress: 0 })

          try {
            await log(`📄 开始同步: ${title}\n`)
            task({ pageId, title, status: 'fetching', progress: 10 })

            // Phase 1: fetch page
            const [pageRes, blocksRes] = await Promise.all([
              fetch(`${NOTION_API_BASE}/pages/${pageId}`, { headers: commonHeaders }),
              fetchBlocks(pageId, commonHeaders),
            ])

            if (!pageRes.ok) {
              const err = await pageRes.text()
              throw new Error(`获取页面失败: ${pageRes.status} ${err}`)
            }

            const pageData = await pageRes.json() as Record<string, unknown>
            const properties = (pageData.properties as Record<string, unknown>) || {}

            // 提取标题
            for (const key of Object.keys(properties)) {
              const prop = properties[key] as Record<string, unknown>
              if (prop?.type === 'title') {
                const titleArr = (prop.title as Array<{ plain_text: string }>) || []
                if (titleArr.length > 0) {
                  title = titleArr.map(t => t.plain_text).join('') || title
                }
                break
              }
            }

            task({ pageId, title, status: 'fetching', progress: 50 })

            const rawBlocks = (blocksRes || []) as Array<Record<string, unknown>>

            const rawPage = {
              pageId: pageData.id as string || pageId,
              title,
              blocks: rawBlocks,
              rawPageData: pageData,
            }

            // Phase 2: store raw data
            const pageBlockMap: Record<string, Record<string, unknown>> = {}
            for (const rawBlock of rawBlocks) {
              pageBlockMap[(rawBlock as Record<string, unknown>).id as string] = rawBlock as Record<string, unknown>
            }

            // Phase 3: fetch databases
            const databases: Array<{ databaseId: string; database: Record<string, unknown> }> = []
            for (const rawBlock of rawBlocks) {
              const b = rawBlock as Record<string, unknown>
              if (b.type === 'child_database') {
                const dbId = b.id as string
                const dbTitle = ((b as { child_database?: { title?: string } }).child_database?.title as string) || dbId
                try {
                  await log(`🗄 获取数据库: ${dbTitle}\n`)
                  const [schemaRes, queryRes] = await Promise.all([
                    fetch(`${NOTION_API_BASE}/databases/${dbId}`, { headers: commonHeaders }),
                    fetch(`${NOTION_API_BASE}/databases/${dbId}/query`, {
                      method: 'POST', headers: commonHeaders, body: JSON.stringify({ page_size: 100 })
                    }),
                  ])
                  if (schemaRes.ok && queryRes.ok) {
                    const schema = await schemaRes.json() as Record<string, unknown>
                    const query = await queryRes.json() as Record<string, unknown>
                    const db = {
                      databaseId: dbId,
                      title: dbTitle,
                      schema: schema,
                      results: (query as { results?: unknown }).results ?? [],
                    }
                    databases.push({ databaseId: dbId, database: db })
                    await log(`✅ 数据库获取完成 (${Array.isArray(db.results) ? db.results.length : 0} 条记录)\n`)
                  }
                } catch (e) {
                  await log(`⚠️ 数据库获取失败: ${e instanceof Error ? e.message : String(e)}\n`)
                }
              }
            }

            collected.push({ page: rawPage, databases: databases.length > 0 ? databases : undefined })

            task({ pageId, title, progress: 80 })

            // Phase 4: detect children
            const children: Array<{ blockId: string; type: string; title: string }> = []
            for (const rawBlock of rawBlocks) {
              const b = rawBlock as Record<string, unknown>
              if ((b.type as string) === 'child_page' || (b.type as string) === 'child_database') {
                const data = b[(b.type as string)] as Record<string, unknown> | undefined
                children.push({
                  blockId: b.id as string,
                  type: b.type as string,
                  title: (data?.title as string) || (b.id as string),
                })
              }
            }

            if (children.length > 0) {
              await log(`📂 ${title} — 发现 ${children.length} 个子页面/数据库\n`)
            }

            task({ pageId, title, status: 'done', progress: 100 })

            // Phase 5: recurse into children (sequential to avoid deadlock)
            for (const child of children) {
              if (visited.has(child.blockId)) continue
              if (child.type === 'child_page') {
                await syncOnePage(child.blockId, child.title, true)
              } else if (child.type === 'child_database') {
                // sync child database pages
                visited.add(child.blockId)
                try {
                  const dbRes = await fetch(
                    `${NOTION_API_BASE}/databases/${child.blockId}/query`,
                    { method: 'POST', headers: commonHeaders, body: JSON.stringify({ page_size: 100 }) },
                  )
                  if (dbRes.ok) {
                    const dbData = await dbRes.json() as Record<string, unknown>
                    const results = (dbData.results || []) as Array<Record<string, unknown>>
                    const subTasks = results
                      .filter(p => !visited.has(p.id as string))
                      .map(p => () => syncOnePage(p.id as string, extractTitle(p), true))
                    if (subTasks.length > 0) {
                      await Promise.all(subTasks.map(fn => enqueue(fn)))
                    }
                  }
                } catch (e) {
                  await log(`⚠️ 子数据库获取失败: ${e instanceof Error ? e.message : String(e)}\n`)
                }
              }
            }

            if (!isChild) {
              await log(`✅ ${title} — 同步完成 (${rawBlocks.length} 个 block)\n`)
            }
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e)
            await log(`❌ ${title} — 同步失败: ${errMsg}\n`)
            task({ pageId, title, status: 'error', progress: 0, error: errMsg })
          }
        }

        function extractTitle(pageData: Record<string, unknown>): string {
          const props = pageData.properties as Record<string, unknown> | undefined
          if (!props) return pageData.id as string || 'unknown'
          for (const key of Object.keys(props)) {
            const p = props[key] as Record<string, unknown>
            if (p?.type === 'title') {
              const arr = (p.title as Array<{ plain_text: string }>) || []
              if (arr.length > 0) return arr.map(t => t.plain_text).join('') || (pageData.id as string)
              break
            }
          }
          return pageData.id as string || 'unknown'
        }

        // ── 启动所有根任务（并发） ──
        const rootTasks = pageIds.map(pid => () => syncOnePage(pid))
        await Promise.all(rootTasks.map(fn => enqueue(fn)))

        // 等待队列完全清空
        while (running > 0 || queue.length > 0) {
          await delay(100)
        }

        // ── 保存 ──
        if (collected.length > 0) {
          await log('💾 开始保存同步结果...\n')

          // 下载图片
          await log('🖼 下载远程图片...\n')
          await downloadAndReplaceImages(collected, rootPageId)
          await log('🖼 图片下载完成\n')

          // 逐页写入
          await performSaveWrites(rootPageId, collected, (_pid: string, _title: string) => {
            // 由于 SSE 已过 here 不用再发任务
          })

          await log('💾 保存完成\n')
        }

        await log('🎉 全部同步任务完成\n')
        done('sync complete')
      } catch (e) {
        error(e instanceof Error ? e.message : String(e))
        await log(`💥 同步中断: ${e instanceof Error ? e.message : String(e)}\n`)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ═══════════════════════════════════════════════════════════════════

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

// ── POST /api/storage/save 核心处理逻辑 ──────────────────────────────

async function handleSave(body: Record<string, unknown>): Promise<{ ok: boolean }> {
  const rootPageId = body.rootPageId as string
  const pages = body.pages as Array<Record<string, unknown>> | undefined
  if (!rootPageId || !pages || pages.length === 0) throw new Error('Missing rootPageId or pages')

  await downloadAndReplaceImages(pages, rootPageId)
  await performSaveWrites(rootPageId, pages)
  return { ok: true }
}

// ── POST /api/storage/save-sse SSE 流式处理 ──────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

async function handleSaveSSE(body: Record<string, unknown>): Promise<Response> {
  const rootPageId = body.rootPageId as string
  const pages = body.pages as Array<Record<string, unknown>> | undefined

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(new TextEncoder().encode(sseEvent(event, data)))
      }

      try {
        if (!rootPageId || !pages || pages.length === 0) {
          send('error', { message: 'Missing rootPageId or pages' })
          controller.close()
          return
        }

        const totalSteps = 1 + pages.length // image download + each page write
        let currentStep = 0

        const emit = (event: string, payload: Record<string, unknown> = {}) => {
          currentStep++
          send(event, { ...payload, step: currentStep, total: totalSteps })
        }

        // Step 1: 下载图片
        send('progress', { stage: 'images', message: '正在下载远程图片...', step: 0, total: totalSteps })
        await downloadAndReplaceImages(pages, rootPageId)
        emit('progress', { stage: 'images', message: '图片下载完成', done: false })

        // 保存：逐页写入并发送事件
        await performSaveWrites(rootPageId, pages, (pageId: string, pageTitle: string) => {
          emit('progress', {
            stage: 'saving',
            pageId,
            pageTitle,
            message: `已保存: ${pageTitle || pageId}`,
            done: false,
          })
        })

        send('done', { message: '保存完成', step: totalSteps, total: totalSteps })
      } catch (e) {
        send('error', { message: e instanceof Error ? e.message : String(e) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

/** 执行批量写入（提取为共享函数） */
async function performSaveWrites(
  rootPageId: string,
  pages: Array<Record<string, unknown>>,
  onPageSaved?: (pageId: string, pageTitle: string) => void,
): Promise<void> {
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

    // 构建批次条目
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

    onPageSaved?.(pageId, (page as { title?: string }).title ?? '')
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

  // 清理过旧版本
  const allDates = (await listDirs(join(JSON_DIR, rootPageId))).sort().reverse()
  for (const oldDate of allDates.slice(MAX_VERSIONS)) {
    await rmRecursive(join(JSON_DIR, rootPageId, oldDate))
  }
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

// ── POST /api/images/import 处理器 ───────────────────────────────

/**
 * 接收前端 POST 的 base64 图片数据，写到本地 images/import/ 目录，
 * 返回外部可访问的 URL（供 Notion files 属性的 external.url 使用）。
 *
 * 请求体：{ data: string (base64), extension: string, mimeType: string }
 * 响应体：{ url: string }
 */
async function handleImageImport(req: Request): Promise<Response> {
  try {
    const body = await req.json() as { data?: string; extension?: string; mimeType?: string }
    if (!body.data) return errorResponse('Missing data', 400)

    const ext = (body.extension || 'png').replace(/^\./, '')
    const buffer = Buffer.from(body.data, 'base64')

    const importDir = join(IMAGES_DIR, 'import')
    if (!existsSync(importDir)) {
      await mkdir(importDir, { recursive: true })
    }

    const hash = createHash('md5').update(body.data).digest('hex').slice(0, 12)
    const fileName = `${hash}.${ext}`
    const filePath = join(importDir, fileName)

    await writeFile(filePath, new Uint8Array(buffer))

    // 使用请求的 origin 构造 Notion API 可访问的绝对 URL
    const origin = new URL(req.url).origin

    return jsonResponse({
      url: `${origin}/api/images/import/${fileName}`,
    })
  } catch (e) {
    return errorResponse(`Image import error: ${e}`, 500)
  }
}

/**
 * 代理创建 Notion 数据库页面（浏览器端被 CORS 阻止，须经服务端代理）。
 * 请求头需携带 X-Notion-Token。
 */
async function handleCreateDatabasePage(req: Request): Promise<Response> {
  const notionToken = req.headers.get('X-Notion-Token')
  if (!notionToken) {
    return errorResponse('Missing X-Notion-Token header', 401)
  }

  try {
    const body = await req.text()
    const res = await fetch(`${NOTION_API_BASE}/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body,
    })

    if (!res.ok) {
      const err = await res.text()
      return jsonResponse({ ok: false, error: `${res.status}: ${err}` }, res.status)
    }

    return jsonResponse({ ok: true })
  } catch (e) {
    return errorResponse(`Create page error: ${e}`, 500)
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

        // 将 /api/images/* 的 GET 请求提前短路，不读 body
        // 原因：部分 Node 版本下 await new Promise 在无 body GET 上可能阻塞
        // 从 Node.js 原生请求构造标准 Web Request
        const url = `http://localhost${req.url}`
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers.set(k, v)
          else if (Array.isArray(v)) headers.set(k, v.join(', '))
        }

        // 只在有请求体时才读取（POST/PUT/PATCH），GET/HEAD/DELETE 立即构造 Request
        let body: string | undefined
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE') {
          const chunks: Buffer[] = []
          await new Promise<void>((resolve) => {
            req.on('data', (chunk: Buffer) => chunks.push(chunk))
            req.on('end', () => {
              body = Buffer.concat(chunks).toString()
              resolve()
            })
          })
        }

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

          // SSE 响应：直接 pipe ReadableStream，禁用缓冲
          if (response.headers.get('Content-Type') === 'text/event-stream') {
            const reader = response.body!.getReader()
            const decoder = new TextDecoder()
            const pump = async () => {
              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) {
                    _res.end()
                    break
                  }
                  // 立即写入 + flush，不使用缓冲
                  const chunk = typeof value === 'string' ? value : decoder.decode(value, { stream: true })
                  _res.write(chunk)
                  // 强制 flush 到底层 socket
                  if (typeof (_res as unknown as { flushHeaders?: () => void }).flushHeaders === 'function') {
                    ;(_res as unknown as { flush: () => void }).flush?.()
                  }
                }
              } catch {
                _res.end()
              }
            }
            pump()
            return
          }

          // 普通响应：收集全部后一次性发送
          const resBody = await response.arrayBuffer()
          _res.end(Buffer.from(resBody))
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
