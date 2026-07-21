/**
 * 数据库 Excel 导入服务
 *
 * 功能：
 * 1. 解析 Excel 文件（ExcelJS，格式与导出一致），含嵌入图片提取
 * 2. 验证 Excel 列是否与 Notion 数据库属性匹配
 * 3. 识别已有行（按 title 列去重，支持增量导入）
 * 4. 通过 Notion API 逐行创建/更新页面
 *
 * 限制：
 * - 仅支持增量导入（不更新已有行，只新增不存在的行）
 * - files 类型列需 Excel 单元格内嵌入图片
 * - 不支持 people / formula 等复杂类型
 */

import type { NotionDatabase, DatabasePropertyConfig } from '@/types/notion'

// ── 日志类型 ───────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'skip' | 'update'

export interface ImportLog {
  level: LogLevel
  message: string
  /** 关联的行号（从表头算起，1 为第一行数据） */
  row?: number
  /** 关联的列名 */
  column?: string
  /** 时间戳 */
  time: number
}

// ── 校验错误类型 ───────────────────────────────────────────

export interface ValidationError {
  row: number
  column: string
  message: string
}

// ── 列类型 → 可导入性 ──────────────────────────────────────

const IMPORTABLE_TYPES = new Set([
  'title',
  'rich_text',
  'select',
  'multi_select',
  'number',
  'checkbox',
  'url',
  'email',
  'phone_number',
  'date',
  'status',
  'files',
])

const UNSUPPORTED_TYPES: Record<string, string> = {
  formula: '公式列由 Notion 自动计算，不可写入',
  created_time: '创建时间由 Notion 自动生成',
  last_edited_time: '最后编辑时间由 Notion 自动生成',
  people: '不支持导入人员列',
  relation: '不支持导入关联列',
  rollup: '不支持导入汇总列',
  created_by: '创建者由 Notion 自动生成',
  last_edited_by: '最后编辑者由 Notion 自动生成',
  button: '不支持导入按钮列',
}

// ── Excel 解析结果 ─────────────────────────────────────────

interface ParsedExcel {
  headers: string[]
  rows: Record<string, string>[]
  /** 单元格位置 → BufferedImage 的映射。key 格式为 "colKey:rowIndex"（rowIndex 从 1 起，即 Excel 数据首行 = 1） */
  images: Map<string, BufferedImage>
}

/** Excel 中提取的图片信息 */
export interface BufferedImage {
  buffer: ArrayBuffer
  extension: string
  mimeType: string
}

// ── 数据库属性配置 ─────────────────────────────────────────

export interface DbSchema {
  properties: Record<string, DatabasePropertyConfig>
  titleKey: string
}

// ── Excel 解析 ─────────────────────────────────────────────

/**
 * 解析 Excel 文件，返回表头和行数据。
 * 表头需与 Notion 数据库属性名一致。
 */
export async function parseExcelFile(file: File): Promise<ParsedExcel> {
  const ExcelJS = await import('exceljs')
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const ws = wb.getWorksheet(1)
  if (!ws || !ws.lastRow || ws.lastRow.number < 2) {
    throw new Error('Excel 文件为空或缺少数据行')
  }

  const headers: string[] = []
  ws.getRow(1).eachCell(cell => {
    headers.push(String(cell.value ?? '').trim())
  })

  const rows: Record<string, string>[] = []
  let prevRow: Record<string, string> = {}
  for (let r = 2; r <= ws.lastRow.number; r++) {
    const row: Record<string, string> = {}
    const excelRow = ws.getRow(r)
    headers.forEach((header, ci) => {
      const cell = excelRow.getCell(ci + 1)
      // 公式单元格（type 6）取 formula/result，否则取普通值
      let val: string
      if (cell.type === 6 && (cell.formula || cell.result)) {
        val = String(cell.formula || cell.result)
      } else {
        val = String(cell.value ?? '').trim()
      }
      // 合并单元格回填：当前格为空时用上一行的值填充
      if (!val && prevRow[header]) {
        val = prevRow[header]
      }
      row[header] = val
    })
    rows.push(row)
    prevRow = row
  }

  // ── 提取嵌入图片 ────────────────────────────────────────
  // 1. ExcelJS getImages() — 浮动/嵌入图片
  const images = extractFloatingImages(ws, wb, headers)

  // 2. WPS 单元格图片 (DISPIMG 公式) — 手动解析 xlsx zip
  const cellImages = await extractCellImages(buffer, rows, headers)
  for (const [key, img] of cellImages) {
    if (!images.has(key)) images.set(key, img)
  }

  return { headers, rows, images }
}

