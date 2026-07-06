<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useHomeLogic } from './useHomeLogic'
import PageCard from '@/components/common/PageCard.vue'

const router = useRouter()
const { pages, loading } = useHomeLogic()

function navigateToPage(pageId: string) {
  router.push({ name: 'reader', params: { pageId } })
}
</script>

<template>
  <div class="page-container py-8">
    <header class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">已备份页面</h1>
      <span class="text-sm text-[var(--c-text-secondary)]">
        {{ pages.length }} 个页面
      </span>
    </header>

    <!-- 加载状态 -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="flex flex-col items-center gap-3 text-[var(--c-text-secondary)]">
        <div class="w-8 h-8 border-2 border-[var(--c-primary)] border-t-transparent rounded-full animate-spin" />
        <span class="text-sm">加载中...</span>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="pages.length === 0" class="flex flex-col items-center justify-center py-20 text-[var(--c-text-secondary)]">
      <div class="text-5xl mb-4">📭</div>
      <p class="text-lg mb-2">暂无备份页面</p>
      <p class="text-sm">
        前往
        <router-link to="/sync" class="text-[var(--c-primary)] underline">
          同步页面
        </router-link>
        开始备份 Notion 页面
      </p>
    </div>

    <!-- 页面卡片网格 -->
    <div
      v-else
      class="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4"
    >
      <PageCard
        v-for="page in pages"
        :key="page.pageId"
        :page-id="page.pageId"
        :title="page.title"
        :icon="page.icon"
        :cover-url="page.coverUrl"
        :last-sync="page.lastSync"
        :block-count="page.blockCount"
        :child-count="page.childCount"
        class="break-inside-avoid"
        @navigate="navigateToPage"
      />
    </div>
  </div>
</template>
