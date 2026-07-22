<script setup lang="ts">
import { ref, computed, inject, watch, nextTick, type Ref } from 'vue'
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
} from '@/services/db-import'
import { useImportLog } from '@/composables/useImportLog'

// Filters
const filterText = ref('')

// ── 导出配置对话框 ──
const showExportDialog = ref(false)
type ExportColumnItem = { key: string; name: string; type: string; selected: boolean }
const exportColumns = ref<ExportColumnItem[]>([])
const exportDragIdx = ref<number | null>(null)
const exportDragOverIdx = ref<number | null>(null)

function openExportDialog() {
  if (!database.value) return
  exportColumns.value = getColumnNames().map(c => ({ ...c, selected: true }))
  showExportDialog.value = true
}
function toggleExportColumn(idx: number) { exportColumns.value[idx].selected = !exportColumns.value[idx].selected }
function onExportDragStart(idx: number, e: DragEvent) { exportDragIdx.value = idx; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)) } }
function onExportDragOver(idx: number, e: DragEvent) { e.preventDefault(); exportDragOverIdx.value = idx; if (e.dataTransfer) e.dataTransfer.dropEffect = 'move' }
function onExportDragLeave() { exportDragOverIdx.value = null }
function onExportDrop(idx: number) { const from = exportDragIdx.value; if (from === null || from === idx) return; const items = [...exportColumns.value]; const [moved] = items.splice(from, 1); items.splice(idx, 0, moved); exportColumns.value = items; exportDragIdx.value = null; exportDragOverIdx.value = null }
function onExportDragEnd() { exportDragIdx.value = null; exportDragOverIdx.value = null }
function confirmExport() { showExportDialog.value = false; doExportXlsx() }

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

/** 打开导出配置对话框 */
function exportXlsx() {
  openExportDialog()
}

