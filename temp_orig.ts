import type { Plugin, ViteDevServer } from 'vite'
import { readFile, writeFile, mkdir, readdir, stat, unlink, appendFile } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

// 鈹€鈹€ 甯搁噺瀹氫箟 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/** JSON 鏁版嵁鏍圭洰褰曪紙澶囦唤瀛樺偍锛?*/
const JSON_DIR = join(process.cwd(), 'json')
/** 鍥剧墖瀛樺偍鐩綍 */
const IMAGES_DIR = join(process.cwd(), 'images')
/** 鏃ュ織鏂囦欢鐩綍 */
const LOG_DIR = join(process.cwd(), 'log')
/** 姣忎釜鏍归〉闈㈡渶澶氫繚鐣欑殑鐗堟湰鏁?*/
const MAX_VERSIONS = 10
/** 鏈€澶氫繚鐣欑殑鏃ュ織鏂囦欢鏁?*/
const MAX_LOG_FILES = 30

// 鈹€鈹€ JSON 鏂囦欢鍔╂墜 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/** 杩斿洖 JSON 鏍煎紡鐨?HTTP 鍝嶅簲 */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 杩斿洖閿欒鍝嶅簲 */
function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status)
}

/** 璇诲彇骞惰В鏋?JSON 鏂囦欢 */
async function readJson(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

/** 瀹夊叏璇诲彇 JSON 鏂囦欢锛堜笉瀛樺湪鎴栬В鏋愬け璐ヨ繑鍥?null锛?*/
async function readJsonSafe(filePath: string): Promise<unknown> {
  try {
    return await readJson(filePath)
  } catch {
    return null
  }
}

/** 鍐欏叆 JSON 鏂囦欢锛堣嚜鍔ㄥ垱寤虹埗鐩綍锛?*/
async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

/** 鍒楀嚭鐩綍涓嬬殑瀛愮洰褰曞悕 */
async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

// 鈹€鈹€ 鏃ュ織鍔╂墜 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/** 鍚戞棩蹇楁枃浠惰拷鍔犱竴琛?*/
async function appendToLog(fileName: string, line: string): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true })
  const filePath = join(LOG_DIR, fileName)
  await appendFile(filePath, line, 'utf-8')
}

/**
 * 璇诲彇鏃ュ織銆? * - 鎸囧畾 date 鏃惰鍙栧搴旀棩鏈熺殑鏃ュ織鏂囦欢
 * - 鏈寚瀹?date 鏃惰鍙栨渶杩?10 涓棩蹇楁枃浠? */
async function readLogs(
  date?: string,
  _level?: string,
  _pageId?: string,
): Promise<unknown[]> {
  // 鎸夋棩鏈熻鍙栧崟涓棩蹇楁枃浠?  if (date) {
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

  // 璇诲彇鏈€杩?10 涓棩蹇楁枃浠?  let files: string[]
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
      // 璺宠繃鎹熷潖鐨勬棩蹇楁枃浠?    }
  }
  return results
}

/**
 * 娓呯悊杩囨湡鐨勬棩蹇楁枃浠躲€? * 鎸夋枃浠跺悕鎺掑簭锛圷YYY-MM-DD.log锛夛紝鍒犻櫎瓒呭嚭 MAX_LOG_FILES 鐨勬渶鏃ф枃浠躲€? */
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

// 鈹€鈹€ 鍥剧墖涓嬭浇涓庢浛鎹?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/** Notion S3 鏂囦欢 URL */
const NOTION_S3_RE = /https:\/\/prod-files-secure\.s3[^"'\s]+/g

/** Gitee raw 鍥剧墖 URL */
const GITEE_IMAGE_RE =
  /https:\/\/gitee\.com\/[^"'\s]+\/[^"'\s]+\.(?:png|jpe?g|gif|webp|svg|bmp|ico)(?:\?[^"'\s]*)?/g

/** 闇€瑕佷笅杞芥浛鎹㈢殑澶栭儴鏂囦欢 URL 妯″紡鍒楄〃 */
const EXTERNAL_FILE_URL_PATTERNS: RegExp[] = [NOTION_S3_RE, GITEE_IMAGE_RE]

/** 妫€鏌ュ瓧绗︿覆鏄惁鍖归厤浠讳竴澶栭儴鏂囦欢 URL 妯″紡 */
function matchesExternalUrl(s: string): boolean {
  return EXTERNAL_FILE_URL_PATTERNS.some(re => re.test(s))
}

/** 鎻愬彇瀛楃涓蹭腑鎵€鏈夊尮閰嶇殑澶栭儴鏂囦欢 URL锛堝幓閲嶏級 */
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
 * 娣卞害閬嶅巻 JSON锛屽皢鎵€鏈夊閮ㄥ浘鐗?URL 涓嬭浇鍒版湰鍦?images/{rootPageId}/ 鐩綍锛? * 骞舵浛鎹负鏈湴璺緞 `/api/images/{rootPageId}/{hash}.{ext}`銆? */
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
 * 鏇挎崲瀛楃涓蹭腑鐨勬墍鏈夊閮ㄦ枃浠?URL 涓烘湰鍦拌矾寰勩€? */