/**
 * 提取工作表中的浮动/嵌入图片（ExcelJS getImages）。
 */
function extractFloatingImages(
  ws: any,
  wb: any,
  headers: string[],
): Map<string, BufferedImage> {
  const result = new Map<string, BufferedImage>()

  try {
    const sheetImages = ws.getImages() as Array<{
      imageId: number
      range?: { tl?: { nativeCol: number; nativeRow: number } }
    }>
    if (!sheetImages.length) return result

    for (const img of sheetImages) {
      const tl = img.range?.tl
      if (!tl || tl.nativeRow === undefined) continue
      if (tl.nativeRow < 1) continue // 跳过表头行
      if (tl.nativeCol < 0 || tl.nativeCol >= headers.length) continue

      const wbImg = wb.getImage(img.imageId) as { buffer?: { buffer: ArrayBuffer; byteOffset: number; length: number }; extension?: string } | undefined
      if (!wbImg?.buffer) continue

      const ext = (wbImg.extension || 'png').toLowerCase()
      const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' }

      result.set(`${headers[tl.nativeCol]}:${tl.nativeRow}`, {
        buffer: (wbImg.buffer as unknown as ArrayBuffer),
        extension: ext,
        mimeType: mimeMap[ext] || 'application/octet-stream',
      })
    }
  } catch { /* 图片提取失败不阻塞导入 */ }

  return result
}

/**
 * 提取 WPS 表格"单元格图片"（DISPIMG 公式）。
 * ExcelJS 不解析这类图片，需要手动解 xlsx zip。
 */
async function extractCellImages(
  buffer: ArrayBuffer,
  rows: Record<string, string>[],
  headers: string[],
): Promise<Map<string, BufferedImage>> {
  const result = new Map<string, BufferedImage>()

  try {
    const JSZip = await import('jszip')
    const zip = await JSZip.default.loadAsync(buffer)

    // 检查是否有单元格图片定义（WPS 表格专有）
    const cellImagesFile = zip.file('xl/cellimages.xml')
    if (!cellImagesFile) return result

    const cellImagesXml = await cellImagesFile.async('text')
    const relsFile = zip.file('xl/_rels/cellimages.xml.rels')
    const relsXml = relsFile ? await relsFile.async('text') : ''

    // 解析 imageId → rId
    const idToRId: Record<string, string> = {}
    const idRegex = /cNvPr[^>]*name="(ID_[^"]+)"[^>]*\/>\s*<[^>]*cNvPicPr[\s\S]*?a:blip[^>]*r:embed="(rId\d+)"/g
    let m: RegExpExecArray | null
    while ((m = idRegex.exec(cellImagesXml)) !== null) {
      idToRId[m[1]] = m[2]
    }

    // 解析 rId → media 路径
    const rIdToPath: Record<string, string> = {}
    const relRegex = /Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g
    while ((m = relRegex.exec(relsXml)) !== null) {
      rIdToPath[m[1]] = m[2]
    }

    // 遍历行，查找 DISPIMG 公式（兼容 _xlfn.DISPIMG 和 =DISPIMG 两种格式）
    const dispImgRe = /(?:=|_xlfn\.)DISPIMG\("?(ID_[A-F0-9]+)"?/
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri]
      const rowIndex = ri + 1 // 1-based

      for (const [colKey, cellValue] of Object.entries(row)) {
        const match = dispImgRe.exec(cellValue)
        if (!match) continue

        const imageId = match[1]
        const rId = idToRId[imageId]
        if (!rId) continue

        const mediaPath = rIdToPath[rId]
        if (!mediaPath) continue

        // 从 zip 中读取图片数据
        const mediaFile = zip.file(`xl/${mediaPath}`)
        if (!mediaFile) continue

        const imageBuffer = await mediaFile.async('arraybuffer')
        const ext = mediaPath.split('.').pop()?.toLowerCase() || 'png'
        const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }

        result.set(`${colKey}:${rowIndex}`, {
          buffer: imageBuffer,
          extension: ext,
          mimeType: mimeMap[ext] || 'application/octet-stream',
        })
      }
    }
  } catch { /* cell image 提取失败不阻塞导入 */ }

  return result
}

// ── Schema 验证 ────────────────────────────────────────────

/**
 * 构建数据库 schema 并返回 title 列的 key。
 * title 列用于去重匹配。
 */
export function buildDbSchema(database: NotionDatabase): DbSchema {
  let titleKey = ''
  for (const [key, config] of Object.entries(database.properties)) {
    if (config.type === 'title') {
      titleKey = key
      break
    }
  }
  return { properties: database.properties, titleKey }
}

/**
 * 验证 Excel 列与数据库属性是否匹配。
 * 返回警告列表（不阻塞导入）。
 */
