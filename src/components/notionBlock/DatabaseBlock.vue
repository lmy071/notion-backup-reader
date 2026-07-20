<script setup lang="ts">
import { ref, computed, inject, watch, type Ref } from 'vue'
import type { NotionBlock, NotionDatabase, DatabasePropertyValue, NotionDatabaseRow, DatabasePropertyConfig, NotionPage } from '@/types/notion'
import { storage } from '@/services/storage'
import { createMcpClient } from '@/services/mcp'
import { parseBlock } from '../../../notion-parser/index'
import { useConfigStore } from '@/stores/config'
import { useImageViewer } from '@/composables/useImageViewer'
import NotionRenderer from './NotionRenderer.vue'
import {
  parseExcelFile,
  buildDbSchema,
  validateColumns,
  validateRows,
  buildNotionProperties,
  createDatabasePage,
  updateDatabasePage,
  uploadImageForImport,
  type ImportLog,
} from '@/services/db-import'
import ImportLogDrawer from '@/components/common/ImportLogDrawer.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const readerRootPageId = inject<Ref<string>>('readerRootPageId')
const readerDate = inject<Ref<string>>('readerDate')

const database = ref<NotionDatabase | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// Drawer state
const drawerOpen = ref(false)
const selectedRowId = ref<string | null>(null)
const rowPageLoading = ref(false)
const rowPageBlocks = ref<NotionBlock[]>([])
const rowPageError = ref<string | null>(null)

// Import state
const configStore = useConfigStore()
const importLogs = ref<ImportLog[]>([])
const importDrawerOpen = ref(false)
const importing = ref(false)
const importProgress = ref<{ done: number; total: number } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

// Filters
const filterText = ref('')

// Filtered rows based on search keyword
const filteredRows = computed<NotionDatabaseRow[]>(() => {
  if (!database.value) return []
  const keyword = filterText.value.trim().toLowerCase()
  if (!keyword) return database.value.rows

  const cols = getColumnNames()
  return database.value.rows.filter(row => {
    return cols.some(col => {
      const val = getCellText(row.properties[col.key])
      return val.toLowerCase().includes(keyword)
    })
  })
})

const filterResultCount = computed(() => {
  if (!database.value) return 0
  return filteredRows.value.length
})

function clearFilter() {
  filterText.value = ''
}

const selectedRow = computed<NotionDatabaseRow | null>(() => {
  if (!database.value || !selectedRowId.value) return null
  return database.value.rows.find(r => r.id === selectedRowId.value) ?? null
})

// Try from provided pageDatabases first, then fall back to API
const pageDatabases = inject<Ref<Record<string, NotionDatabase>> | null>('pageDatabases', null)