/** 执行 xlsx 导出（使用 exportColumns 配置） */
async function doExportXlsx() {
  if (!database.value || database.value.rows.length === 0) return

  try {
    const ExcelJS = await import('exceljs')
    const JSZipMod = await import('jszip')
    const JSZip = JSZipMod.default || JSZipMod

    const cols = exportColumns.value.filter(c => c.selected)
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
        excelRow.height = IMG_SIZE * 0.375
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

    // ── title 列相邻重复值垂直合并 ──
    const titleColIdx = cols.findIndex(c => c.type === 'title')
    if (titleColIdx >= 0) {
      const colLetter = String.fromCharCode(65 + titleColIdx) // A, B, C...
      let mergeStart = 2 // 数据行从第 2 行开始（第 1 行是表头）
      let prevTitle = getCellText(rows[0]?.properties[cols[titleColIdx].key])

      for (let ri = 1; ri < rows.length; ri++) {
        const curTitle = getCellText(rows[ri].properties[cols[titleColIdx].key])
        if (curTitle !== prevTitle) {
          // 上一段结束，合并
          if (mergeStart < ri + 1) {
            ws.mergeCells(`${colLetter}${mergeStart}:${colLetter}${ri + 1}`)
          }
          mergeStart = ri + 2
          prevTitle = curTitle
        }
      }
      // 最后一段
      if (mergeStart < rows.length + 1) {
        ws.mergeCells(`${colLetter}${mergeStart}:${colLetter}${rows.length + 1}`)
      }
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

/** 判断当前数据库是否开启导入模式 */
/** 处理 Excel 文件导入 */
async function handleImport(file: File) {
  if (!database.value) return

  importDrawerOpen.value = true
  clearLogs()
  importing.value = true
  importProgress.value = null

  const apiKey = configStore.config.apiKey
  if (!apiKey) {
    log('❌ 未配置 Notion Integration Token，请在配置页设置')
    importing.value = false
    return
  }

  try {
    // 1. 解析 Excel（含嵌入图片）
    log('📊 正在解析 Excel 文件...')
    const { headers, rows, images } = await parseExcelFile(file)
    log(`  解析完成：${headers.length} 列, ${rows.length} 行数据, ${images.size} 张嵌入图片`)

    // 2. 构建 schema
    const schema = buildDbSchema(database.value)

    // 3. 列校验
    const colErrors = validateColumns(headers, schema)
    for (const e of colErrors) {
      log(`⚠ ${e.message}`)
    }

    // 4. 检测 Excel 是否有 id 列
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

    // 6. 行校验
    log('🔍 正在校验数据...')
    const rowLogs = validateRows(rows, schema, existingTitles, { idColumnKey, existingIds })
    for (const rl of rowLogs) {
      const tag = { info: '·', warn: '⚠', error: '❌', success: '✅', skip: '⏭', update: '🔄' }[rl.level] || '·'
      const prefix = rl.row ? `  R${rl.row}` : ''
      log(`  ${tag}${prefix} ${rl.message}`)
    }

    // 7. 统计
    const errors = rowLogs.filter(l => l.level === 'error' && l.row)
    const skips = rowLogs.filter(l => l.level === 'skip')
    const updates = rowLogs.filter(l => l.level === 'update')
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

    log(`📋 校验完成：${toCreate.length} 条待新增, ${toUpdate.length} 条待更新, ${skips.length} 条跳过, ${errors.length} 条有错误`)

    if (toProcess.length === 0) {
      log('⚠ 没有需要处理的数据')
      importing.value = false
      return
    }

    // 8. 逐行处理
    importProgress.value = { done: 0, total: toProcess.length }
    log(`🚀 开始处理 ${toProcess.length} 条数据（新增 ${toCreate.length}, 更新 ${toUpdate.length}）...`)

    // 构建映射
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
      if (errors.some(e => e.row === rn) || skips.some(s => s.row === rn)) continue

      const row = rows[i]
      const titleValue = row[schema.titleKey]
      const isUpdate = updates.some(u => u.row === rn)

      // 上传图片
      const imageUrls: Record<string, string[]> = {}
      const filesColumns = Object.keys(schema.properties).filter(k => schema.properties[k].type === 'files')
      let uploadAborted = false

      for (const col of filesColumns) {
        const key = `${col}:${rn}`
        const img = images.get(key)
        if (!img) continue

        await delay(2000)
        let url: string | null = null
        for (let attempt = 1; attempt <= 5; attempt++) {
          url = await uploadImageForImport(img)
          if (url) break
          if (attempt < 5) {
            log(`⚠ R${rn} "${titleValue}" ${col} 图片上传失败（第 ${attempt}/5 次），5s 后重试...`)
            await delay(5000)
          }
        }

        if (url) {
          imageUrls[col] = [url]
          log(`✅ R${rn} "${titleValue}" ${col} 图片上传成功`)
          await delay(5000)
        } else {
          log(`❌ R${rn} "${titleValue}" ${col} 图片上传失败（已重试 5 次），终止导入`)
          uploadAborted = true
          break
        }
      }

      if (uploadAborted) {
        importing.value = false
        return
      }

      const properties = buildNotionProperties(row, schema, imageUrls)
      let res: { ok: boolean; error?: string }

      if (isUpdate) {
        const excelId = idColumnKey ? (row[idColumnKey] || '').trim() : ''
        let pageId = excelId ? idToPageId.get(excelId.toLowerCase()) : undefined
        if (!pageId) pageId = titleToPageId.get(titleValue)
        if (!pageId) {
          log(`❌ R${rn} "${titleValue}" 未找到已有页面 ID，跳过更新`)
          importProgress.value.done++
          continue
        }
        res = await updateDatabasePage(pageId, properties, apiKey)
        if (res.ok) {
          log(`🔄 R${rn} "${titleValue}" 更新成功`)
        } else {
          log(`❌ R${rn} "${titleValue}" 更新失败: ${res.error}`)
        }
      } else {
        res = await createDatabasePage(props.block.id, properties, apiKey)
        if (res.ok) {
          log(`✅ R${rn} "${titleValue}" 导入成功`)
        } else {
          log(`❌ R${rn} "${titleValue}" 导入失败: ${res.error}`)
        }
      }

      importProgress.value.done++

      if (configStore.config.requestDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, configStore.config.requestDelay))
      }
    }

    const successCount = importProgress.value.done - rowLogs.filter(l => l.level === 'error').length
    log(`🎉 处理完成！成功 ${successCount} 条`)
  } catch (e) {
    log(`💥 ${e instanceof Error ? e.message : '导入过程异常'}`)
  } finally {
    importing.value = false
    importProgress.value = null
  }
}
</script>

