<script setup lang="ts">
import { ref, computed, inject, watch, type Ref } from 'vue'
import type { NotionBlock, NotionDatabase, DatabasePropertyValue, NotionDatabaseRow, DatabasePropertyConfig } from '@/types/notion'
import { storage } from '@/services/storage'

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
    database.value = pageDatabases.value[dbId]
    return
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

function openDrawer(rowId: string) {
  selectedRowId.value = rowId
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  selectedRowId.value = null
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

  const ExcelJS = await import('exceljs')

  const cols = getColumnNames()
  const rows = filteredRows.value
  const filesCols = cols.filter(c => c.type === 'files')

  // 提前收集所有图片 URL，批量 fetch 为 buffer
  const imageCache = new Map<string, ArrayBuffer | null>()
  if (filesCols.length > 0) {
    await Promise.all(
      rows.flatMap(row =>
        filesCols.flatMap(col => {
          const val = row.properties[col.key]
          if (val?.type !== 'files') return []
          return (val.files ?? [])
            .map(f => f.file?.url ?? f.external?.url ?? '')
            .filter(url => url && !imageCache.has(url))
            .map(async url => {
              try {
                const resp = await fetch(url)
                if (resp.ok) {
                  imageCache.set(url, await resp.arrayBuffer())
                } else {
                  imageCache.set(url, null)
                }
              } catch {
                imageCache.set(url, null)
              }
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

  // ── 数据行 ──
  const IMG_SIZE = 160  // px
  for (const [ri, row] of rows.entries()) {
    const excelRow = ws.addRow(
      cols.map(col => {
        const val = row.properties[col.key]
        if (val?.type === 'files') {
          // files 列写文件名文本（图片用 addImage 嵌入）
          return (val.files ?? []).map(f => f.name).join('\n')
        }
        return getCellText(val)
      })
    )
    // 设置行高以容纳图片
    if (filesCols.length > 0) {
      excelRow.height = IMG_SIZE * 0.75  // px → pt 近似
    }

    // 嵌入图片
    for (const [ci, col] of cols.entries()) {
      const val = row.properties[col.key]
      if (val?.type !== 'files') continue
      const files = val.files ?? []
      for (const [fi, f] of files.entries()) {
        const url = f.file?.url ?? f.external?.url ?? ''
        if (!url) continue
        const buf = imageCache.get(url)
        if (!buf) continue
        // 从 URL 推断扩展名
        const ext = (url.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'png') as 'jpeg' | 'png' | 'gif'
        const imageId = wb.addImage({
          buffer: buf as unknown as Buffer,
          extension: ext,
        })
        // 多张图片水平并排摆放
        ws.addImage(imageId, {
          tl: { col: ci, row: ri + 1 },  // +1 因为表头占 row 0
          ext: { width: IMG_SIZE - 16, height: IMG_SIZE - 16 },
          editAs: 'oneCell',
        })
      }
      // 设置图片列宽（放宽容纳图片）
      const fileCount = files.length
      ws.getColumn(ci + 1).width = Math.max(fileCount * 22, 14)
    }

    // 对齐
    excelRow.eachCell(cell => {
      cell.alignment = { vertical: 'middle', wrapText: true }
    })
  }

  // ── 列宽（非图片列按文本长度 ×2） ──
  for (const [ci, col] of cols.entries()) {
    if (col.type === 'files') continue  // 图片列已在上面设宽
    const dataLengths = rows.map(row => getCellText(row.properties[col.key]).length)
    const maxLen = Math.max(col.name.length, ...dataLengths)
    ws.getColumn(ci + 1).width = Math.min((maxLen + 3) * 2, 80)
  }

  // ── 写入文件 ──
  const fileName = `${(database.value.title || 'export').replace(/[\\/:*?"<>|]/g, '_')}.xlsx`
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
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
    <div v-else-if="!database || database.rows.length === 0" class="p-4 rounded-lg text-sm text-center" style="color: var(--c-text-tertiary); background-color: var(--c-bg-secondary); border: 1px solid var(--c-border)">
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
            <span>{{ filterResultCount !== database.rows.length && filteredRows.length < database.rows.length ? `导出 (${filteredRows.length})` : '导出' }}</span>
          </button>
          <div
            v-if="filterResultCount !== database.rows.length"
            class="text-xs shrink-0"
            style="color: var(--c-text-tertiary)"
          >
            {{ filterResultCount }} / {{ database.rows.length }}
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
                    <a
                      v-for="(f, fi) in getFilesList(row.properties[col.key])"
                      :key="fi"
                      :href="f.url"
                      target="_blank"
                      class="block rounded border overflow-hidden shrink-0 cursor-pointer"
                      :style="{
                        width: '40px',
                        height: '40px',
                        borderColor: 'var(--c-border)',
                      }"
                      @click.stop
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
                    </a>
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
                        <a
                          v-for="(f, fi) in getFilesList(selectedRow!.properties[col.key])"
                          :key="fi"
                          :href="f.url"
                          target="_blank"
                          class="block rounded border overflow-hidden"
                          :style="{
                            width: isImageFile(f.name) ? '120px' : '40px',
                            height: isImageFile(f.name) ? '120px' : '40px',
                            borderColor: 'var(--c-border)',
                          }"
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
                        </a>
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
            </template>
            <div v-else class="text-sm text-center py-8" style="color: var(--c-text-tertiary)">
              未选择行
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
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
</style>
