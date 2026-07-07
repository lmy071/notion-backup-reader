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
const rootPageId = (route.query.root as string) || props.pageId
const date = (route.query.date as string) || ''

provide('readerRootPageId', computed(() => rootPageId))
provide('readerDate', computed(() => date))

const {
  page,
  loading,
  error,
  headings,
  sidebarWidth,
  loadPage,
} = useReaderLogic(rootPageId, date, props.pageId)
</script>

<template>
  <div class="flex h-full">
    <!-- 侧边栏：目录 -->
    <ResizablePanel
      :width="sidebarWidth"
      :min-width="200"
      :max-width="500"
      @update:width="sidebarWidth = $event"
    >
      <div class="h-full flex flex-col" style="border-right: 1px solid var(--c-border)">
        <div
          class="px-4 py-3"
          style="border-bottom: 1px solid var(--c-border)"
        >
          <h2
            class="text-sm font-semibold uppercase tracking-wider"
            style="color: var(--c-text-secondary)"
          >
            目录
          </h2>
        </div>
        <div class="flex-1 overflow-y-auto px-3 py-2">
          <TocTree :headings="headings" />
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
      <div v-else-if="page" class="max-w-4xl mx-auto px-8 py-6">
        <header class="mb-8">
          <div class="flex items-center gap-3 mb-2">
            <span v-if="page.icon" class="text-3xl">{{ page.icon }}</span>
            <h1 class="text-3xl font-bold" style="color: var(--c-text-primary)">{{ page.title }}</h1>
          </div>
          <div v-if="page.cover" class="mt-4 rounded-lg overflow-hidden">
            <img
              :src="page.cover.url"
              :alt="page.title"
              class="w-full h-48 object-cover"
            />
          </div>
        </header>

        <div class="space-y-2">
          <NotionRenderer :blocks="page.blocks" />
        </div>
      </div>
    </div>
  </div>
</template>
