<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '@/stores/config'

// ── Interface tree ──────────────────────────────────────────────
interface ApiNode {
  id: string
  label: string
  method: string
  path: string
  description: string
  children?: ApiNode[]
}

interface ApiResult {
  status: number
  ok: boolean
  body: unknown
}

interface ApiResponse {
  databaseId: string
  schema: ApiResult
  query: ApiResult
}

const apiTree: ApiNode[] = [
  {
    id: 'storage-index',
    label: '全局索引',
    method: 'GET',
    path: '/api/storage/index',
    description: '扫描所有备份批次',
  },
  {
    id: 'storage-page',
    label: '读取页面',
    method: 'GET',
    path: '/api/storage/page/{root}/{date}/{pageId}',
    description: '获取页面 JSON + children + databases + 子页面摘要',
  },
  {
    id: 'notion-proxy',
    label: 'Notion API 代理',
    method: 'POST',
    path: '→ 子接口',
    description: '代理 Notion REST API 调用',
    children: [
      {
        id: 'notion-test-connection',
        label: '测试连接',
        method: 'POST',
        path: '/api/notion/test-connection',
        description: '验证 API Key 是否有效',
      },
      {
        id: 'notion-fetch-page',
        label: '获取页面',
        method: 'POST',
        path: '/api/notion/fetch-page',
        description: '拉取 Notion 页面原始数据',
      },
      {
        id: 'notion-fetch-block-children',
        label: '获取块子节点',
        method: 'POST',
        path: '/api/notion/fetch-block-children',
        description: '拉取 block 的 children',
      },
      {
        id: 'notion-fetch-database',
        label: '查询数据库',
        method: 'POST',
        path: '/api/notion/fetch-database',
        description: '查询数据库行数据',
      },
      {
        id: 'notion-fetch-database-schema',
        label: '获取数据库定义',
        method: 'POST',
        path: '/api/notion/fetch-database-schema',
        description: '获取数据库 schema 定义',
      },
      {
        id: 'notion-inspect-database',
        label: '🔍 综合检查',
        method: 'POST',
        path: '/api/notion/inspect-database',
        description: '同时获取 schema + query 原始响应，诊断数据库权限问题',
      },
    ],
  },
  {
    id: 'log',
    label: '日志',
    method: 'GET',
    path: '/api/storage/logs',
    description: '查询同步日志',
  },
]

const configStore = useConfigStore()

// ── State ──
const selectedNodeId = ref<string>('notion-inspect-database')
const inputJson = ref('')
const result = ref<unknown>(null)
const responseStatus = ref<number | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

function expandNode(node: ApiNode): ApiNode[] {
  if (node.children) {
    // Non-leaf: don't execute, just toggle
    return []
  }
  selectNode(node)
  return []
}

function selectNode(node: ApiNode) {
  selectedNodeId.value = node.id
  // Clear previous results
  result.value = null
  responseStatus.value = null
  error.value = null

  // Set default input for known endpoints
  if (node.id === 'notion-inspect-database') {
    if (!inputJson.value) {
      inputJson.value = JSON.stringify({ databaseId: '39f20a96-7459-8034-817b-ef0afa00e7f0' }, null, 2)
    }
  } else if (node.id === 'notion-test-connection') {
    inputJson.value = JSON.stringify({ apiKey: '' }, null, 2)
  } else {
    inputJson.value = ''
  }
}

