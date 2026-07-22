<script setup lang="ts">
import { ref, computed, inject, watch, nextTick, type Ref } from 'vue'
import type { NotionBlock, NotionDatabase, DatabasePropertyValue, NotionDatabaseRow, DatabasePropertyConfig, NotionPage } from '@/types/notion'
import { storage } from '@/services/storage'
import { createMcpClient } from '@/services/mcp'
import { parseBlock } from '../../../notion-parser/index'
import { useConfigStore } from '@/stores/config'
import { useImageViewer } from '@/composables/useImageViewer'
import NotionRenderer from './NotionRenderer.vue'

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

// Import state — 逐字终端式日志
const configStore = useConfigStore()

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