<template>
  <!-- ── 导出配置对话框 ── -->
  <Teleport to="body">
    <Transition name="export-dialog-fade">
      <div v-if="showExportDialog" class="export-dialog-overlay" @click.self="showExportDialog = false">
        <div class="export-dialog">
          <div class="export-dialog-header">
            <span class="export-dialog-title">导出配置</span>
            <button class="export-dialog-close" @click="showExportDialog = false" title="关闭">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="export-dialog-body">
            <p class="export-dialog-desc">选择要导出的列并拖拽调整顺序。仅勾选的列会被导出。</p>
            <div class="export-dialog-actions">
              <button class="export-dialog-btn-sm" @click="exportColumns.forEach(c => c.selected = true)">全选</button>
              <button class="export-dialog-btn-sm" @click="exportColumns.forEach(c => c.selected = false)">取消全选</button>
            </div>
            <div class="export-column-list">
              <div v-for="(col, idx) in exportColumns" :key="col.key" class="export-column-item"
                :class="{'export-column-dragging': exportDragIdx === idx, 'export-column-dragover': exportDragOverIdx === idx}"
                draggable="true"
                @dragstart="onExportDragStart(idx, $event)"
                @dragover="onExportDragOver(idx, $event)"
                @dragleave="onExportDragLeave"
                @drop="onExportDrop(idx)"
                @dragend="onExportDragEnd">
                <span class="export-column-grip" title="拖拽排序">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="19" r="2"/></svg>
                </span>
                <label class="export-column-label" :for="'export-col-' + idx">
                  <input :id="'export-col-' + idx" type="checkbox" :checked="col.selected" class="export-column-checkbox" @change="toggleExportColumn(idx)">
                  <span class="export-column-name">{{ col.name }}</span>
                  <span class="export-column-type">{{ col.type }}</span>
                </label>
              </div>
            </div>
          </div>
          <div class="export-dialog-footer">
            <button class="export-dialog-btn" @click="showExportDialog = false">取消</button>
            <button class="export-dialog-btn export-dialog-btn-primary"
              :disabled="exportColumns.filter(c => c.selected).length === 0"
              @click="confirmExport">导出 ({{ exportColumns.filter(c => c.selected).length }} 列)</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
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

/* ── 导出配置对话框 ── */
.export-dialog-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
.export-dialog { background: var(--c-bg-primary); border-radius: 12px; width: 420px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.18); }
.export-dialog-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 12px; border-bottom: 1px solid var(--c-border); }
.export-dialog-title { font-size: 15px; font-weight: 600; color: var(--c-text); }
.export-dialog-close { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; border-radius: 6px; background: transparent; color: var(--c-text-secondary); cursor: pointer; transition: background 0.15s, color 0.15s; }
.export-dialog-close:hover { background: var(--c-bg-secondary); color: var(--c-text); }
.export-dialog-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
.export-dialog-desc { font-size: 12px; color: var(--c-text-secondary); margin: 0 0 10px; }
.export-dialog-actions { display: flex; gap: 6px; margin-bottom: 10px; }
.export-dialog-btn-sm { font-size: 11px; padding: 4px 10px; border: 1px solid var(--c-border); border-radius: 5px; background: var(--c-bg-secondary); color: var(--c-text-secondary); cursor: pointer; transition: background 0.15s; }
.export-dialog-btn-sm:hover { background: var(--c-bg-tertiary); color: var(--c-text); }
.export-column-list { display: flex; flex-direction: column; gap: 2px; max-height: 360px; overflow-y: auto; }
.export-column-item { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px; transition: background 0.15s, opacity 0.15s; }
.export-column-item:hover { background: var(--c-bg-secondary); }
.export-column-dragging { opacity: 0.5; }
.export-column-dragover { background: var(--c-brand-light) !important; }
.export-column-grip { display: flex; align-items: center; cursor: grab; color: var(--c-text-tertiary); flex-shrink: 0; opacity: 0.4; transition: opacity 0.15s; }
.export-column-grip:hover { opacity: 1; }
.export-column-label { display: flex; align-items: center; gap: 8px; flex: 1; cursor: pointer; user-select: none; }
.export-column-checkbox { width: 15px; height: 15px; accent-color: var(--c-brand); cursor: pointer; flex-shrink: 0; }
.export-column-name { font-size: 13px; color: var(--c-text); flex: 1; }
.export-column-type { font-size: 10px; padding: 1px 6px; border-radius: 10px; background: var(--c-bg-tertiary); color: var(--c-text-tertiary); text-transform: uppercase; flex-shrink: 0; }
.export-dialog-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid var(--c-border); }
.export-dialog-btn { font-size: 13px; padding: 7px 18px; border: 1px solid var(--c-border); border-radius: 7px; background: var(--c-bg-primary); color: var(--c-text); cursor: pointer; transition: background 0.15s; }
.export-dialog-btn:hover { background: var(--c-bg-secondary); }
.export-dialog-btn-primary { background: var(--c-brand) !important; color: #fff !important; border-color: var(--c-brand) !important; font-weight: 500; }
.export-dialog-btn-primary:hover { opacity: 0.9; }
.export-dialog-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.export-dialog-fade-enter-active, .export-dialog-fade-leave-active { transition: opacity 200ms ease; }
.export-dialog-fade-enter-from, .export-dialog-fade-leave-to { opacity: 0; }
</style>
