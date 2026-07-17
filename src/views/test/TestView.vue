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
  /** JSON 入参模板（叶子节点切换时自动填入） */
  defaultInput?: string
  children?: ApiNode[]
}

/** 预置的测试用 ID 占位符（根页面/子页面/数据库均可替换） */
const DEMO_PAGE_ID = '34420a967459800d84ade3b4640bd7c6'
const DEMO_DATABASE_ID = '39f20a96-7459-8034-817b-ef0afa00e7f0'
const DEMO_BLOCK_ID = '34420a96-7459-800d-84ad-e3b4640bd7c6'

const apiTree: ApiNode[] = [
  {
    id: 'storage-index',
    label: '全局索引',
    method: 'GET',
    path: '/api/storage/index',
    description: '扫描所有备份批次',
    defaultInput: '',
  },
  {
    id: 'storage-page',
    label: '读取页面',
    method: 'GET',
    path: '/api/storage/page/{rootPageId}/{date}/{pageId}',
    description: '获取页面 JSON + children + databases + 子页面摘要',
    defaultInput: `# 路径参数拼入 URL（非 JSON body）
# URL 示例：/api/storage/page/${DEMO_PAGE_ID}/2026-07-15/${DEMO_PAGE_ID}
# 下面字段仅供参考，实际由路由解析
{
  "comment": "GET 请求，参数在路径中，修改上方 URL 后替换"
}`,
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
        description: '验证 API Key 是否有效（无需请求体，token 从配置自动注入）',
        defaultInput: '',
      },
      {
        id: 'notion-fetch-page',
        label: '获取页面',
        method: 'POST',
        path: '/api/notion/fetch-page',
        description: '拉取 Notion 页面原始数据（元数据 + 全量 blocks）',
        defaultInput: JSON.stringify({ pageId: DEMO_PAGE_ID }, null, 2),
      },
      {
        id: 'notion-fetch-block-children',
        label: '获取块子节点',
        method: 'POST',
        path: '/api/notion/fetch-block-children',
        description: '拉取指定 block 的子节点（单页，不支持递归）',
        defaultInput: JSON.stringify({ blockId: DEMO_BLOCK_ID }, null, 2),
      },
      {
        id: 'notion-fetch-database',
        label: '查询数据库',
        method: 'POST',
        path: '/api/notion/fetch-database',
        description: '查询数据库全部行数据（page_size=100 自动分页）',
        defaultInput: JSON.stringify({ databaseId: DEMO_DATABASE_ID }, null, 2),
      },
      {
        id: 'notion-fetch-database-schema',
        label: '获取数据库定义',
        method: 'POST',
        path: '/api/notion/fetch-database-schema',
        description: '获取数据库的 schema 结构定义（列名、类型等）',
        defaultInput: JSON.stringify({ databaseId: DEMO_DATABASE_ID }, null, 2),
      },
      {
        id: 'notion-inspect-database',
        label: '🔍 综合检查',
        method: 'POST',
        path: '/api/notion/inspect-database',
        description: '同时返回 schema + query 原始响应，诊断权限/数据问题',
        defaultInput: JSON.stringify({ databaseId: DEMO_DATABASE_ID }, null, 2),
      },
    ],
  },
  {
    id: 'storage-logs',
    label: '日志',
    method: 'GET',
    path: '/api/storage/logs',
    description: '查询同步日志（可按 date 参数过滤）',
    defaultInput: `# 可选 query 参数：?date=YYYY-MM-DD
# 示例 URL：/api/storage/logs?date=2026-07-15
# 不传 date 则返回最近 10 个文件`,
  },
  {
    id: 'storage-db-delete',
    label: '🗑 清空数据库',
    method: 'POST',
    path: '/api/notion/clear-database',
    description: '调用 Notion API 逐行 archive 清空数据库全部行',
    defaultInput: JSON.stringify(
      { databaseId: DEMO_DATABASE_ID },
      null,
      2,
    ),
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

/** 递归收集整棵树下所有节点（含子节点） */
function findAllNodes(nodes: ApiNode[]): ApiNode[] {
  const acc: ApiNode[] = []
  for (const node of nodes) {
    acc.push(node)
    if (node.children) acc.push(...findAllNodes(node.children))
  }
  return acc
}

const selectedNode = computed(() => {
  return findAllNodes(apiTree).find(n => n.id === selectedNodeId.value)
})

const isLeaf = computed(() => {
  if (!selectedNode.value) return true
  return !selectedNode.value.children
})

/** 在树中查找节点 id 的祖先链（id 数组） */
function getAncestorChain(targetId: string): string[] {
  function walk(nodes: ApiNode[], chain: string[]): string[] | null {
    for (const node of nodes) {
      if (node.id === targetId) return [...chain, node.id]
      if (node.children) {
        const found = walk(node.children, [...chain, node.id])
        if (found) return found
      }
    }
    return null
  }
  return walk(apiTree, []) ?? []
}

/** selectedNodeId 是否属于 parentId 的子树 */
function isChildOf(parentId: string): boolean {
  const chain = getAncestorChain(selectedNodeId.value)
  return chain.includes(parentId) && chain[chain.length - 1] !== parentId
}

/** 叶子节点切换：填入入参模板，清空上次响应 */
function selectNode(node: ApiNode) {
  selectedNodeId.value = node.id
  result.value = null
  responseStatus.value = null
  error.value = null
  inputJson.value = node.defaultInput ?? ''
}

/** 树节点点击：叶子→填充模板；分组→仅切换选中 */
function toggleExpand(node: ApiNode) {
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

/** 发送请求 */
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

/** Ctrl/Cmd + Enter 发送 */
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
            >{{ isChildOf(node.id) || node.id === selectedNodeId ? '▾' : '▸' }}</span>
            <span v-else class="w-12px" />
            <span
              class="text-10px font-mono px-1 rounded"
              style="color: #fff; background-color: var(--c-brand)"
            >{{ node.method }}</span>
            <span>{{ node.label }}</span>
          </button>

          <!-- Children -->
          <template v-if="node.children && (isChildOf(node.id) || node.id === selectedNodeId)">
            <button
              v-for="child in node.children"
              :key="child.id"
              class="w-full text-left pl-10 pr-4 py-1.5 text-xs transition-colors flex items-center gap-2"
              :style="{
                color: selectedNodeId === child.id ? 'var(--c-brand)' : 'var(--c-text-tertiary)',
                backgroundColor: selectedNodeId === child.id ? 'var(--c-brand-light)' : 'transparent',
                fontWeight: selectedNodeId === child.id ? 600 : 400,
              }"
              @click="selectNode(child)"
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
          :disabled="loading"
          @click="executeRequest"
        >
          {{ loading ? '请求中...' : '发送请求' }}
        </button>
      </div>

      <div class="flex-1 flex flex-col overflow-hidden" v-if="isLeaf">
        <!-- Input -->
        <div class="px-4 pt-3 pb-1 shrink-0">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--c-text-tertiary)">
              请求参数 (JSON)
            </span>
            <span class="text-10px" style="color: var(--c-text-tertiary)">
              Ctrl+Enter 发送
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
