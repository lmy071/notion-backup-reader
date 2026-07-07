<script setup lang="ts">
import { useConfigLogic } from './useConfigLogic'

const {
  apiBaseUrl,
  apiKey,
  syncConcurrency,
  requestDelay,
  saved,
  testing,
  testResult,
  save,
  reset,
  testConnection,
} = useConfigLogic()
</script>

<template>
  <div class="max-w-1400px mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold mb-8" style="color: var(--c-text-primary)">配置</h1>

    <div class="p-6 rounded-lg max-w-2xl" style="background-color: var(--c-card-bg); border: 1px solid var(--c-card-border); box-shadow: var(--c-shadow)">
      <!-- API Base URL -->
      <div class="mb-5">
        <label class="block text-sm font-medium mb-1" style="color: var(--c-text-secondary)" for="apiBaseUrl">MCP 服务地址</label>
        <input
          id="apiBaseUrl"
          v-model="apiBaseUrl"
          type="text"
          class="w-full px-3 py-2 rounded-md border"
          style="background-color: var(--c-bg); border-color: var(--c-border); color: var(--c-text)"
          placeholder="http://localhost:3000"
        />
      </div>

      <!-- API Key -->
      <div class="mb-5">
        <label class="block text-sm font-medium mb-1" style="color: var(--c-text-secondary)" for="apiKey">Notion Integration Token</label>
        <input
          id="apiKey"
          v-model="apiKey"
          type="password"
          class="w-full px-3 py-2 rounded-md border"
          style="background-color: var(--c-bg); border-color: var(--c-border); color: var(--c-text)"
          placeholder="secret_..."
        />
      </div>

      <!-- 并发数 -->
      <div class="mb-5">
        <label class="block text-sm font-medium mb-1" style="color: var(--c-text-secondary)" for="syncConcurrency">最大并发数</label>
        <input
          id="syncConcurrency"
          v-model.number="syncConcurrency"
          type="number"
          min="1"
          max="10"
          class="w-24 px-3 py-2 rounded-md border"
          style="background-color: var(--c-bg); border-color: var(--c-border); color: var(--c-text)"
        />
        <p class="text-xs mt-1" style="color: var(--c-text-tertiary)">同时同步的页面数量，建议 1-3</p>
      </div>

      <!-- 请求间隔 -->
      <div class="mb-6">
        <label class="block text-sm font-medium mb-1" style="color: var(--c-text-secondary)" for="requestDelay">请求间隔 (ms)</label>
        <input
          id="requestDelay"
          v-model.number="requestDelay"
          type="number"
          min="100"
          max="5000"
          step="50"
          class="w-32 px-3 py-2 rounded-md border"
          style="background-color: var(--c-bg); border-color: var(--c-border); color: var(--c-text)"
        />
        <p class="text-xs mt-1" style="color: var(--c-text-tertiary)">两次请求之间的最小间隔</p>
      </div>

      <!-- 操作按钮 -->
      <div class="flex items-center gap-3">
        <button
          class="px-4 py-2 rounded-md font-medium cursor-pointer text-white transition-colors"
          style="background-color: var(--c-brand)"
          @click="save"
        >保存配置</button>
        <button
          class="px-4 py-2 rounded-md font-medium cursor-pointer transition-colors"
          style="background-color: var(--c-bg-secondary); color: var(--c-text-secondary); border: 1px solid var(--c-border)"
          @click="reset"
        >重置</button>
        <button
          class="px-4 py-2 rounded-md font-medium cursor-pointer transition-colors"
          :style="{
            backgroundColor: testing ? 'var(--c-bg-tertiary)' : 'var(--c-bg-secondary)',
            color: testing ? 'var(--c-text-tertiary)' : 'var(--c-text-secondary)',
            border: '1px solid var(--c-border)',
            cursor: testing ? 'not-allowed' : 'pointer',
          }"
          :disabled="testing"
          @click="testConnection"
        >
          {{ testing ? '测试中...' : '测试连接' }}
        </button>
        <span v-if="saved" class="text-sm" style="color: var(--c-success)">✅ 已保存</span>
      </div>

      <!-- 测试结果 -->
      <div
        v-if="testResult"
        class="mt-4 p-3 rounded text-sm"
        :style="{
          backgroundColor: testResult.ok ? 'var(--c-rt-green-bg)' : 'var(--c-danger-bg)',
          color: testResult.ok ? 'var(--c-success)' : 'var(--c-danger)',
        }"
      >
        {{ testResult.message }}
      </div>
    </div>
  </div>
</template>