export function validateColumns(
  excelHeaders: string[],
  schema: DbSchema,
): ValidationError[] {
  const errors: ValidationError[] = []
  const schemaKeys = Object.keys(schema.properties)

  // 检查 Excel 中每列是否存在于数据库 schema 中
  for (const header of excelHeaders) {
    if (!header) continue
    if (!(header in schema.properties)) {
      errors.push({
        row: 0,
        column: header,
        message: `列 "${header}" 在数据库中不存在，将被忽略`,
      })
    }
  }

  return errors
}

/**
 * 全面检查每行数据的合法性。
 * 返回错误日志列表，行号从 1 起（Excel 第 2 行 = row 1）。
 *
 * @param options.idColumnKey  Excel 中用作主键的列名（如 "id"），不区分大小写匹配
 * @param options.existingIds  数据库中已有的 ID 集合（小写），用于去重
 */
export function validateRows(
  rows: Record<string, string>[],
  schema: DbSchema,
  existingTitles: Set<string>,
  options?: { idColumnKey?: string; existingIds?: Set<string> },
): ImportLog[] {
  const logs: ImportLog[] = []

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]
    const rowNum = ri + 1

    // 检查 title 列
    if (!schema.titleKey) {
      logs.push({
        level: 'error',
        message: '数据库缺少 title 列，无法导入',
        row: rowNum,
        time: Date.now(),
      })
      continue
    }

    const titleValue = row[schema.titleKey]
    if (!titleValue) {
      logs.push({
        level: 'error',
        message: `title 列为空，跳过`,
        row: rowNum,
        column: schema.titleKey,
        time: Date.now(),
      })
      continue
    }

    // 检查是否已存在（优先 ID 列匹配，其次 title 匹配）
    // ID 列不区分大小写
    const idKey = options?.idColumnKey
    const existingIds = options?.existingIds
    const idValue = idKey ? (row[idKey] || '').trim() : ''
    const idMatch = idKey && existingIds && idValue
      ? existingIds.has(idValue.toLowerCase())
      : false
    const titleMatch = existingTitles.has(titleValue)

    if (idMatch || titleMatch) {
      // 检查"更新"列是否有值，有值则标记为 update，否则跳过
      const updateCol = row['更新']
      if (updateCol && String(updateCol).trim()) {
        const matchInfo = idMatch ? ` (ID: ${idValue})` : ''
        logs.push({
          level: 'update',
          message: `"${titleValue}"${matchInfo} 标记为更新`,
          row: rowNum,
          time: Date.now(),
        })
      } else {
        const matchInfo = idMatch ? ' (ID 匹配)' : ''
        logs.push({
          level: 'skip',
          message: `"${titleValue}" 已存在${matchInfo}，跳过`,
          row: rowNum,
          time: Date.now(),
        })
      }
      continue
    }

    // 逐列检查类型合法性
    for (const [col, value] of Object.entries(row)) {
      const prop = schema.properties[col]
      if (!prop) continue

      // 跳过不支持的类型
      if (UNSUPPORTED_TYPES[prop.type]) {
        logs.push({
          level: 'warn',
          message: `${col}: ${UNSUPPORTED_TYPES[prop.type]}`,
          row: rowNum,
          column: col,
          time: Date.now(),
        })
        continue
      }

      if (!IMPORTABLE_TYPES.has(prop.type)) continue

      // 类型级检查
      if (prop.type === 'number' && value) {
        if (Number.isNaN(Number(value))) {
          logs.push({
            level: 'error',
            message: `${col} 应为数字，实际为 "${value}"`,
            row: rowNum,
            column: col,
            time: Date.now(),
          })
        }
      }

      if (prop.type === 'checkbox') {
        const lower = value.toLowerCase()
        if (value && lower !== '✓' && lower !== 'true' && lower !== 'false' && lower !== 'yes' && lower !== 'no') {
          logs.push({
            level: 'warn',
            message: `${col} 应为布尔值，实际为 "${value}"`,
            row: rowNum,
            column: col,
            time: Date.now(),
          })
        }
      }

      if ((prop.type === 'url' || prop.type === 'email') && value) {
        // 宽松检查
        if (prop.type === 'email' && !value.includes('@')) {
          logs.push({
            level: 'warn',
            message: `${col} 格式可能不是有效邮箱: "${value}"`,
            row: rowNum,
            column: col,
            time: Date.now(),
          })
        }
      }
    }
  }

  return logs
}

// ── Notion 属性构造 ────────────────────────────────────────

