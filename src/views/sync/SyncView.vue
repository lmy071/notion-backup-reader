<script setup lang="ts">
import { useSyncLogic } from './useSyncLogic'

const {
  inputText,
  selectedIds,
  historyList,
  isSyncing,
  overallProgress,
  logMessages,
  toggleSelectId,
  selectAllHistory,
  clearSelection,
  startBatchSync,
} = useSyncLogic()
</script>

<template>
  <div class="max-w-1400px mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold mb-6" style="color: var(--c-text-primary)">批量同步</h1>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 左侧：输入与历史 -->
      <div class="flex flex-col gap-6">
        <!-- ID 输入区 -->
        <section class="p-5 rounded-lg" style="background-color: var(--c-card-bg); border: 1px solid var(--c-card-border); box-shadow: var(--c-shadow)">
          <label class="block text-sm font-medium mb-1" style="color: var(--c-text-secondary)" for="sync-ids">
            页面 ID（每行一个，或逗号分隔）
          </label>
          <textarea
            id="sync-ids"
            v-model="inputText"
            class="w-full p-3 rounded-md border font-mono text-sm resize-y"
            style="min-height: 120px; background-color: var(--c-bg); border-color: var(--c-border); color: var(--c-text)"
            placeholder="输入 Notion 页面 ID，每行一个或用逗号分隔&#10;例如：&#10;abc123def456&#10;789ghi012jkl"
            :disabled="isSyncing"
          />
        </section>

        <!-- 已同步历史 -->
        <section class="p-5 rounded-lg" style="background-color: var(--c-card-bg); border: 1px solid var(--c-card-border); box-shadow: var(--c-shadow)">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold" style="color: var(--c-text-primary)">已同步页面</h2>
            <div v-if="historyList.length > 0" class="flex gap-2">
              <button
                class="px-2 py-1 rounded text-xs font-medium cursor-pointer"
                style="background-color: var(--c-bg-secondary); color: var(--c-text-secondary); border: 1px solid var(--c-border)"
                @click="selectAllHistory"
              >
                全选
              </button>
              <button
                class="px-2 py-1 rounded text-xs font-medium cursor-pointer"
                style="background-color: var(--c-bg-secondary); color: var(--c-text-secondary); border: 1px solid var(--c-border)"
                @click="clearSelection"
              >
                取消
              </button>
            </div>
          </div>

          <div v-if="historyList.length === 0" class="text-sm py-4 text-center" style="color: var(--c-text-secondary)">
            暂无同步历史
          </div>

          <div v-else class="flex flex-col gap-1" style="max-height: 260px; overflow-y: auto">
            <label
              v-for="item in historyList"
              :key="item.id"
              class="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm"
              style="color: var(--c-text)"
            >
              <input
                type="checkbox"
                :checked="selectedIds.has(item.id)"
                class="w-4 h-4"
                style="accent-color: var(--c-brand)"
                @change="toggleSelectId(item.id)"
              />
              <span class="truncate font-mono text-xs" style="max-width: 200px; color: var(--c-text-secondary)">
                {{ item.id }}
              </span>
              <span class="flex-1 truncate">{{ item.title }}</span>
              <span class="text-xs shrink-0" style="color: var(--c-text-tertiary)">
                {{ item.lastSync }}
              </span>
            </label>
          </div>
        </section>

        <!-- 操作按钮 -->
        <div class="flex items-center gap-3">
          <button
            class="px-4 py-2 rounded-md font-medium cursor-pointer text-white transition-colors"
            :style="{
              backgroundColor: isSyncing ? 'var(--c-text-tertiary)' : 'var(--c-brand)',
              cursor: isSyncing ? 'not-allowed' : 'pointer',
            }"
            :disabled="isSyncing"
            @click="startBatchSync"
          >
            {{ isSyncing ? '同步中...' : '开始同步' }}
          </button>
          <span v-if="isSyncing" class="text-sm" style="color: var(--c-text-secondary)">
            进度: {{ overallProgress }}%
          </span>
        </div>
      </div>

      <!-- 右侧：日志区 -->
      <section class="p-5 rounded-lg" style="background-color: var(--c-card-bg); border: 1px solid var(--c-card-border); box-shadow: var(--c-shadow)">
        <h2 class="text-lg font-semibold mb-4" style="color: var(--c-text-primary)">同步日志</h2>
        <div
          class="rounded p-3 overflow-y-auto font-mono text-xs leading-relaxed"
          style="height: 400px; background-color: var(--c-bg-secondary); color: var(--c-text)"
        >
          <div v-if="logMessages.length === 0" style="color: var(--c-text-secondary)">
            暂无日志，点击「开始同步」后显示
          </div>
          <div
            v-for="(msg, i) in logMessages"
            :key="i"
            class="whitespace-pre-wrap break-all"
          >
            {{ msg }}
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
