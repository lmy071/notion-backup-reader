<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useHomeLogic } from './useHomeLogic'
import PageCard from '@/components/common/PageCard.vue'

const router = useRouter()
const { roots, loading, selectDate } = useHomeLogic()

function navigateToPage(rootPageId: string, date: string, pageId: string) {
  router.push({
    name: 'reader',
    params: { pageId },
    query: { root: rootPageId, date },
  })
}
</script>

<template>
  <div class="max-w-1400px mx-auto px-4 py-8">
    <header class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold" style="color: var(--c-text-primary)">已备份页面</h1>
      <span class="text-sm" style="color: var(--c-text-secondary)">
        {{ roots.length }} 个备份
      </span>
    </header>

    <!-- 加载状态 -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="flex flex-col items-center gap-3" style="color: var(--c-text-secondary)">
        <div
          class="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style="border-color: var(--c-brand); border-top-color: transparent"
        />
        <span class="text-sm">加载中...</span>
      </div>
    </div>

    <!-- 空状态 -->
    <div
      v-else-if="roots.length === 0"
      class="flex flex-col items-center justify-center py-20"
      style="color: var(--c-text-secondary)"
    >
      <div class="text-5xl mb-4">📭</div>
      <p class="text-lg mb-2">暂无备份页面</p>
      <p class="text-sm">
        前往
        <router-link to="/sync" style="color: var(--c-link); text-decoration: underline">
          同步页面
        </router-link>
        开始备份 Notion 页面
      </p>
    </div>

    <!-- 按根页分组，每组只展示根页面主卡片 -->
    <template v-else>
      <section
        v-for="root in roots"
        :key="root.rootPageId"
        class="mb-8"
      >
        <!-- 组头部 -->
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2 text-sm" style="color: var(--c-text-secondary)">
            <span class="font-medium" style="color: var(--c-text)">{{ root.title }}</span>
            <span>·</span>
            <span>{{ root.pages.length - 1 }} 个子页面</span>
          </div>

          <!-- 日期选择器 -->
          <div v-if="root.availableDates.length > 1" class="flex items-center gap-1.5">
            <span class="text-xs" style="color: var(--c-text-tertiary)">备份日期</span>
            <select
              :value="root.selectedDate"
              class="text-xs rounded border px-2 py-1 cursor-pointer outline-none"
              :style="{
                backgroundColor: 'var(--c-bg)',
                color: 'var(--c-text-secondary)',
                borderColor: 'var(--c-border)',
              }"
              @change="selectDate(root.rootPageId, ($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="d in root.availableDates"
                :key="d"
                :value="d"
              >{{ d }}</option>
            </select>
          </div>
          <span v-else class="text-xs" style="color: var(--c-text-tertiary)">{{ root.selectedDate }}</span>
        </div>

        <!-- 根页面主卡片（只展示根页面本身） -->
        <PageCard
          v-if="root.rootPage"
          :page-id="root.rootPage.pageId"
          :title="root.rootPage.title"
          :icon="root.rootPage.icon"
          :cover-url="root.rootPage.coverUrl"
          :last-sync="root.rootPage.lastSync"
          :block-count="root.rootPage.blockCount"
          :child-count="root.rootPage.childCount"
          @navigate="(pageId: string) => navigateToPage(root.rootPageId, root.selectedDate, pageId)"
        />
      </section>
    </template>
  </div>
</template>
