/**
 * 数据库 Excel 导入服务
 *
 * 功能：
 * 1. 解析 Excel 文件（ExcelJS，格式与导出一致）
 * 2. 验证 Excel 列是否与 Notion 数据库属性匹配
 * 3. 识别已有行（按 title 列去重，支持增量导入）
 * 4. 通过 Notion API 逐行创建/更新页面
 *
 * 限制：
 * - 仅支持增量导入（不更新已有行，只新增不存在的行）
 * - 不支持 files 类型列的导入（图片等文件需手动上传）
 * - 不支持 people / formula 等复杂类型
 */

import type { NotionDatabase, DatabasePropertyConfig } from '@/types/notion'

// ── 日志类型 ───────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'skip'

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
])

const UNSUPPORTED_TYPES: Record<string, string> = {
  files: '不支持导入文件/图片列',
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
  for (let r = 2; r <= ws.lastRow.number; r++) {
    const row: Record<string, string> = {}
    const excelRow = ws.getRow(r)
    headers.forEach((header, ci) => {
      row[header] = String(excelRow.getCell(ci + 1).value ?? '').trim()
    })
    rows.push(row)
  }

  return { headers, rows }
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
 */
export function validateRows(
  rows: Record<string, string>[],
  schema: DbSchema,
  existingTitles: Set<string>,
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

    // 检查是否已存在（增量跳过）
    if (existingTitles.has(titleValue)) {
      logs.push({
        level: 'skip',
        message: `"${titleValue}" 已存在，跳过`,
        row: rowNum,
        time: Date.now(),
      })
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
 */
export function buildNotionProperties(
  row: Record<string, string>,
  schema: DbSchema,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {}

  for (const [col, value] of Object.entries(row)) {
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
          // 尝试解析多种日期格式
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
  const url = `https://api.notion.com/v1/pages`
  const body = {
    parent: { database_id: databaseId },
    properties,
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
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