async function replaceUrlsInString(str: string, rootPageId: string): Promise<string> {
  const urls = extractExternalUrls(str)
  let result = str
  for (const url of urls) {
    const localPath = await downloadImage(url, rootPageId)
    if (localPath) result = result.replace(url, localPath)
  }
  return result
}

/** 涓嬭浇鍗曞紶鍥剧墖鍒版湰鍦?images/{rootPageId}/锛岃繑鍥炴湰鍦拌矾寰勩€傚け璐ユ椂淇濈暀鍘?URL銆?*/
async function downloadImage(remoteUrl: string, rootPageId: string): Promise<string> {
  let baseName = 'image'
  try {
    const urlObj = new URL(remoteUrl)
    const pathParts = urlObj.pathname.split('/')
    baseName = decodeURIComponent(pathParts[pathParts.length - 1]) || 'image'
  } catch { /* ignore */ }

  // 鍩轰簬 URL pathname 鍝堝笇鐢熸垚鍞竴鏂囦欢鍚嶏紙鍓旈櫎 query string锛岄伩鍏?presigned URL 绛惧悕鍙樺寲瀵艰嚧閲嶅涓嬭浇锛?  const stableKey = new URL(remoteUrl).pathname
  const hash = createHash('md5').update(stableKey).digest('hex').slice(0, 12)
  const ext = extname(baseName).slice(0, 8).toLowerCase() || '.bin'
  const fileName = `${hash}${ext}`
  const rootDir = join(IMAGES_DIR, rootPageId)
  const filePath = join(rootDir, fileName)

  // 鏂囦欢宸插瓨鍦ㄥ垯璺宠繃涓嬭浇
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

// 鈹€鈹€ API 璺敱鍒嗗彂 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

// URL 璺緞 鈫?璺敱鍙傛暟鏄犲皠锛?// GET  /api/storage/page/:rootPageId/:date/:pageId         鈥?璇诲彇椤甸潰
// GET  /api/storage/batch-index/:rootPageId/:date          鈥?鎵规绱㈠紩
// POST /api/storage/save                                   鈥?淇濆瓨鍚屾缁撴灉
// GET  /api/storage/database/:rootPageId/:date/:pageId/:db 鈥?璇诲彇鏁版嵁搴?// GET  /api/storage/backlinks/:rootPageId/:date/:pageId    鈥?鍙嶅悜閾炬帴
// GET  /api/storage/versions/:rootPageId                   鈥?鐗堟湰鍒楄〃
// DELETE /api/storage/remove/:rootPageId                   鈥?鍒犻櫎鏁翠釜鏍归〉闈㈠浠?// DELETE /api/storage/cleanup/:rootPageId                  鈥?娓呯悊鏃х増鏈?// POST /api/storage/append-log                             鈥?杩藉姞鏃ュ織
// POST /api/images/import                                  鈥?鏆傚瓨瀵煎叆鍥剧墖
// GET  /api/storage/logs                                   鈥?鏌ヨ鏃ュ織
// POST /api/storage/cleanup-logs                           鈥?娓呯悊鏃ュ織
// POST /api/notion/*                                       鈥?Notion API 浠ｇ悊

/** 鎬昏矾鐢卞垎鍙戯細鏍规嵁 method + path 鍒嗗彂鍒板搴旂殑澶勭悊閫昏緫 */
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method
  const segments = path.split('/').filter(Boolean)

  // 鈹€鈹€ GET /api/images/:rootPageId/:fileName 鈥?鎻愪緵鏈湴缂撳瓨鐨勫浘鐗?鈹€鈹€
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

  // 鈹€鈹€ GET /api/storage/index 鈥?鍏ㄥ眬绱㈠紩锛堥椤靛崱鐗囧垪琛級 鈹€鈹€
  if (method === 'GET' && path === '/api/storage/index') {
    return jsonResponse(await buildGlobalIndex())
  }

  // 鈹€鈹€ POST /api/images/import 鈥?鏆傚瓨瀵煎叆鍥剧墖锛堣繑鍥炲閮?URL 渚?Notion files 灞炴€т娇鐢級 鈹€鈹€
  if (method === 'POST' && path === '/api/images/import') {
    return handleImageImport(req)
  }

  // 鈹€鈹€ POST /api/db-import/create-page 鈥?浠ｇ悊鍒涘缓 Notion 鏁版嵁搴撻〉闈紙缁?CORS锛?鈹€鈹€
  if (method === 'POST' && path === '/api/db-import/create-page') {
    return handleCreateDatabasePage(req)
  }

  // 鈹€鈹€ POST /api/sync/sse 鈥?鍏ㄩ摼璺?SSE 鍚屾锛坒etch鈫抪arse鈫抯ave 涓€绔欏紡娴佸紡杈撳嚭锛?鈹€鈹€
  if (method === 'POST' && path === '/api/sync/sse') {
    return handleSyncSSE(req)
  }

  // 鈹€鈹€ GET /api/storage/page/:rootPageId/:date/:pageId 鈥?璇诲彇鍗曚釜椤甸潰 鈹€鈹€
  if (method === 'GET' && path.startsWith('/api/storage/page/')) {
    // segments = ['api','storage','page','rootPageId','date','pageId',...]
    if (segments.length < 6) return errorResponse('Invalid path', 400)
    const rootPageId = segments[3]
    const date = segments[4]
    const pageId = segments.slice(5).join('/')

    // 璇诲彇椤甸潰鐨?page.json
    const pageDir = join(JSON_DIR, rootPageId, date, pageId)
    const page = await readJsonSafe(join(pageDir, 'page.json'))
    if (!page) return jsonResponse(null, 404)

    // 璇诲彇瀛愰〉闈紙children 鐩綍锛?    const children: Record<string, unknown> = {}
    const childrenDir = join(pageDir, 'children')
    if (existsSync(childrenDir)) {
      const childFiles = await readdir(childrenDir)
      for (const childFile of childFiles) {
        const childId = childFile.replace('.json', '')
        const childData = await readJsonSafe(join(childrenDir, childFile))
        if (childData) children[childId] = childData
      }
    }

    // 璇诲彇鍐呭祵鏁版嵁搴擄紙databases 鐩綍锛?    const databases: Record<string, unknown> = {}
    const databasesDir = join(pageDir, 'databases')
    if (existsSync(databasesDir)) {
      const dbFiles = await readdir(databasesDir)
      for (const dbFile of dbFiles) {
        const dbId = dbFile.replace('.json', '')
        const dbData = await readJsonSafe(join(databasesDir, dbFile))
        if (dbData) databases[dbId] = dbData
      }
    }

    // 杩斿洖椤甸潰 + 瀛愰〉闈?+ 鏁版嵁搴?+ 瀛愰〉闈㈡憳瑕?    return jsonResponse({ page, children, databases, subPages: extractSubPageCards(page as Record<string, unknown>) })
  }

  // 鈹€鈹€ GET /api/storage/batch-index/:rootPageId/:date 鈥?鎵规绱㈠紩 鈹€鈹€
  if (method === 'GET' && path.startsWith('/api/storage/batch-index/')) {
    if (segments.length < 6) return errorResponse('Invalid path', 400)
    const rootPageId = segments[3]
    const date = segments[4]
    const indexFile = join(JSON_DIR, rootPageId, date, 'index.json')
    const index = await readJsonSafe(indexFile)
    if (index) return jsonResponse(index)
    return jsonResponse(null, 404)
  }

  // 鈹€鈹€ POST /api/storage/save 鈥?鎵归噺淇濆瓨鍚屾缁撴灉 鈹€鈹€
  // 璇锋眰浣? { rootPageId, pages: [{ page, children?, databases? }] }
  if (method === 'POST' && path === '/api/storage/save') {
    const body = (await req.json()) as Record<string, unknown>
    const result = await handleSave(body)
    return jsonResponse(result)
  }

  // 鈹€鈹€ POST /api/storage/save-sse 鈥?鎵归噺淇濆瓨锛圫SE 瀹炴椂杈撳嚭杩涘害锛?鈹€鈹€
  if (method === 'POST' && path === '/api/storage/save-sse') {
    const body = (await req.json()) as Record<string, unknown>
    return handleSaveSSE(body)
  }

  // 鈹€鈹€ GET /api/storage/database/:rootPageId/:date/:pageId/:databaseId 鈥?璇诲彇鏁版嵁搴?鈹€鈹€
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

  // 鈹€鈹€ GET /api/storage/backlinks/:rootPageId/:date/:pageId 鈥?鍙嶅悜閾炬帴 鈹€鈹€
  if (method === 'GET' && path.startsWith('/api/storage/backlinks/')) {
    if (segments.length < 6) return errorResponse('Invalid path', 400)
    const rootPageId = segments[3]
    const date = segments[4]
    const pageId = segments.slice(5).join('/')
    return jsonResponse(await buildBacklinks(rootPageId, date, pageId))
  }

  // 鈹€鈹€ GET /api/storage/versions/:rootPageId 鈥?鐗堟湰鍒楄〃 鈹€鈹€
  if (method === 'GET' && path.startsWith('/api/storage/versions/')) {
    const rootPageId = segments[3]
    const versions = (await listDirs(join(JSON_DIR, rootPageId))).sort().reverse()
    return jsonResponse(versions)
  }

  // 鈹€鈹€ DELETE /api/storage/remove/:rootPageId 鈥?鍒犻櫎鏁翠釜鏍归〉闈㈠浠?鈹€鈹€
  if (method === 'DELETE' && path.startsWith('/api/storage/remove/')) {
    const rootPageId = segments[3]
    const rootDir = join(JSON_DIR, rootPageId)
    if (existsSync(rootDir)) {
      await rmRecursive(rootDir)
    }
    // 鍚屾椂鍒犻櫎璇ユ牴椤甸潰鐨勫浘鐗囩紦瀛?    const imagesRootDir = join(IMAGES_DIR, rootPageId)
    if (existsSync(imagesRootDir)) {
      await rmRecursive(imagesRootDir)
    }
    return jsonResponse({ ok: true })
  }

  // 鈹€鈹€ DELETE /api/storage/cleanup/:rootPageId 鈥?娓呯悊鏃х増鏈?鈹€鈹€
  if (method === 'DELETE' && path.startsWith('/api/storage/cleanup/')) {
    const rootPageId = segments[3]
    const allDates = (await listDirs(join(JSON_DIR, rootPageId))).sort().reverse()
    for (const oldDate of allDates.slice(MAX_VERSIONS)) {
      await rmRecursive(join(JSON_DIR, rootPageId, oldDate))
    }
    return jsonResponse({ ok: true })
  }

  // 鈹€鈹€ POST /api/storage/append-log 鈥?杩藉姞鏃ュ織琛?鈹€鈹€
  if (method === 'POST' && path === '/api/storage/append-log') {
    const body = (await req.json()) as { fileName: string; line: string }
    await appendToLog(body.fileName, body.line)
    return jsonResponse({ ok: true })
  }

  // 鈹€鈹€ GET /api/storage/logs 鈥?鏌ヨ鏃ュ織 鈹€鈹€
  if (method === 'GET' && path === '/api/storage/logs') {
    const date = url.searchParams.get('date') ?? undefined
    const level = url.searchParams.get('level') ?? undefined
    const pageId = url.searchParams.get('pageId') ?? undefined
    const logs = await readLogs(date, level, pageId)
    return jsonResponse(logs)
  }

  // 鈹€鈹€ POST /api/storage/cleanup-logs 鈥?娓呯悊杩囨湡鏃ュ織 鈹€鈹€
  if (method === 'POST' && path === '/api/storage/cleanup-logs') {
    await cleanupLogs()
    return jsonResponse({ ok: true })
  }

  // 鈹€鈹€ GET /api/images/:filename 鈥?鎻愪緵鏈湴缂撳瓨鐨勫浘鐗?鈹€鈹€
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

  // 鈹€鈹€ /api/notion/* 鈥?杞彂鍒?Notion API 浠ｇ悊 鈹€鈹€
  if (path.startsWith('/api/notion/')) {
    return handleNotionProxy(req)
  }

  // 鏈尮閰嶄换浣曡矾鐢?  return new Response('Not Found', { status: 404 })
}