async function loadDatabase() {
  const root = readerRootPageId?.value
  const date = readerDate?.value
  const dbId = props.block.id
  if (!root || !date || !dbId) return

  // Check if already provided via inject
  if (pageDatabases?.value?.[dbId]) {
    const db = pageDatabases.value[dbId]
    if (db && db.rows) {
      database.value = db
      return
    }
  }

  loading.value = true
  error.value = null
  try {
    // Fallback: try direct API call
    // The page API already includes databases per-page, so this is a rare path
    const pageRes = await storage.getPage(root, date, root)
    if (pageRes?.databases?.[dbId]) {
      database.value = pageRes.databases[dbId] as unknown as NotionDatabase
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

watch(
  () => [readerRootPageId?.value, readerDate?.value, props.block.id, pageDatabases?.value],
  () => { loadDatabase() },
  { immediate: true },
)

// Extract column names from database properties
function getColumnNames(): Array<{ key: string; name: string; type: string }> {
  if (!database.value) return []
  const cols = Object.entries(database.value.properties).map(([key, config]) => ({
    key,
    name: config.name || key,
    type: config.type || '',
  }))
  // title 列始终排在最左
  return cols.sort((a, b) => {
    if (a.type === 'title') return -1
    if (b.type === 'title') return 1
    return 0
  })
}

/** 获取某列的 type 字符串 */
function getColumnType(colKey: string): string {
  return database.value?.properties[colKey]?.type ?? ''
}

// Extract file items from a files property value
function getFilesList(val: DatabasePropertyValue | undefined): Array<{ name: string; url: string }> {
  if (!val || val.type !== 'files') return []
  return (val.files ?? []).map(f => ({
    name: f.name,
    url: f.file?.url ?? f.external?.url ?? '',
  }))
}

/** 判断文件是否为图片（按扩展名） */
function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(name)
}

const { open: openImageViewer } = useImageViewer()

// Extract cell text by property type (text-only, no HTML)
function getCellText(val: DatabasePropertyValue | undefined): string {
  if (!val) return ''
  switch (val.type) {
    case 'title':
      return val.title?.[0]?.plain_text ?? ''
    case 'rich_text':
      return val.rich_text?.map(t => t.plain_text).join('') ?? ''
    case 'select':
      return val.select?.name ?? ''
    case 'multi_select':
      return val.multi_select?.map(s => s.name).join(', ') ?? ''
    case 'date':
      return val.date?.start ?? ''
    case 'number':
      return String(val.number ?? '')
    case 'checkbox':
      return val.checkbox ? '✓' : ''
    case 'url':
      return val.url ?? ''
    case 'email':
      return val.email ?? ''
    case 'phone_number':
      return val.phone_number ?? ''
    case 'status':
      return val.status?.name ?? ''
    case 'formula': {
      const f = val.formula
      if (!f) return ''
      if (f.type === 'string') return f.string ?? ''
      if (f.type === 'number') return String(f.number ?? '')
      if (f.type === 'boolean') return f.boolean ? '✓' : ''
      return ''
    }
    case 'people':
      return val.people?.map(p => p.name ?? p.person?.email ?? '').join(', ') ?? ''
    case 'files':
      return val.files?.map(f => f.name).join(', ') ?? ''
    case 'created_time':
      return formatTime(val.created_time)
    case 'last_edited_time':
      return formatTime(val.last_edited_time)
    default:
      return ''
  }
}

async function openDrawer(rowId: string) {
  selectedRowId.value = rowId
  drawerOpen.value = true
  // 加载行页面的正文内容
  await loadRowPageContent(rowId)
}

function closeDrawer() {
  drawerOpen.value = false
  selectedRowId.value = null
  rowPageBlocks.value = []
  rowPageError.value = null
}

async function loadRowPageContent(rowId: string) {
  const rid = readerRootPageId?.value
  const d = readerDate?.value
  if (!rid || !d) return

  rowPageLoading.value = true
  rowPageError.value = null
  rowPageBlocks.value = []

  try {
    // 1. 先从当前行数据的 blocks 字段取（同步时已写入）
    const row = database.value?.rows.find(r => r.id === rowId)
    if (row?.blocks && row.blocks.length > 0) {
      rowPageBlocks.value = row.blocks
      rowPageLoading.value = false
      return
    }

    // 2. 尝试从本地 JSON 加载（可能曾作为独立页面同步）
    const result = await storage.getPage(rid, d, rowId)
    if (result?.page?.blocks && result.page.blocks.length > 0) {
      rowPageBlocks.value = result.page.blocks
      return
    }

    // 3. 回退到 Notion API 在线获取
    const apiKey = configStore.apiKey
    if (!apiKey) {
      // 无 API Key → 静默，不展示正文区
      return
    }
    const client = createMcpClient(apiKey)
    const resp = await client.fetchBlockChildren(rowId, undefined)
    if (resp?.results && Array.isArray(resp.results) && resp.results.length > 0) {
      rowPageBlocks.value = resp.results.map((b: Record<string, unknown>) => parseBlock(b as NotionBlock))
    }
    // 空 blocks → 不展示正文区，静默
  } catch (e) {
    rowPageError.value = e instanceof Error ? e.message : '加载正文失败'
  } finally {
    rowPageLoading.value = false
  }
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

function formatDrawerValue(val: DatabasePropertyValue | undefined): string {
  if (!val) return '-'
  switch (val.type) {
    case 'title':
      return val.title?.map(t => t.plain_text).join('') ?? '-'
    case 'rich_text':
      return val.rich_text?.map(t => t.plain_text).join('') ?? '-'
    case 'select':
      return val.select?.name ?? '-'
    case 'multi_select':
      return val.multi_select?.map(s => s.name).join(', ') ?? '-'
    case 'date': {
      const d = val.date
      if (!d) return '-'
      if (d.end) return `${d.start} → ${d.end}`
      return d.start
    }
    case 'number':
      return val.number != null ? String(val.number) : '-'
    case 'checkbox':
      return val.checkbox ? '✅' : '☐'
    case 'url':
      return val.url ?? '-'
    case 'email':
      return val.email ?? '-'
    case 'phone_number':
      return val.phone_number ?? '-'
    case 'status':
      return val.status?.name ?? '-'
    case 'formula': {
      const f = val.formula
      if (!f) return '-'
      if (f.type === 'string') return f.string ?? '-'
      if (f.type === 'number') return String(f.number ?? '')
      if (f.type === 'boolean') return f.boolean ? '✅' : '☐'
      return '-'
    }
    case 'people':
      return val.people?.map(p => p.name ?? p.person?.email ?? '').join(', ') ?? '-'
    case 'files':
      return val.files?.map(f => f.name).join(', ') ?? '-'
    case 'created_time':
      return formatTime(val.created_time)
    case 'last_edited_time':
      return formatTime(val.last_edited_time)
    default:
      return '-'
  }
}

function getPropertyConfig(key: string): DatabasePropertyConfig | undefined {
  return database.value?.properties[key]
}

/** 导出当前数据为 xlsx 文件并触发下载 */
async function exportXlsx() {
  if (!database.value || database.value.rows.length === 0) return

  try {
    const ExcelJS = await import('exceljs')
    const JSZipMod = await import('jszip')
    const JSZip = JSZipMod.default || JSZipMod

    const cols = getColumnNames()
    const rows = filteredRows.value
    const filesCols = cols.filter(c => c.type === 'files')

    // ── 预取图片：url → { buffer, ext, localId } ──
    const imageRegistry = new Map<string, { buffer: ArrayBuffer; ext: string; localId: number; guid: string }>()
    let nextImageId = 1

    if (filesCols.length > 0) {
      await Promise.all(
        rows.flatMap(row =>
          filesCols.flatMap(col => {
            const val = row.properties[col.key]
            if (val?.type !== 'files') return []
            return (val.files ?? [])
              .map(f => f.file?.url ?? f.external?.url ?? '')
              .filter(url => url && !imageRegistry.has(url))
              .map(async url => {
                try {
                  const resp = await fetch(url)
                  if (resp.ok) {
                    const buffer = await resp.arrayBuffer()
                    const ext = (url.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'png')
                    // SHA-256 整个图片 buffer 生成唯一 GUID（PNG 前 16 字节全部相同）
                    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
                    const guid = 'ID_' + Array.from(new Uint8Array(hashBuffer))
                      .map(b => b.toString(16).padStart(2, '0'))
                      .join('')
                      .toUpperCase()
                    imageRegistry.set(url, { buffer, ext, localId: nextImageId++, guid })
                  }
                } catch { /* image fetch failed, skip */ }
              })
          })
        )
      )
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Notion Reader'
    const sheetName = (database.value.title || 'Sheet1').slice(0, 31)
    const ws = wb.addWorksheet(sheetName)

    // ── 表头行 ──
    const headerRow = ws.addRow(cols.map(c => c.name))
    headerRow.eachCell(cell => {
      cell.font = { bold: true, size: 11 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })

    // ── 构建 GUID 查找（已在 fetch 阶段计算好） ──
    const imageEntries: Array<{ guid: string; ext: string; buffer: ArrayBuffer; localId: number }> = []
    const imageGuidMap = new Map<string, string>() // url → GUID
    for (const [url, info] of imageRegistry) {
      imageEntries.push(info)
      imageGuidMap.set(url, info.guid)
    }

    // ── 数据行 ──
    const IMG_SIZE = 160 // px
    for (const [ri, row] of rows.entries()) {
      const excelRow = ws.addRow(
        cols.map(col => {
          const val = row.properties[col.key]
          if (val?.type === 'files') {
            return (val.files ?? []).map(f => f.name).join('\n')
          }
          return getCellText(val)
        })
      )
      if (filesCols.length > 0) {
        excelRow.height = IMG_SIZE * 0.75
      }

      // 图片列写入 DISPIMG 公式
      for (const [ci, col] of cols.entries()) {
        const val = row.properties[col.key]
        if (val?.type !== 'files') continue
        const files = val.files ?? []
        if (files.length === 0) continue

        const url = files[0].file?.url ?? files[0].external?.url ?? ''
        const guid = imageGuidMap.get(url)
        if (!guid) continue

        const cell = excelRow.getCell(ci + 1)
        cell.value = { formula: `_xlfn.DISPIMG("${guid}",1)`, result: '' }

        ws.getColumn(ci + 1).width = Math.max(22, 14)
      }

      excelRow.eachCell(cell => {
        cell.alignment = { vertical: 'middle', wrapText: true }
      })
    }

    // ── 列宽（非图片列） ──
    for (const [ci, col] of cols.entries()) {
      if (col.type === 'files') continue
      const dataLengths = rows.map(row => getCellText(row.properties[col.key]).length)
      const maxLen = Math.max(col.name.length, ...dataLengths)
      ws.getColumn(ci + 1).width = Math.min((maxLen + 3) * 2, 80)
    }

    // ── 生成 xlsx 并注入 cellimages ──
    const xlsxBuffer = await wb.xlsx.writeBuffer()
    const zip = await JSZip.loadAsync(xlsxBuffer)

    if (imageEntries.length > 0) {
      // 构建 cellimages.xml.rels
      const relsLines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      ]
      for (const entry of imageEntries) {
        relsLines.push(
          `  <Relationship Id="rId${entry.localId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${entry.localId}.${entry.ext}"/>`
        )
      }
      relsLines.push('</Relationships>')
      zip.file('xl/_rels/cellimages.xml.rels', relsLines.join('\n'))

      // 构建 cellimages.xml
      const cellImagesLines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<etc:cellImages xmlns:etc="http://www.wps.cn/officeDocument/2017/etCustomData"',
        '  xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"',
        '  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
        '  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      ]
      let cNvPrId = 2
      for (const entry of imageEntries) {
        cellImagesLines.push(
          `  <etc:cellImage>`,
          `    <xdr:pic>`,
          `      <xdr:nvPicPr>`,
          `        <xdr:cNvPr id="${cNvPrId}" name="${entry.guid}"/>`,
          `        <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>`,
          `      </xdr:nvPicPr>`,
          `      <xdr:blipFill>`,
          `        <a:blip r:embed="rId${entry.localId}"/>`,
          `        <a:stretch><a:fillRect/></a:stretch>`,
          `      </xdr:blipFill>`,
          `      <xdr:spPr>`,
          `        <a:xfrm><a:off x="0" y="0"/><a:ext cx="952500" cy="952500"/></a:xfrm>`,
          `        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`,
          `        <a:noFill/><a:ln w="9525"><a:noFill/></a:ln>`,
          `      </xdr:spPr>`,
          `    </xdr:pic>`,
          `  </etc:cellImage>`
        )
        cNvPrId += 2
      }
      cellImagesLines.push('</etc:cellImages>')
      zip.file('xl/cellimages.xml', cellImagesLines.join('\n'))

      // 添加图片文件到 xl/media/
      for (const entry of imageEntries) {
        zip.file(`xl/media/image${entry.localId}.${entry.ext}`, entry.buffer, { binary: true })
      }

      // 在 workbook.xml.rels 中添加 cellimages.xml 的引用
      // WPS 必须通过此关系发现 cellimages.xml
      const wbRelsFile = zip.file('xl/_rels/workbook.xml.rels')
      if (wbRelsFile) {
        const wbRelsXml = await wbRelsFile.async('text')
        // 找到最大 rId 编号
        const rIdPattern = /rId(\d+)/g
        let maxRId = 0
        let m: RegExpExecArray | null
        while ((m = rIdPattern.exec(wbRelsXml)) !== null) {
          maxRId = Math.max(maxRId, parseInt(m[1]))
        }
        const nextRId = maxRId + 1
        const updatedRels = wbRelsXml.replace(
          '</Relationships>',
          `  <Relationship Id="rId${nextRId}" Type="http://www.wps.cn/officeDocument/2020/cellImage" Target="cellimages.xml"/>\n</Relationships>`
        )
        zip.file('xl/_rels/workbook.xml.rels', updatedRels)
      }

      // 更新 [Content_Types].xml
      const contentTypesFile = zip.file('[Content_Types].xml')
      if (contentTypesFile) {
        const contentTypesXml = await contentTypesFile.async('text')
        const extraParts = [
          '<Override PartName="/xl/cellimages.xml" ContentType="application/vnd.wps-officedocument.cellimage+xml"/>',
        ]
        for (const entry of imageEntries) {
          if (!contentTypesXml.includes(`Extension="${entry.ext}"`)) {
            extraParts.push(`<Default Extension="${entry.ext}" ContentType="image/${entry.ext === 'jpg' ? 'jpeg' : entry.ext}"/>`)
          }
        }
        const updatedContentTypes = contentTypesXml.replace(
          '</Types>',
          [...new Set(extraParts)].join('\n') + '\n</Types>'
        )
        zip.file('[Content_Types].xml', updatedContentTypes)
      }
    }

    // ── 下载 ──
    const finalBuffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
    const fileName = `${(database.value.title || 'export').replace(/[\\/:*?"<>|]/g, '_')}.xlsx`
    const blob = new Blob([finalBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName
    link.click()
    URL.revokeObjectURL(link.href)
  } catch (e) {
    console.error('导出失败:', e)
    alert(`导出失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ── 导入 Excel ────────────────────────────────────────────

const showImport = computed(() => {
  return configStore.config.enableDbImport
})

/** 判断当前数据库是否开启导入模式 */
const importEnabled = computed(() => {
  return configStore.config.enableDbImport && !!props.block.id
})

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 触发文件选择 */
function triggerImport() {
  fileInput.value?.click()
}

/** 处理 Excel 文件导入 */
async function handleImport(file: File) {
  if (!database.value) return

  importDrawerOpen.value = true
  importLogs.value = []
  importing.value = true
  importProgress.value = null

  const apiKey = configStore.config.apiKey
  if (!apiKey) {
    importLogs.value.push({
      level: 'error',
      message: '未配置 Notion Integration Token，请在配置页设置',
      time: Date.now(),
    })
    importing.value = false
    return
  }

  try {
    // 1. 解析 Excel（含嵌入图片）
    importLogs.value.push({ level: 'info', message: '正在解析 Excel 文件...', time: Date.now() })
    const { headers, rows, images } = await parseExcelFile(file)
    importLogs.value.push({
      level: 'info',
      message: `解析完成：${headers.length} 列, ${rows.length} 行数据, ${images.size} 张嵌入图片`,
      time: Date.now(),
    })

    // 2. 构建 schema
    const schema = buildDbSchema(database.value)

    // 3. 列校验
    const colErrors = validateColumns(headers, schema)
    for (const e of colErrors) {
      importLogs.value.push({ level: 'warn', message: e.message, column: e.column, time: Date.now() })
    }

    // 4. 检测 Excel 是否有 id 列（不区分大小写），用于优先 ID 匹配
    const idColumnKey = headers.find(h => h.toLowerCase() === 'id')
    const existingIds = new Set<string>()
    if (idColumnKey) {
      for (const dbRow of database.value.rows) {
        existingIds.add(dbRow.id.toLowerCase())
      }
    }

    // 5. 构建已有 title 集合
    const existingTitles = new Set<string>()
    for (const row of database.value.rows) {
      const titleKey = schema.titleKey
      if (!titleKey) continue
      const val = row.properties[titleKey]
      if (val?.type === 'title') {
        const t = val.title?.map(t => t.plain_text).join('') ?? ''
        if (t) existingTitles.add(t)
      }
    }

    // 6. 行校验（优先 ID 列匹配，其次 title 匹配）
    importLogs.value.push({ level: 'info', message: '正在校验数据...', time: Date.now() })
    const rowLogs = validateRows(rows, schema, existingTitles, {
      idColumnKey,
      existingIds,
    })
    importLogs.value.push(...rowLogs)

    // 7. 统计
    const errors = importLogs.value.filter(l => l.level === 'error' && l.row)
    const skips = importLogs.value.filter(l => l.level === 'skip')
    const updates = importLogs.value.filter(l => l.level === 'update')
    const toProcess = rows.filter((_, i) => {
      const rn = i + 1
      return !errors.some(e => e.row === rn) && !skips.some(s => s.row === rn)
    })
    const toCreate = toProcess.filter((_, i) => {
      const rn = rows.indexOf(toProcess[i]) + 1
      return !updates.some(u => u.row === rn)
    })
    const toUpdate = toProcess.filter((_, i) => {
      const rn = rows.indexOf(toProcess[i]) + 1
      return updates.some(u => u.row === rn)
    })

    importLogs.value.push({
      level: 'info',
      message: `校验完成：${toCreate.length} 条待新增, ${toUpdate.length} 条待更新, ${skips.length} 条跳过, ${errors.length} 条有错误`,
      time: Date.now(),
    })

    if (toProcess.length === 0) {
      importLogs.value.push({ level: 'warn', message: '没有需要处理的数据', time: Date.now() })
      importing.value = false
      return
    }

    // 8. 逐行处理（新增 + 更新）
    importProgress.value = { done: 0, total: toProcess.length }
    importLogs.value.push({ level: 'info', message: `开始处理 ${toProcess.length} 条数据（新增 ${toCreate.length}, 更新 ${toUpdate.length}）...`, time: Date.now() })

    // 构建 ID → pageId 映射（优先）和 title → pageId 映射（兜底）
    const idToPageId = new Map<string, string>()
    const titleToPageId = new Map<string, string>()
    for (const dbRow of database.value.rows) {
      idToPageId.set(dbRow.id.toLowerCase(), dbRow.id)
      const val = dbRow.properties[schema.titleKey]
      if (val?.type === 'title') {
        const t = val.title?.map(t => t.plain_text).join('') ?? ''
        if (t) titleToPageId.set(t, dbRow.id)
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const rn = i + 1
      // 跳过错误行和已存在行
      if (errors.some(e => e.row === rn) || skips.some(s => s.row === rn)) continue

      const row = rows[i]
      const titleValue = row[schema.titleKey]
      const isUpdate = updates.some(u => u.row === rn)

      // 7a. 上传 files 列的图片到 PicList 图床（带重试）
      const imageUrls: Record<string, string[]> = {}
      const filesColumns = Object.keys(schema.properties).filter(
        k => schema.properties[k].type === 'files',
      )
      let uploadAborted = false

      for (const col of filesColumns) {
        const key = `${col}:${rn}`
        const img = images.get(key)
        if (!img) continue

        // 上传前间隔 1s
        await delay(2000)

        // 重试逻辑：最多 5 次，间隔 5s
        let url: string | null = null
        for (let attempt = 1; attempt <= 5; attempt++) {
          url = await uploadImageForImport(img)
          if (url) break

          if (attempt < 5) {
            importLogs.value.push({
              level: 'warn',
              message: `"${titleValue}" ${col} 图片上传失败（第 ${attempt}/5 次），5s 后重试...`,
              row: rn,
              column: col,
              time: Date.now(),
            })
            await delay(5000)
          }
        }

        if (url) {
          imageUrls[col] = [url]
          importLogs.value.push({
            level: 'success',
            message: `"${titleValue}" ${col} 图片上传成功`,
            row: rn,
            column: col,
            time: Date.now(),
          })
          // 成功后间隔 1s 再继续下一张
          await delay(5000)
        } else {
          importLogs.value.push({
            level: 'error',
            message: `"${titleValue}" ${col} 图片上传失败（已重试 5 次），终止导入`,
            row: rn,
            column: col,
            time: Date.now(),
          })
          uploadAborted = true
          break
        }
      }

      if (uploadAborted) {
        importing.value = false
        return
      }

      // 7b. 构建 Notion properties（"更新"列自动跳过）
      const properties = buildNotionProperties(row, schema, imageUrls)

      let res: { ok: boolean; error?: string }
      if (isUpdate) {
        // 更新已有页面：优先用 ID 列查找，其次用 title
        const excelId = idColumnKey ? (row[idColumnKey] || '').trim() : ''
        let pageId = excelId ? idToPageId.get(excelId.toLowerCase()) : undefined
        if (!pageId) pageId = titleToPageId.get(titleValue)
        if (!pageId) {
          importLogs.value.push({
            level: 'error',
            message: `"${titleValue}" 未找到已有页面 ID，跳过更新`,
            row: rn,
            time: Date.now(),
          })
          importProgress.value.done++
          continue
        }
        res = await updateDatabasePage(pageId, properties, apiKey)
        if (res.ok) {
          importLogs.value.push({
            level: 'success',
            message: `"${titleValue}" 更新成功`,
            row: rn,
            time: Date.now(),
          })
        } else {
          importLogs.value.push({
            level: 'error',
            message: `"${titleValue}" 更新失败: ${res.error}`,
            row: rn,
            time: Date.now(),
          })
        }
      } else {
        // 新增页面
        res = await createDatabasePage(props.block.id, properties, apiKey)
        if (res.ok) {
          importLogs.value.push({
            level: 'success',
            message: `"${titleValue}" 导入成功`,
            row: rn,
            time: Date.now(),
          })
        } else {
          importLogs.value.push({
            level: 'error',
            message: `"${titleValue}" 导入失败: ${res.error}`,
            row: rn,
            time: Date.now(),
          })
        }
      }

      importProgress.value.done++

      // 请求间隔
      if (configStore.config.requestDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, configStore.config.requestDelay))
      }
    }

    importLogs.value.push({
      level: 'info',
      message: `处理完成！成功 ${importLogs.value.filter(l => l.level === 'success').length} 条`,
      time: Date.now(),
    })
  } catch (e) {
    importLogs.value.push({
      level: 'error',
      message: e instanceof Error ? e.message : '导入过程异常',
      time: Date.now(),
    })
  } finally {
    importing.value = false
    importProgress.value = null
  }
}
</script>

<template>
  <div class="my-4">
    <!-- Loading skeleton -->
    <div v-if="loading" class="overflow-x-auto rounded-lg" style="border: 1px solid var(--c-table-border)">
      <table class="w-full border-collapse">
        <thead>
          <tr style="background-color: var(--c-table-header-bg)">
            <th v-for="i in 3" :key="i" class="px-4 py-3 text-left text-sm font-medium" style="color: var(--c-text-secondary)">
              <div class="h-4 rounded animate-pulse" style="width: 80px; background-color: var(--c-border)" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="i in 3" :key="i" :style="{ borderTop: i > 1 ? '1px solid var(--c-table-border)' : 'none' }">
            <td v-for="j in 3" :key="j" class="px-4 py-2">
              <div class="h-3 rounded animate-pulse" style="width: 60px; background-color: var(--c-border)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="p-4 rounded-lg text-sm" style="color: var(--c-text-tertiary); background-color: var(--c-bg-secondary)">
      ⚠️ 数据库加载失败: {{ error }}
    </div>

    <!-- Empty state -->
    <div v-else-if="!database?.rows?.length" class="p-4 rounded-lg text-sm text-center" style="color: var(--c-text-tertiary); background-color: var(--c-bg-secondary); border: 1px solid var(--c-border)">
      📊 空数据库
    </div>

    <!-- Database table -->
    <div v-else class="overflow-x-auto rounded-lg" style="border: 1px solid var(--c-table-border)">
      <!-- Database title bar -->
      <div
        class="flex items-center justify-between px-4 py-2"
        style="background-color: var(--c-table-header-bg); border-bottom: 1px solid var(--c-table-border)"
      >
        <span
          v-if="database.title"
          class="text-sm font-medium shrink-0"
          style="color: var(--c-text-secondary)"
        >
          {{ database.title }}
        </span>
        <span v-else class="shrink-0" />

        <!-- Filter input -->
        <div class="flex items-center gap-2">
          <!-- Export xlsx -->
          <button
            class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer"
            style="background-color: var(--c-brand-light); color: var(--c-brand)"
            title="导出为 Excel 文件"
            @click.stop="exportXlsx"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{{ filterResultCount !== database.rows?.length && filteredRows.length < (database.rows?.length ?? 0) ? `导出 (${filteredRows.length})` : '导出' }}</span>
          </button>
          <!-- Import xlsx (only when db import mode is enabled) -->
          <button
            v-if="showImport"
            class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer"
            style="background-color: var(--c-brand-light); color: var(--c-brand)"
            title="从 Excel 导入数据"
            @click.stop="triggerImport"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>导入</span>
          </button>
          <input
            ref="fileInput"
            type="file"
            accept=".xlsx,.xls"
            class="hidden"
            @change="(e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleImport(f); (e.target as HTMLInputElement).value = '' }"
          />
          <div
            v-if="filterResultCount !== database.rows?.length"
            class="text-xs shrink-0"
            style="color: var(--c-text-tertiary)"
          >
            {{ filterResultCount }} / {{ database.rows?.length }}
          </div>
          <div class="relative">
            <input
              v-model="filterText"
              type="text"
              placeholder="过滤…"
              class="text-xs rounded border px-2 py-1 outline-none transition-colors"
              :style="{
                width: '140px',
                backgroundColor: 'var(--c-bg)',
                color: 'var(--c-text)',
                borderColor: filterText ? 'var(--c-brand)' : 'var(--c-border)',
              }"
            />
            <button
              v-if="filterText"
              class="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full text-xs leading-none cursor-pointer"
              style="color: var(--c-text-tertiary)"
              @click="clearFilter"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <div class="overflow-x-auto" style="max-height: 480px; overflow-y: auto">
        <table class="w-full border-collapse min-w-max">
          <thead class="sticky top-0 z-10">
            <tr style="background-color: var(--c-table-header-bg)">
              <th
                v-for="col in getColumnNames()"
                :key="col.key"
                class="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                style="color: var(--c-text-secondary); border-bottom: 2px solid var(--c-table-border)"
              >
                {{ col.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, rowIdx) in filteredRows"
              :key="row.id"
              class="cursor-pointer transition-colors"
              :style="{
                borderTop: rowIdx > 0 ? '1px solid var(--c-table-border)' : 'none',
                backgroundColor: rowIdx % 2 === 0 ? 'var(--c-bg)' : 'var(--c-bg-secondary)',
              }"
              @click="openDrawer(row.id)"
            >
              <td
                v-for="col in getColumnNames()"
                :key="col.key"
                class="px-4 py-2 text-sm whitespace-nowrap"
                style="color: var(--c-text)"
              >
                <!-- files type: show thumbnails -->
                <template v-if="getColumnType(col.key) === 'files'">
                  <div class="flex items-center gap-1.5">
                    <div
                      v-for="(f, fi) in getFilesList(row.properties[col.key])"
                      :key="fi"
                      class="block rounded border overflow-hidden shrink-0"
                      :style="{
                        width: '40px',
                        height: '40px',
                        borderColor: 'var(--c-border)',
                        cursor: isImageFile(f.name) ? 'zoom-in' : 'pointer',
                      }"
                      @click="isImageFile(f.name) ? openImageViewer(f.url) : window.open(f.url, '_blank')"
                    >
                      <img
                        v-if="isImageFile(f.name)"
                        :src="f.url"
                        :alt="f.name"
                        class="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div
                        v-else
                        class="w-full h-full flex items-center justify-center text-10px"
                        style="color: var(--c-text-tertiary)"
                      >
                        📄
                      </div>
                    </div>
                  </div>
                </template>
                <!-- other types: plain text -->
                <template v-else>
                  {{ getCellText(row.properties[col.key]) }}
                </template>
              </td>
            </tr>
            <!-- No results after filter -->
            <tr v-if="filterText && filteredRows.length === 0">
              <td
                :colspan="getColumnNames().length"
                class="px-4 py-8 text-center text-sm"
                style="color: var(--c-text-tertiary)"
              >
                无匹配结果
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Row detail drawer -->
    <Teleport to="body">
      <Transition name="drawer-fade">
        <div
          v-if="drawerOpen"
          class="fixed inset-0 z-40"
          style="background-color: rgba(0,0,0,0.3)"
          @click="closeDrawer"
        />
      </Transition>

      <Transition name="drawer-slide">
        <div
          v-if="drawerOpen"
          class="fixed top-0 right-0 h-full z-50 flex flex-col shadow-2xl"
          style="width: 40%; min-width: 360px; max-width: 90vw; background-color: var(--c-bg);"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between px-6 py-4 shrink-0"
            style="border-bottom: 1px solid var(--c-border); background-color: var(--c-bg-secondary)"
          >
            <h3 class="text-sm font-semibold uppercase tracking-wider" style="color: var(--c-text-secondary)">
              行详情
            </h3>
            <button
              class="w-7 h-7 flex items-center justify-center rounded-full transition-colors cursor-pointer"
              style="color: var(--c-text-secondary)"
              @click="closeDrawer"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-6 py-5">
            <template v-if="selectedRow">
              <dl class="space-y-0">
                <div
                  v-for="col in getColumnNames()"
                  :key="col.key"
                  class="flex py-3"
                  :style="{ borderBottom: '1px solid var(--c-border-light)' }"
                >
                  <dt class="w-32 shrink-0 text-xs font-medium uppercase tracking-wide pt-0.5" style="color: var(--c-text-tertiary)">
                    {{ col.name }}
                  </dt>
                  <dd class="flex-1 min-w-0 text-sm leading-relaxed" :style="{ color: 'var(--c-text)' }">
                    <!-- files type: show images in drawer -->
                    <template v-if="getColumnType(col.key) === 'files'">
                      <div class="flex flex-wrap gap-2">
                        <div
                          v-for="(f, fi) in getFilesList(selectedRow!.properties[col.key])"
                          :key="fi"
                          class="block rounded border overflow-hidden"
                          :style="{
                            width: isImageFile(f.name) ? '120px' : '40px',
                            height: isImageFile(f.name) ? '120px' : '40px',
                            borderColor: 'var(--c-border)',
                            cursor: isImageFile(f.name) ? 'zoom-in' : 'pointer',
                          }"
                          @click="isImageFile(f.name) ? openImageViewer(f.url) : window.open(f.url, '_blank')"
                        >
                          <img
                            v-if="isImageFile(f.name)"
                            :src="f.url"
                            :alt="f.name"
                            class="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <div
                            v-else
                            class="w-full h-full flex items-center justify-center text-xs"
                            style="color: var(--c-text-tertiary)"
                          >
                            📄
                          </div>
                        </div>
                      </div>
                      <div class="text-xs mt-1" style="color: var(--c-text-tertiary)">
                        {{ getCellText(selectedRow!.properties[col.key]) }}
                      </div>
                    </template>
                    <!-- other types -->
                    <template v-else>
                      {{ formatDrawerValue(selectedRow!.properties[col.key]) }}
                    </template>
                  </dd>
                </div>
              </dl>

              <!-- 行页面正文内容 -->
              <div v-if="rowPageLoading" class="text-sm text-center py-4" style="color: var(--c-text-tertiary)">
                加载正文中...
              </div>
              <div v-else-if="rowPageError" class="text-sm text-center py-4" style="color: var(--c-text-tertiary)">
                {{ rowPageError }}
              </div>
              <div v-else-if="rowPageBlocks.length > 0" class="mt-4 pt-4" style="border-top: 2px solid var(--c-border)">
                <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--c-text-tertiary)">正文内容</h3>
                <div class="row-page-content">
                  <NotionRenderer :blocks="rowPageBlocks" />
                </div>
              </div>
            </template>
            <div v-else class="text-sm text-center py-8" style="color: var(--c-text-tertiary)">
              未选择行
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
  <!-- 导入日志抽屉 -->
  <ImportLogDrawer
    :open="importDrawerOpen"
    :logs="importLogs"
    :importing="importing"
    :import-progress="importProgress"
    @close="importDrawerOpen = false"
  />
</template>

<style scoped>
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 250ms ease;
}
.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}

/* 行详情抽屉内的页面正文渲染 */
.row-page-content :deep(.notion-block) {
  font-size: 0.875rem;
}
</style>