/**
 * 将 Excel 行数据转换为 Notion API 的 properties 对象。
 * 跳过不支持的类型和空值。
 * @param imageUrls 可选的图片 URL 映射，key 为列名，value 为已上传到服务器的图片 URL 数组
 */
export function buildNotionProperties(
  row: Record<string, string>,
  schema: DbSchema,
  imageUrls?: Record<string, string[]>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {}

  for (const [col, value] of Object.entries(row)) {
    // 跳过"更新"标记列（仅用于标记需要更新的行，不写入 Notion）
    if (col === '更新') continue
    const prop = schema.properties[col]
    if (!prop || !IMPORTABLE_TYPES.has(prop.type)) continue

    switch (prop.type) {
      case 'title':
        properties[col] = {
          title: [{ text: { content: value } }],
        }
        break
      case 'rich_text':
        if (value) {
          properties[col] = {
            rich_text: [{ text: { content: value } }],
          }
        }
        break
      case 'select':
        if (value) {
          properties[col] = { select: { name: value } }
        }
        break
      case 'multi_select':
        if (value) {
          const names = value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
          properties[col] = {
            multi_select: names.map(n => ({ name: n })),
          }
        }
        break
      case 'number':
        if (value !== '') {
          properties[col] = { number: Number(value) }
        }
        break
      case 'checkbox':
        if (value !== '') {
          const lower = value.toLowerCase()
          properties[col] = { checkbox: lower === '✓' || lower === 'true' || lower === 'yes' }
        }
        break
      case 'url':
        if (value) {
          properties[col] = { url: value }
        }
        break
      case 'email':
        if (value) {
          properties[col] = { email: value }
        }
        break
      case 'phone_number':
        if (value) {
          properties[col] = { phone_number: value }
        }
        break
      case 'date':
        if (value) {
          const parsed = parseDate(value)
          if (parsed) {
            properties[col] = { date: { start: parsed } }
          }
        }
        break
      case 'status':
        if (value) {
          properties[col] = { status: { name: value } }
        }
        break
      case 'files':
        // files 类型：使用预先上传到服务器的外部 URL
        if (imageUrls && imageUrls[col] && imageUrls[col].length > 0) {
          properties[col] = {
            files: imageUrls[col].map(url => ({
              name: url.split('/').pop() || 'image',
              type: 'external',
              external: { url },
            })),
          }
        }
        break
    }
  }

  return properties
}

/** 解析日期字符串为 ISO 格式 */
function parseDate(value: string): string | null {
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  // YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(value)) return value.replace(/\//g, '-')
  // YYYY-MM-DD HH:mm
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(value)) return value
  // 其他尝试
  const d = new Date(value)
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 19) + 'Z'
  }
  return null
}

// ── Notion API 创建页面 ────────────────────────────────────

/**
 * 在指定数据库中创建一页。
 * 如果 apiKey 未配置则跳过。
 */
export async function createDatabasePage(
  databaseId: string,
  properties: Record<string, unknown>,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const body = {
    parent: { database_id: databaseId },
    properties,
  }

  try {
    const res = await fetch('/api/db-import/create-page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Notion-Token': apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      return { ok: false, error: `${res.status}: ${err}` }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 更新已存在的 Notion 数据库页面（PATCH /v1/pages/{pageId}）。
 * 通过中间件代理绕 CORS。
 * 请求体: { pageId, properties }
 */
export async function updateDatabasePage(
  pageId: string,
  properties: Record<string, unknown>,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/db-import/update-page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Notion-Token': apiKey,
      },
      body: JSON.stringify({ pageId, properties }),
    })

    if (!res.ok) {
      const err = await res.text()
      return { ok: false, error: `${res.status}: ${err}` }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── 图片上传（开发模式）─────────────────────────────────────

/**
 * 将 BufferedImage 通过 PicList 本地服务上传到已配图床（如 Gitee），
 * 获取公网可达的图片 URL（Notion files 属性 external.url 要求公网可达）。
 * 返回公网 URL，失败时返回 null。
 * 前提：PicList 需后台运行，默认端口 36677。
 */
export async function uploadImageForImport(
  image: BufferedImage,
): Promise<string | null> {
  // 用时间戳+随机数生成唯一文件名，避免 Gitee 同名文件冲突
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const blob = new Blob([image.buffer], { type: image.mimeType })
  const form = new FormData()
  form.append('file', blob, `import-${uniqueId}.${image.extension}`)

  try {
    const res = await fetch('http://127.0.0.1:36677/upload', {
      method: 'POST',
      body: form,
    })
    if (!res.ok) return null
    const json = await res.json() as { result?: string[] }
    if (json.result?.[0]) return json.result[0]
    return null
  } catch {
    return null
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