// 鈹€鈹€ Notion API 浠ｇ悊 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/** Notion REST API 鍩虹鍦板潃 */
const NOTION_API_BASE = 'https://api.notion.com/v1'
/** Notion API 鐗堟湰 */
const NOTION_VERSION = '2022-06-28'

/**
 * 鏋勫缓鍏ㄥ眬绱㈠紩銆? * 鎵弿 json/{rootPageId}/{date}/index.json锛岃仛鍚堟墍鏈夋壒娆＄殑椤甸潰鎽樿锛? * 渚涢椤点€屽凡澶囦唤椤甸潰銆嶅垪琛ㄤ娇鐢ㄣ€? */
async function buildGlobalIndex(): Promise<Record<string, unknown>> {
  const batches: unknown[] = []

  // 璇诲彇鎵€鏈夋牴椤甸潰鐩綍
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

    // 鎸夋棩鏈熼檷搴忛亶鍘?    const dateDirs = (await listDirs(rootPath)).sort().reverse()
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
 * Notion API 浠ｇ悊鍒嗗彂銆? * 娴忚鍣ㄦ棤娉曠洿杩?api.notion.com锛圕ORS 闄愬埗锛夛紝
 * 鎵€鏈?Notion API 璇锋眰鐢?Vite 涓棿浠惰浆鍙戯紝apiKey 閫氳繃 X-Notion-Token header 浼犻€掋€? */
async function handleNotionProxy(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const method = req.method
  const path = url.pathname

  // 浠庤姹傚ご鎻愬彇 API token
  const notionToken = req.headers.get('X-Notion-Token')
  if (!notionToken) {
    return errorResponse('Missing X-Notion-Token header (set apiKey in config)', 401)
  }

  // 鏋勯€?Notion API 鍏叡璇锋眰澶?  const commonHeaders: Record<string, string> = {
    'Authorization': `Bearer ${notionToken}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }

  try {
    // 鈹€鈹€ POST /api/notion/test-connection 鈥?娴嬭瘯杩炴帴锛堣皟鐢?/users/me 楠岃瘉 token 鏈夋晥鎬э級 鈹€鈹€
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

    // 鈹€鈹€ POST /api/notion/fetch-page 鈥?鑾峰彇 Notion 椤甸潰鍘熷鏁版嵁锛堥〉闈㈠厓鏁版嵁 + blocks锛?鈹€鈹€
    if (method === 'POST' && path === '/api/notion/fetch-page') {
      const body = await req.json() as { pageId: string }
      const { pageId } = body

      // 骞惰璇锋眰椤甸潰鍏冩暟鎹拰鎵€鏈?blocks
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

    // 鈹€鈹€ POST /api/notion/fetch-block-children 鈥?鑾峰彇 block 鐨勫瓙鑺傜偣 鈹€鈹€
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

    // 鈹€鈹€ POST /api/notion/fetch-database 鈥?鏌ヨ鏁版嵁搴擄紙鑾峰彇鎵€鏈夎锛?鈹€鈹€
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

    // 鈹€鈹€ POST /api/notion/fetch-database-schema 鈥?鑾峰彇鏁版嵁搴?schema 瀹氫箟 鈹€鈹€
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

    // 鈹€鈹€ POST /api/notion/inspect-database 鈥?缁煎悎妫€鏌ワ紙鍚屾椂杩斿洖 schema + query 鍘熷鍝嶅簲锛?鈹€鈹€
    // 鐢ㄤ簬璇婃柇鏁版嵁搴撴潈闄愩€佹潈闄愪笉瓒崇瓑闂锛屼繚鐣欏畬鏁寸殑 Notion API 杩斿洖
    if (method === 'POST' && path === '/api/notion/inspect-database') {
      const body = await req.json() as { databaseId: string }
      const { databaseId } = body

      // 骞惰璇锋眰 schema 鍜?query
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
 * 鍒嗛〉鎷夊彇 block 鐨勬墍鏈夊瓙鑺傜偣銆? * 澶勭悊 Notion API 鍒嗛〉锛坈ursor-based锛夛紝骞堕€掑綊鎷夊彇宓屽瀛愬潡锛坱oggle銆乧olumn 绛夛級銆? */
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

  // 鎷夊彇宓屽瀛愬潡锛坱oggle/column_list 绛夊唴宓?children锛?  await fetchNestedChildren(allBlocks, headers)

  return allBlocks
}

/**
 * 闇€瑕侀€掑綊鎷夊彇宓屽瀛愬潡鐨?block 绫诲瀷鐧藉悕鍗曘€? * Notion API 鐨?/blocks/{id}/children 鍙繑鍥為《灞傚潡锛? * toggle銆乧olumn銆乼able 绛夌被鍨嬬殑 children 瀛楁涓?null锛? * 闇€瑕侀澶栬皟鐢?/blocks/{block_id}/children 鑾峰彇銆? */
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
 * 閫掑綊鎷夊彇 has_children 鍧楃殑宓屽瀛愬唴瀹广€? * 灏嗘媺鍙栫粨鏋滃～鍏呭埌瀵瑰簲 block 鐨?children 瀛楁涓€? */
async function fetchNestedChildren(
  blocks: unknown[],
  headers: Record<string, string>,
): Promise<void> {
  if (!blocks || blocks.length === 0) return

  const childFetchTasks: Promise<void>[] = []

  for (const block of blocks) {
    const b = block as Record<string, unknown>
    // has_children = true 浣?children 涓?null 鈫?闇€瑕佹媺鍙?    if (b.has_children && !b.children) {
      const type = b.type as string
      const id = b.id as string

      if (!NESTED_BLOCK_TYPES.has(type)) continue

      childFetchTasks.push(
        fetchBlocks(id, headers).then((nestedBlocks) => {
          (b as Record<string, unknown>).children = nestedBlocks
          // 缁х画閫掑綊锛氬祵濂楀瓙鍧楀彲鑳借繕鏈夋洿娣卞眰鐨勫瓙鍧?          return fetchNestedChildren(nestedBlocks, headers)
        }),
      )
    }
  }

  await Promise.all(childFetchTasks)
}

// 鈹€鈹€ 瀛愰〉闈㈡憳瑕佹彁鍙?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/** 瀛愰〉闈㈡憳瑕?*/
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
 * 鍦ㄥ凡瑙ｆ瀽鐨勯〉闈?block 鏍戜腑鎻愬彇鎵€鏈?child_page 绫诲瀷鐨勫瓙椤甸潰鎽樿銆? * 閫掑綊鎵弿鏁存５ block 鏍戯紙鍖呮嫭宓屽瀛愬潡锛夈€? */
function extractSubPageCards(page: Record<string, unknown>): SubPageCard[] {
  const cards: SubPageCard[] = []

  /** 閫掑綊閬嶅巻 blocks 鏁扮粍 */
  function walk(blocks: unknown[]): void {
    if (!Array.isArray(blocks)) return
    for (const b of blocks) {
      const block = b as Record<string, unknown>
      const type = block.type as string
      if (type === 'child_page') {
        cards.push({
          pageId: block.id as string,
          title: (block.title as string) || '鏃犳爣棰?,
          icon: (block.icon as string) ?? null,
          coverUrl: (block.coverUrl as string) ?? null,
          blockCount: (block.blockCount as number) ?? 0,
          childCount: (block.childCount as number) ?? 0,
          direction: 'child',
        })
      }
      // 閫掑綊鎵弿宓屽瀛愬潡
      if (block.children && Array.isArray(block.children)) {
        walk(block.children as unknown[])
      }
    }
  }

  walk((page.blocks || []) as unknown[])
  return cards
}

// 鈹€鈹€ 鍙嶅悜閾炬帴 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * 鏋勫缓鍙嶅悜閾炬帴锛氭壂鎻忓悓鎵规涓嬫墍鏈夐〉闈紝鎵惧嚭寮曠敤浜?targetPageId 鐨勯〉闈€? * 鍙嶅悜閾炬帴琛ㄧず"鍝簺椤甸潰閾炬帴鍒版垜"銆? */
async function buildBacklinks(
  rootPageId: string,
  date: string,
  targetPageId: string,
): Promise<SubPageCard[]> {
  const batchDir = join(JSON_DIR, rootPageId, date)
  if (!existsSync(batchDir)) return []

  const cards: SubPageCard[] = []

  // 鍒楀嚭鎵规涓嬫墍鏈夐〉闈㈢洰褰?  let pageDirs: string[]
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

    // 鍦?blocks 鏍戜腑鎼滅储 child_page 绫诲瀷涓?id === targetPageId 鐨勫潡
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
        title: (page.title as string) || '鏃犳爣棰?,
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

// 鈹€鈹€ 鏂囦欢绯荤粺鍔╂墜 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?//  SSE 鍚屾寮曟搸锛堟湇鍔＄鍏ㄩ摼璺級
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
/** 閫愬瓧鍙戦€佹棩蹇楀埌 SSE 娴?*/
function snkLog(ctrl: ReadableStreamDefaultController, message: string): void {
  const encoder = new TextEncoder()
  for (const char of message) {
    ctrl.enqueue(encoder.encode(sseEvent('log', { chunk: char })))
  }
  // 鍙戦€佹崲琛屼綔涓鸿缁撴潫鏍囪
  ctrl.enqueue(encoder.encode(sseEvent('log', { chunk: '\n' })))
}

/** 鍙戦€佸崟浠诲姟鐘舵€?*/
function snkTask(ctrl: ReadableStreamDefaultController, task: Record<string, unknown>): void {
  ctrl.enqueue(new TextEncoder().encode(sseEvent('task', task)))
}

// 鈹€鈹€ POST /api/sync/sse 璺敱鍒嗗彂 鈹€鈹€

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
        controller.enqueue(encoder.encode(sseEvent('done', { message: message || '鍚屾瀹屾垚' })))
      }
      const error = (msg: string) => {
        controller.enqueue(encoder.encode(sseEvent('error', { message: msg })))
      }

      try {
        const rootPageId = pageIds[0]
        const visited = new Set<string>()
        const collected: Array<{ page: Record<string, unknown>; databases?: Array<{ databaseId: string; database: Record<string, unknown>; results?: unknown }> }> = []

        await log(`馃殌 寮€濮嬪悓姝?${pageIds.length} 涓〉闈?..\n`)

        // 骞跺彂鎺у埗鍙傛暟
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

        // 鈹€鈹€ 鍚屾鍗曢〉 鈹€鈹€
        const syncOnePage = async (pageId: string, initialTitle?: string, isChild = false): Promise<void> => {
          if (visited.has(pageId)) return
          visited.add(pageId)

          let title = initialTitle || pageId

          task({ pageId, title, status: 'pending', progress: 0 })

          try {
            await log(`馃搫 寮€濮嬪悓姝? ${title}\n`)
            task({ pageId, title, status: 'fetching', progress: 10 })

            // Phase 1: fetch page
            const [pageRes, blocksRes] = await Promise.all([
              fetch(`${NOTION_API_BASE}/pages/${pageId}`, { headers: commonHeaders }),
              fetchBlocks(pageId, commonHeaders),
            ])

            if (!pageRes.ok) {
              const err = await pageRes.text()
              throw new Error(`鑾峰彇椤甸潰澶辫触: ${pageRes.status} ${err}`)
            }

            const pageData = await pageRes.json() as Record<string, unknown>
            const properties = (pageData.properties as Record<string, unknown>) || {}

            // 鎻愬彇鏍囬
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
                  await log(`馃梽 鑾峰彇鏁版嵁搴? ${dbTitle}\n`)
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
                    await log(`鉁?鏁版嵁搴撹幏鍙栧畬鎴?(${Array.isArray(db.results) ? db.results.length : 0} 鏉¤褰?\n`)
                  }
                } catch (e) {
                  await log(`鈿狅笍 鏁版嵁搴撹幏鍙栧け璐? ${e instanceof Error ? e.message : String(e)}\n`)
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
              await log(`馃搨 ${title} 鈥?鍙戠幇 ${children.length} 涓瓙椤甸潰/鏁版嵁搴揬n`)
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
                  await log(`鈿狅笍 瀛愭暟鎹簱鑾峰彇澶辫触: ${e instanceof Error ? e.message : String(e)}\n`)
                }
              }
            }

            if (!isChild) {
              await log(`鉁?${title} 鈥?鍚屾瀹屾垚 (${rawBlocks.length} 涓?block)\n`)
            }
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e)
            await log(`鉂?${title} 鈥?鍚屾澶辫触: ${errMsg}\n`)
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

        // 鈹€鈹€ 鍚姩鎵€鏈夋牴浠诲姟锛堝苟鍙戯級 鈹€鈹€
        const rootTasks = pageIds.map(pid => () => syncOnePage(pid))
        await Promise.all(rootTasks.map(fn => enqueue(fn)))

        // 绛夊緟闃熷垪瀹屽叏娓呯┖
        while (running > 0 || queue.length > 0) {
          await delay(100)
        }

        // 鈹€鈹€ 淇濆瓨 鈹€鈹€
        if (collected.length > 0) {
          await log('馃捑 寮€濮嬩繚瀛樺悓姝ョ粨鏋?..\n')

          // 涓嬭浇鍥剧墖
          await log('馃柤 涓嬭浇杩滅▼鍥剧墖...\n')
          await downloadAndReplaceImages(collected, rootPageId)
          await log('馃柤 鍥剧墖涓嬭浇瀹屾垚\n')

          // 閫愰〉鍐欏叆
          await performSaveWrites(rootPageId, collected, (_pid: string, _title: string) => {
            // 鐢变簬 SSE 宸茶繃 here 涓嶇敤鍐嶅彂浠诲姟
          })

          await log('馃捑 淇濆瓨瀹屾垚\n')
        }

        await log('馃帀 鍏ㄩ儴鍚屾浠诲姟瀹屾垚\n')
        done('sync complete')
      } catch (e) {
        error(e instanceof Error ? e.message : String(e))
        await log(`馃挜 鍚屾涓柇: ${e instanceof Error ? e.message : String(e)}\n`)
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

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
/** 鏍规嵁鏂囦欢鎵╁睍鍚嶈繑鍥?MIME type */
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

// 鈹€鈹€ POST /api/storage/save 鏍稿績澶勭悊閫昏緫 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function handleSave(body: Record<string, unknown>): Promise<{ ok: boolean }> {
  const rootPageId = body.rootPageId as string
  const pages = body.pages as Array<Record<string, unknown>> | undefined
  if (!rootPageId || !pages || pages.length === 0) throw new Error('Missing rootPageId or pages')

  await downloadAndReplaceImages(pages, rootPageId)
  await performSaveWrites(rootPageId, pages)
  return { ok: true }
}

// 鈹€鈹€ POST /api/storage/save-sse SSE 娴佸紡澶勭悊 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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

        // Step 1: 涓嬭浇鍥剧墖
        send('progress', { stage: 'images', message: '姝ｅ湪涓嬭浇杩滅▼鍥剧墖...', step: 0, total: totalSteps })
        await downloadAndReplaceImages(pages, rootPageId)
        emit('progress', { stage: 'images', message: '鍥剧墖涓嬭浇瀹屾垚', done: false })

        // 淇濆瓨锛氶€愰〉鍐欏叆骞跺彂閫佷簨浠?        await performSaveWrites(rootPageId, pages, (pageId: string, pageTitle: string) => {
          emit('progress', {
            stage: 'saving',
            pageId,
            pageTitle,
            message: `宸蹭繚瀛? ${pageTitle || pageId}`,
            done: false,
          })
        })

        send('done', { message: '淇濆瓨瀹屾垚', step: totalSteps, total: totalSteps })
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

/** 鎵ц鎵归噺鍐欏叆锛堟彁鍙栦负鍏变韩鍑芥暟锛?*/
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

    // 淇濆瓨涓婚〉闈?JSON
    await writeJson(join(pageDir, 'page.json'), page)

    // 淇濆瓨瀛愰〉闈紙children 鐩綍锛?    const children = entry.children as Record<string, unknown> | undefined
    const childrenEntries = children ? Object.keys(children) : []
    if (children && childrenEntries.length > 0) {
      const childrenDir = join(pageDir, 'children')
      for (const [childId, childData] of Object.entries(children)) {
        await writeJson(join(childrenDir, `${childId}.json`), childData)
      }
    }

    // 淇濆瓨鍐呭祵鏁版嵁搴擄紙databases 鐩綍锛?    const databases = entry.databases as Array<Record<string, unknown>> | undefined
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

    // 淇濆瓨鍏冧俊鎭紙meta.json锛?    const blocks = (page as { blocks?: unknown[] })?.blocks
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

    // 鏋勫缓鎵规鏉＄洰
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

  // 淇濆瓨鎵规鎽樿锛坆atchDir/index.json锛?  const batchIndex = {
    version: 1,
    rootPageId,
    date: today,
    syncedAt: new Date().toISOString(),
    pages: batchEntries,
  }
  await writeJson(join(batchDir, 'index.json'), batchIndex)

  // 娓呯悊杩囨棫鐗堟湰
  const allDates = (await listDirs(join(JSON_DIR, rootPageId))).sort().reverse()
  for (const oldDate of allDates.slice(MAX_VERSIONS)) {
    await rmRecursive(join(JSON_DIR, rootPageId, oldDate))
  }
}

/** 閫掑綊鍒犻櫎鐩綍鍙婂叾鎵€鏈夊唴瀹?*/
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
    // 鍒犻櫎绌虹洰褰曟湰韬紙娉ㄦ剰锛氱敤 unlink 鑰岄潪 rmdir锛屽洜涓?Windows 鍏煎鎬ч渶瑕侊級
    await unlink(dirPath)
  } catch {
    // 鐩綍涓嶅瓨鍦ㄦ椂蹇界暐
  }
}

/**
 * 灏濊瘯灏嗗瓧绗︿覆瑙ｆ瀽涓?JSON銆? * 瑙ｆ瀽澶辫触鏃惰繑鍥炲師濮嬪瓧绗︿覆銆? */
function tryJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

// 鈹€鈹€ POST /api/images/import 澶勭悊鍣?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * 鎺ユ敹鍓嶇 POST 鐨?base64 鍥剧墖鏁版嵁锛屽啓鍒版湰鍦?images/import/ 鐩綍锛? * 杩斿洖澶栭儴鍙闂殑 URL锛堜緵 Notion files 灞炴€х殑 external.url 浣跨敤锛夈€? *
 * 璇锋眰浣擄細{ data: string (base64), extension: string, mimeType: string }
 * 鍝嶅簲浣擄細{ url: string }
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

    // 浣跨敤璇锋眰鐨?origin 鏋勯€?Notion API 鍙闂殑缁濆 URL
    const origin = new URL(req.url).origin

    return jsonResponse({
      url: `${origin}/api/images/import/${fileName}`,
    })
  } catch (e) {
    return errorResponse(`Image import error: ${e}`, 500)
  }
}

/**
 * 浠ｇ悊鍒涘缓 Notion 鏁版嵁搴撻〉闈紙娴忚鍣ㄧ琚?CORS 闃绘锛岄』缁忔湇鍔＄浠ｇ悊锛夈€? * 璇锋眰澶撮渶鎼哄甫 X-Notion-Token銆? */
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

// 鈹€鈹€ Vite 鎻掍欢瀹氫箟 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * Vite 涓棿浠舵彃浠躲€? * 鎷︽埅 /api/* 璇锋眰锛屽皢 Node.js IncomingMessage 杞崲涓烘爣鍑?Request锛? * 鍒嗗彂鍒?handleRequest 澶勭悊锛屽啀灏?Response 鍐欏洖 Node.js ServerResponse銆? */
export function notionApiPlugin(): Plugin {
  return {
    name: 'notion-api-plugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, _res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next()
        }

        // 灏?/api/images/* 鐨?GET 璇锋眰鎻愬墠鐭矾锛屼笉璇?body
        // 鍘熷洜锛氶儴鍒?Node 鐗堟湰涓?await new Promise 鍦ㄦ棤 body GET 涓婂彲鑳介樆濉?        // 浠?Node.js 鍘熺敓璇锋眰鏋勯€犳爣鍑?Web Request
        const url = `http://localhost${req.url}`
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers.set(k, v)
          else if (Array.isArray(v)) headers.set(k, v.join(', '))
        }

        // 鍙湪鏈夎姹備綋鏃舵墠璇诲彇锛圥OST/PUT/PATCH锛夛紝GET/HEAD/DELETE 绔嬪嵆鏋勯€?Request
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

        // 鍒嗗彂璇锋眰 鈫?鍐欏洖鍝嶅簲
        try {
          const response = await handleRequest(request)
          _res.statusCode = response.status
          response.headers.forEach((value, key) => {
            _res.setHeader(key, value)
          })
          // 浣跨敤 arrayBuffer 鏀寔浜岃繘鍒跺搷搴旓紙鍥剧墖绛夛級
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
