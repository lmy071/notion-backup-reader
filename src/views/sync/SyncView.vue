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
  <div class="page-container py-8">
    <h1 class="text-2xl font-bold mb-6">批量同步</h1>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 左侧：输入与历史 -->
      <div class="flex flex-col gap-6">
        <!-- ID 输入区 -->
        <section class="card p-5">
          <label class="label" for="sync-ids">页面 ID（每行一个，或逗号分隔）</label>
          <textarea
            id="sync-ids"
            v-model="inputText"
            class="input h-32 resize-y font-mono text-sm"
            placeholder="输入 Notion 页面 ID，每行一个或用逗号分隔&#10;例如：&#10;abc123def456&#10;789ghi012jkl"
            :disabled="isSyncing"
          />
        </section>

        <!-- 已同步历史 -->
        <section class="card p-5">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold">已同步页面</h2>
            <div v-if="historyList.length > 0" class="flex gap-2">
              <button class="btn-secondary text-xs px-2 py-1" @click="selectAllHistory">
                全选
              </button>
              <button class="btn-secondary text-xs px-2 py-1" @click="clearSelection">
                取消
              </button>
            </div>
          </div>

          <div v-if="historyList.length === 0" class="text-sm text-[var(--c-text-secondary)] py-4 text-center">
            暂无同步历史
          </div>

          <div v-else class="flex flex-col gap-1 max-h-64 overflow-y-auto">
            <label
              v-for="item in historyList"
              :key="item.id"
              class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--c-primary-light)] cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                :checked="selectedIds.has(item.id)"
                class="w-4 h-4 accent-[var(--c-primary)]"
                @change="toggleSelectId(item.id)"
              />
              <span class="text-[var(--c-text-secondary)] truncate max-w-200px font-mono text-xs">
                {{ item.id }}
              </span>
              <span class="flex-1 truncate">{{ item.title }}</span>
              <span class="text-[var(--c-text-secondary)] text-xs shrink-0">
                {{ item.lastSync }}
              </span>
            </label>
          </div>
        </section>

        <!-- 操作按钮 -->
        <div class="flex items-center gap-3">
          <button
            class="btn-primary"
            :disabled="isSyncing"
            @click="startBatchSync"
          >
            {{ isSyncing ? '同步中...' : '开始同步' }}
          </button>
          <span v-if="isSyncing" class="text-sm text-[var(--c-text-secondary)]">
            进度: {{ overallProgress }}%
          </span>
        </div>
      </div>

      <!-- 右侧：日志区 -->
      <section class="card p-5">
        <h2 class="text-lg font-semibold mb-4">同步日志</h2>
        <div
          class="bg-[var(--c-bg-secondary)] rounded p-3 h-96 overflow-y-auto font-mono text-xs leading-relaxed"
        >
          <div v-if="logMessages.length === 0" class="text-[var(--c-text-secondary)]">
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