async function executeRequest() {
  const node = findAllNodes(apiTree).find(n => n.id === selectedNodeId.value)
  if (!node) return

  loading.value = true
  error.value = null
  result.value = null

  try {
    let body: unknown = undefined
    if (inputJson.value.trim()) {
      body = JSON.parse(inputJson.value)
    }

    const method = node.method
    const fetchOpts: RequestInit = { method }
    const isNotionApi = node.path.startsWith('/api/notion/')

    const headers: Record<string, string> = {}
    if (method !== 'GET' && body) {
      headers['Content-Type'] = 'application/json'
    }
    if (isNotionApi) {
      headers['X-Notion-Token'] = configStore.config.apiKey
    }
    if (Object.keys(headers).length > 0) {
      fetchOpts.headers = headers
    }
    if (method !== 'GET' && body) {
      fetchOpts.body = JSON.stringify(body)
    }

    const res = await fetch(node.path, fetchOpts)
    responseStatus.value = res.status
    const text = await res.text()

    try {
      result.value = JSON.parse(text)
    } catch {
      result.value = text
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function findAllNodes(nodes: ApiNode[]): ApiNode[] {
  const result: ApiNode[] = []
  for (const node of nodes) {
    result.push(node)
    if (node.children) result.push(...findAllNodes(node.children))
  }
  return result
}

const selectedNode = computed(() => {
  return findAllNodes(apiTree).find(n => n.id === selectedNodeId.value)
})

const isLeaf = computed(() => {
  if (!selectedNode.value) return true
  return !selectedNode.value.children
})

function toggleExpand(node: ApiNode) {
  // For tree nodes with children, clicking selects them
  if (node.children) {
    selectedNodeId.value = node.id
    inputJson.value = ''
    result.value = null
    responseStatus.value = null
    error.value = null
    return
  }
  selectNode(node)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    executeRequest()
  }
}

const resultJsonString = computed(() => {
  if (!result.value) return ''
  return JSON.stringify(result.value, null, 2)
})
</script>

<template>
  <div class="flex h-full" style="background-color: var(--c-bg)">
    <!-- ── Left: API Tree ── -->
    <aside
      class="w-240px shrink-0 overflow-y-auto border-r"
      style="border-color: var(--c-border); background-color: var(--c-bg-secondary)"
    >
      <div class="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style="color: var(--c-text-tertiary)">
        接口列表
      </div>
      <nav>
        <template v-for="node in apiTree" :key="node.id">
          <button
            class="w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2"
            :style="{
              color: selectedNodeId === node.id ? 'var(--c-brand)' : 'var(--c-text-secondary)',
              backgroundColor: selectedNodeId === node.id ? 'var(--c-brand-light)' : 'transparent',
            }"
            @click="toggleExpand(node)"
          >
            <span
              v-if="node.children"
              class="text-xs"
              style="color: var(--c-text-tertiary); width: 12px"
            >{{ node.id === selectedNodeId ? '▾' : '▸' }}</span>
            <span v-else class="w-12px" />
            <span
              class="text-10px font-mono px-1 rounded"
              style="color: #fff; background-color: var(--c-brand)"
            >{{ node.method }}</span>
            <span>{{ node.label }}</span>
          </button>

          <!-- Children -->
          <template v-if="node.children && selectedNodeId?.startsWith(node.id) || node.children && selectedNodeId === node.id">
            <button
              v-for="child in node.children"
              :key="child.id"
              class="w-full text-left pl-10 pr-4 py-1.5 text-xs transition-colors flex items-center gap-2"
              :style="{
                color: selectedNodeId === child.id ? 'var(--c-brand)' : 'var(--c-text-tertiary)',
                backgroundColor: selectedNodeId === child.id ? 'var(--c-brand-light)' : 'transparent',
                fontWeight: selectedNodeId === child.id ? 600 : 400,
              }"
              @click="toggleExpand(child)"
            >
              <span
                class="text-10px font-mono px-1 rounded"
                style="color: #fff; background-color: var(--c-brand)"
              >{{ child.method }}</span>
              <span>{{ child.label }}</span>
            </button>
          </template>
        </template>
      </nav>
    </aside>

    <!-- ── Right: Input + Response ── -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <div
        class="flex items-center justify-between px-4 py-2.5 shrink-0 border-b"
        style="border-color: var(--c-border); background-color: var(--c-bg-secondary)"
      >
        <div>
          <h2 class="text-sm font-semibold" style="color: var(--c-text)">{{ selectedNode?.label || '选择接口' }}</h2>
          <p class="text-xs mt-0.5" style="color: var(--c-text-tertiary)">{{ selectedNode?.description }}</p>
        </div>
        <button
          v-if="isLeaf"
          class="px-4 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer"
          style="background-color: var(--c-brand); color: #fff"
          :disabled="loading || !apiKey"
          :title="!apiKey ? '请先在配置页设置 API Key' : ''"
          @click="executeRequest"
        >
          {{ loading ? '请求中...' : (!apiKey ? '⚠ 请先设置 API Key' : '发送请求') }}
        </button>
      </div>

      <div class="flex-1 flex flex-col overflow-hidden" v-if="isLeaf">
        <!-- Input -->
        <div class="px-4 pt-3 pb-1 shrink-0">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--c-text-tertiary)">
              请求参数 (JSON)
            </span>
            <span class="text-xs opacity-0" style="color: var(--c-text-tertiary)">
              格式化
            </span>
          </div>
        </div>
        <div class="px-4 pb-3 shrink-0" style="max-height: 160px">
          <textarea
            v-model="inputJson"
            class="w-full h-full min-h-80px text-xs font-mono rounded border px-3 py-2 outline-none resize-none"
            style="
              color: var(--c-text);
              background-color: var(--c-bg);
              border-color: var(--c-border);
            "
            spellcheck="false"
            @keydown="handleKeydown"
          />
        </div>

        <!-- Response -->
        <div class="px-4 pt-2 pb-1 shrink-0">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--c-text-tertiary)">
              响应结果
            </span>
            <span
              v-if="responseStatus !== null"
              class="text-xs font-mono px-1.5 py-0.5 rounded"
              :style="{
                backgroundColor: responseStatus >= 200 && responseStatus < 300 ? 'var(--c-success-bg)' : 'var(--c-danger-bg)',
                color: responseStatus >= 200 && responseStatus < 300 ? 'var(--c-success)' : 'var(--c-danger)',
              }"
            >
              {{ responseStatus }}
            </span>
          </div>
        </div>
        <div class="flex-1 px-4 pb-4 overflow-hidden">
          <!-- Loading -->
          <div v-if="loading" class="flex items-center justify-center h-full" style="color: var(--c-text-tertiary)">
            <div class="text-sm">请求中...</div>
          </div>

          <!-- Error -->
          <div
            v-else-if="error"
            class="h-full rounded border p-4 font-mono text-xs overflow-auto"
            style="color: var(--c-danger); border-color: var(--c-danger); background-color: var(--c-danger-bg)"
          >
            {{ error }}
          </div>

          <!-- Empty -->
          <div
            v-else-if="!result"
            class="flex items-center justify-center h-full"
            style="color: var(--c-text-tertiary)"
          >
            <div class="text-sm text-center">
              <div class="text-2xl mb-2">📡</div>
              <div>选择左侧接口并发送请求</div>
            </div>
          </div>

          <!-- Result -->
          <pre
            v-else-if="resultJsonString"
            class="h-full rounded border p-4 font-mono text-xs overflow-auto m-0"
            style="color: var(--c-text); border-color: var(--c-border); background-color: var(--c-bg-secondary)"
          >{{ resultJsonString }}</pre>
        </div>
      </div>

      <!-- Non-leaf placeholder -->
      <div
        v-else
        class="flex-1 flex items-center justify-center"
        style="color: var(--c-text-tertiary)"
      >
        <div class="text-center text-sm">
          <div class="text-3xl mb-3">📂</div>
          <div>此节点为接口分组</div>
          <div class="mt-1 opacity-60">展开左侧子树选择具体接口</div>
        </div>
      </div>
    </div>
  </div>
</template>
