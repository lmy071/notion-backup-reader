<script setup lang="ts">
import { provide, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useReaderLogic } from './useReaderLogic'
import ResizablePanel from '@/components/common/ResizablePanel.vue'
import TocTree from '@/components/common/TocTree.vue'
import NotionRenderer from '@/components/notionBlock/NotionRenderer.vue'

const props = defineProps<{
  pageId: string
}>()

const route = useRoute()
const rootPageId = computed(() => (route.query.root as string) || props.pageId)
const date = computed(() => (route.query.date as string) || '')
const pageId = computed(() => props.pageId)

provide('readerRootPageId', rootPageId)
provide('readerDate', date)

const {
  page,
  loading,
  error,
  subPages,
  backlinks,
  pageDatabases,
  headings,
  sidebarWidth,
  loadPage,
} = useReaderLogic(rootPageId, date, pageId)

provide('pageDatabases', pageDatabases)

function navigateToChild(childPageId: string) {
  const r = rootPageId.value
  const d = date.value
  if (!r || !d) return
  route.router?.push({
    name: 'reader',
    params: { pageId: childPageId },
    query: { root: r, date: d },
  })
}

// Notion properties 原始数据 → 可读文本
function formatPropertyValue(val: unknown): string {
  const v = val as Record<string, unknown>
  if (!v) return '-'
  const type = v.type as string
  switch (type) {
    case 'title':
      return ((v.title as Array<{ plain_text: string }>) ?? []).map(t => t.plain_text).join('')
    case 'rich_text':
      return ((v.rich_text as Array<{ plain_text: string }>) ?? []).map(t => t.plain_text).join('')
    case 'select':
      return (v.select as { name?: string })?.name ?? '-'
    case 'multi_select':
      return ((v.multi_select as Array<{ name: string }>) ?? []).map(s => s.name).join(', ')
    case 'date': {
      const d = v.date as { start?: string } | null
      return d?.start ?? '-'
    }
    case 'number':
      return String(v.number ?? '-')
    case 'checkbox':
      return v.checkbox ? '✅' : '☐'
    case 'url':
      return (v.url as string) ?? '-'
    case 'email':
      return (v.email as string) ?? '-'
    case 'phone_number':
      return (v.phone_number as string) ?? '-'
    default:
      return '-'
  }
}

function isSystemProperty(key: string): boolean {
  return key === 'title'
}
</script>

<template>
  <div class="flex h-full">
    <!-- 侧边栏 -->
    <ResizablePanel
      :width="sidebarWidth"
      :min-width="200"
      :max-width="500"
      @update:width="sidebarWidth = $event"
    >
      <div class="h-full flex flex-col" style="border-right: 1px solid var(--c-border)">
        <div class="px-4 py-3" style="border-bottom: 1px solid var(--c-border)">
          <h2 class="text-sm font-semibold uppercase tracking-wider" style="color: var(--c-text-secondary)">
            目录
          </h2>
        </div>
        <div class="flex-1 overflow-y-auto px-3 py-2">
          <TocTree :headings="headings" />
        </div>

        <!-- 子页面列表 -->
        <div v-if="subPages.length > 0" style="border-top: 1px solid var(--c-border)">
          <div class="px-4 py-3" style="border-bottom: 1px solid var(--c-border)">
            <h2 class="text-sm font-semibold uppercase tracking-wider" style="color: var(--c-text-secondary)">
              子页面 ({{ subPages.length }})
            </h2>
          </div>
          <div class="overflow-y-auto px-2 py-2" style="max-height: 240px">
            <div
              v-for="sp in subPages"
              :key="sp.pageId"
              class="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors"
              style="color: var(--c-text-secondary)"
              @click="navigateToChild(sp.pageId)"
            >
              <span>{{ sp.icon || '📄' }}</span>
              <span class="truncate">{{ sp.title }}</span>
            </div>
          </div>
        </div>
      </div>
    </ResizablePanel>

    <!-- 主内容区 -->
    <div class="flex-1 overflow-y-auto">
      <!-- 加载状态 -->
      <div v-if="loading" class="flex items-center justify-center h-full">
        <div class="flex flex-col items-center gap-3" style="color: var(--c-text-secondary)">
          <div
            class="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style="border-color: var(--c-brand); border-top-color: transparent"
          />
          <span class="text-sm">加载页面...</span>
        </div>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="flex flex-col items-center justify-center h-full gap-4">
        <div class="text-5xl">⚠️</div>
        <p class="text-lg" style="color: var(--c-danger)">{{ error }}</p>
        <button
          class="px-4 py-2 rounded-md font-medium cursor-pointer text-white"
          style="background-color: var(--c-brand)"
          @click="loadPage"
        >重试</button>
      </div>

      <!-- 页面内容 -->
      <template v-else-if="page">
        <!-- 封面横幅 (全宽) -->
        <div
          v-if="page.cover"
          class="w-full overflow-hidden"
          style="height: 200px; background-color: var(--c-bg-secondary)"
        >
          <img
            :src="page.cover.url"
            :alt="page.title"
            class="w-full h-full object-cover"
          />
        </div>

        <div class="max-w-4xl mx-auto px-8 py-6">
          <!-- 面包屑 -->
          <div class="flex items-center gap-2 mb-6 text-xs" style="color: var(--c-text-tertiary)">
            <span>{{ rootPageId }}</span>
            <span>/</span>
            <span style="color: var(--c-text)">{{ page.title }}</span>
          </div>

          <!-- 标题行：图标 + 标题 -->
          <header class="mb-6">
            <div class="flex items-start gap-4">
              <span v-if="page.icon" class="text-4xl leading-none shrink-0 mt-1">{{ page.icon }}</span>
              <h1 class="text-3xl font-bold leading-tight" style="color: var(--c-text-primary)">
                {{ page.title || '无标题' }}
              </h1>
            </div>
          </header>

          <!-- Notion 属性面板 -->
          <div v-if="page.properties && Object.keys(page.properties).filter(k => !isSystemProperty(k)).length > 0" class="mb-8">
            <div
              v-for="(_val, key) in page.properties"
              :key="key"
            >
              <template v-if="!isSystemProperty(key)">
                <div class="flex py-2 text-sm" style="border-bottom: 1px solid var(--c-border)">
                  <div class="w-32 shrink-0 font-medium" style="color: var(--c-text-secondary)">{{ key }}</div>
                  <div style="color: var(--c-text)">{{ formatPropertyValue(_val) }}</div>
                </div>
              </template>
            </div>
          </div>

          <!-- 正文 -->
          <NotionRenderer :blocks="page.blocks" />

          <!-- 反向链接 -->
          <div v-if="backlinks.length > 0" class="mt-12 pt-8" style="border-top: 2px solid var(--c-border)">
            <h2 class="text-lg font-bold mb-4" style="color: var(--c-text-primary)">
              反向链接 ({{ backlinks.length }})
            </h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="bl in backlinks"
                :key="bl.pageId"
                class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                style="background-color: var(--c-callout-bg); border: 1px solid var(--c-border)"
                @click="navigateToChild(bl.pageId)"
              >
                <span>{{ bl.icon || '📄' }}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm truncate" style="color: var(--c-text)">{{ bl.title }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
