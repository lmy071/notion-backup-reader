<script setup lang="ts">
import { useConfigLogic } from './useConfigLogic'

const {
  apiBaseUrl,
  apiKey,
  syncConcurrency,
  requestDelay,
  saved,
  save,
  reset,
} = useConfigLogic()
</script>

<template>
  <div class="page-container py-8">
    <h1 class="text-2xl font-bold mb-8">配置</h1>

    <div class="card p-6 max-w-2xl">
      <!-- API Base URL -->
      <div class="mb-5">
        <label class="label" for="apiBaseUrl">MCP 服务地址</label>
        <input
          id="apiBaseUrl"
          v-model="apiBaseUrl"
          type="text"
          class="input"
          placeholder="http://localhost:3000"
        />
      </div>

      <!-- API Key -->
      <div class="mb-5">
        <label class="label" for="apiKey">Notion Integration Token</label>
        <input
          id="apiKey"
          v-model="apiKey"
          type="password"
          class="input"
          placeholder="secret_..."
        />
      </div>

      <!-- 并发数 -->
      <div class="mb-5">
        <label class="label" for="syncConcurrency">最大并发数</label>
        <input
          id="syncConcurrency"
          v-model.number="syncConcurrency"
          type="number"
          min="1"
          max="10"
          class="input w-24"
        />
        <p class="text-xs text-gray-500 mt-1">同时同步的页面数量，建议 1-3</p>
      </div>

      <!-- 请求间隔 -->
      <div class="mb-6">
        <label class="label" for="requestDelay">请求间隔 (ms)</label>
        <input
          id="requestDelay"
          v-model.number="requestDelay"
          type="number"
          min="100"
          max="5000"
          step="50"
          class="input w-32"
        />
        <p class="text-xs text-gray-500 mt-1">两次 MCP 请求之间的最小间隔</p>
      </div>

      <!-- 操作按钮 -->
      <div class="flex items-center gap-3">
        <button class="btn-primary" @click="save">保存配置</button>
        <button class="btn-secondary" @click="reset">重置</button>
        <span v-if="saved" class="text-green-600 text-sm">✅ 已保存</span>
      </div>
    </div>
  </div>
</template>
