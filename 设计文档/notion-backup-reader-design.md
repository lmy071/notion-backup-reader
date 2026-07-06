# Notion 本地备份 + 阅读器 — 需求设计文档

> **文档版本:** v1.2  
> **创建日期:** 2026-07-06  
> **更新日期:** 2026-07-06  
> **目标读者:** AI 开发助手  
> **技术栈:** Vue 3 + TypeScript + Vite + UnoCSS  

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术选型](#2-技术选型)
3. [项目结构](#3-项目结构)
4. [数据流架构](#4-数据流架构)
5. [路由设计](#5-路由设计)
6. [页面详细设计](#6-页面详细设计)
7. [日志系统](#7-日志系统)
8. [Notion 解析器](#8-notion-解析器notion-parser)
9. [JSON 存储规范](#9-json-存储规范)
10. [Notion Block 渲染组件](#10-notion-block-渲染组件)
11. [MCP 接口抽象层](#11-mcp-接口抽象层)
12. [类型定义](#12-类型定义)
13. [状态管理](#13-状态管理)
14. [开发清单（Checklist）](#14-开发清单checklist)

---

## 1. 项目概述

### 1.1 目标

构建一个 **离线可用的 Notion 内容备份与阅读器**。通过 Notion MCP 接口将指定页面（含子页面和数据库）的内容拉取到本地 JSON 文件存储，提供瀑布流浏览和结构化阅读体验。

### 1.2 核心功能

| 模块 | 功能 |
|------|------|
| 配置 | Notion MCP 连接参数（API Key / Integration Token 等） |
| 同步 | 输入 page_id（支持多选）→ 并发批量同步 → 递归遍历子页面 & 数据库 → 存为 JSON |
| 解析器 | 独立 `notion-parser/` 模块，将 Notion MCP 原始 JSON 解析为标准化结构 |
| 首页 | 瀑布流卡片展示已备份页面（仅一级） |
| 阅读 | 左侧目录树 + 右侧 Notion Block 渲染 |
| 日志 | 每次同步操作写入 `log/` 目录，每日一个文件，保留 30 天 |
| 存储 | 按 page_id 分目录，日期子目录，最多 10 份历史 |

### 1.3 设计原则

- **逻辑与视图分离** — 每个功能页拆分为 `useXxxLogic.ts`（组合式逻辑） + `XxxView.vue`（纯展示），前者返回响应式数据与方法，后者通过 props 接收
- **组件原子化** — Notion block 渲染组件独立存放在 `components/notionBlock/` 下，每种 block type 一个组件
- **MCP 接口抽象** — 所有与 Notion MCP 的通信收敛在 `services/` 层，页面不直接调用 MCP 工具

---

## 2. 技术选型

| 类别 | 选型 | 理由 |
|------|------|------|
| 框架 | Vue 3.4+ (Composition API) | 用户指定 |
| 语言 | TypeScript 5.x | 用户指定 |
| 构建 | Vite 5.x | 与 Vue 3 生态最优配 |
| 路由 | Vue Router 4 | SPA 页面切换 |
| 状态管理 | Pinia | 配置持久化 |

| 瀑布流 | 纯 CSS `columns` | 首页需求，零依赖 |
| 目录树 | 自研递归组件 | 阅读页左侧 |
| CSS 方案 | UnoCSS（原子化 CSS） | 零运行时，按需生成，开发体验极佳 |
| HTTP 请求 | fetch | MCP 调用 |
| 后端方案 | Vite `configureServer` 中间件 | 开发时 API + 文件读写，零额外服务 |
| MCP 调用 | 通过 Vite 中间件调用 mcporter CLI | Notion MCP Server |
| 存储 | 本地 JSON 文件（项目根 `json/`） | 离线可用 |
| Notion 解析 | 独立 `notion-parser/` 模块 | 解析与渲染解耦，可单元测试 |

---

## 3. 项目结构

```
notion-backup-reader/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── env.d.ts
│
├── public/
│
├── log/                               # ⭐ 同步操作日志（gitignore）
│   ├── 2026-07-06.log                 # 每日一个日志文件
│   ├── 2026-07-05.log                 # 最多保留 30 个日期文件
│   └── ...
│
├── json/                              # ⭐ 备份存储根目录（gitignore）
│   ├── {page_id_1}/                   # 每个 page_id 一个目录
│   │   ├── 2026-07-06/                # 日期子目录（最多 10 个）
│   │   │   ├── page.json              # 页面主体内容
│   │   │   ├── children/              # 子页面/数据库
│   │   │   │   ├── {child_id}.json
│   │   │   │   └── ...
│   │   │   └── meta.json              # 同步元数据
│   │   ├── 2026-07-05/
│   │   └── ...
│   ├── {page_id_2}/
│   └── index.json                     # 全局索引（所有 page 的摘要）
│
├── notion-parser/                      # ⭐ Notion 解析器（独立模块）
│   ├── index.ts                       # 解析入口
│   ├── block-parser.ts                # Block 解析器
│   ├── rich-text-parser.ts            # Rich Text 解析
│   ├── page-parser.ts                 # 页面数据解析
│   ├── database-parser.ts             # 数据库数据解析
│   └── types.ts                       # 解析器内部类型
│
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── uno.config.ts                  # UnoCSS 配置
│   ├── router/
│   │   └── index.ts                   # 路由定义
│   │
│   ├── types/
│   │   ├── notion.ts                  # Notion 数据类型
│   │   ├── storage.ts                 # JSON 存储相关类型
│   │   └── config.ts                  # 配置类型
│   │
│   ├── stores/
│   │   └── config.ts                  # Pinia - 配置状态（持久化）
│   │
│   ├── services/
│   │   ├── mcp.ts                     # MCP 调用抽象层
│   │   ├── sync.ts                    # 同步逻辑（递归遍历）
│   │   └── storage.ts                 # JSON 文件读写
│   │
│   ├── composables/                   # 通用组合式函数
│   │   ├── useLocalStorage.ts         # localStorage 封装
│   │   └── usePageHistory.ts          # 已同步 page_id 历史
│   │
│   ├── components/
│   │   ├── common/                    # 通用组件
│   │   │   ├── PageCard.vue           # 首页瀑布流卡片
│   │   │   ├── TocTree.vue            # 目录树递归组件
│   │   │   └── ResizablePanel.vue     # 可伸缩面板
│   │   │
│   │   └── notionBlock/               # ⭐ Notion 渲染组件
│   │       ├── NotionRenderer.vue     # 渲染入口（根据 type 分发）
│   │       ├── BlockParagraph.vue     # 段落
│   │       ├── BlockHeading.vue       # 标题 (H1/H2/H3)
│   │       ├── BlockImage.vue         # 图片
│   │       ├── BlockCode.vue          # 代码块
│   │       ├── BlockQuote.vue         # 引用
│   │       ├── BlockBulletedList.vue  # 无序列表
│   │       ├── BlockNumberedList.vue  # 有序列表
│   │       ├── BlockTodo.vue          # To-do
│   │       ├── BlockToggle.vue        # 折叠块
│   │       ├── BlockDivider.vue       # 分割线
│   │       ├── BlockCallout.vue       # 标注
│   │       ├── BlockTable.vue         # 表格
│   │       ├── BlockBookmark.vue      # 书签
│   │       ├── BlockVideo.vue         # 视频
│   │       ├── BlockFile.vue          # 文件
│   │       ├── BlockEmbed.vue         # 嵌入
│   │       ├── BlockEquation.vue      # 公式
│   │       ├── BlockChildPage.vue     # 子页面引用
│   │       ├── BlockDatabase.vue      # 数据库视图
│   │       ├── BlockColumnList.vue    # 分栏容器
│   │       ├── BlockColumn.vue        # 分栏
│   │       └── index.ts              # 组件映射表
│   │
│   ├── views/
│   │   ├── config/
│   │   │   ├── ConfigView.vue         # 配置页 - 纯展示
│   │   │   └── useConfigLogic.ts      # 配置页 - 逻辑
│   │   │
│   │   ├── sync/
│   │   │   ├── SyncView.vue           # 同步页 - 纯展示
│   │   │   └── useSyncLogic.ts        # 同步页 - 逻辑
│   │   │
│   │   ├── home/
│   │   │   ├── HomeView.vue           # 首页 - 纯展示
│   │   │   └── useHomeLogic.ts        # 首页 - 逻辑
│   │   │
│   │   └── reader/
│   │       ├── ReaderView.vue         # 阅读页 - 纯展示
│   │       └── useReaderLogic.ts      # 阅读页 - 逻辑
│   │
│   └── assets/
│       └── styles/
│           ├── variables.css
│           └── global.css
│
└── .gitignore                         # 包含 json/
```

---

## 4. 数据流架构

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  ConfigPage  │────▶│  Pinia Store  │◀────│  其他页面读取    │
│  (配置MCP)   │     │  (config.ts)  │     │                 │
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │
                           ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  SyncPage    │────▶│ services/    │────▶│  json/ 目录      │
│  (触发同步)  │     │ mcp.ts       │     │  (本地文件系统)   │
│             │     │ sync.ts      │     │                 │
│             │     │ storage.ts   │     │                 │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                     ┌─────────────────────────────┘
                     ▼
┌─────────────┐     ┌──────────────┐
│  HomePage    │────▶│ services/    │
│  (瀑布流)    │     │ storage.ts   │  ← 读取 json/index.json + 各 page 的 meta.json
└─────────────┘     └──────────────┘

┌─────────────┐     ┌──────────────┐
│  ReaderPage  │────▶│ services/    │  ← 读取页面的 page.json + children/
│  (阅读)      │     │ storage.ts   │
└─────────────┘     └──────────────┘
```

### 关键规则

1. **视图层 (`*View.vue`)** 只做两件事：
   - 调用对应的 `use*Logic.ts` 获取响应式数据和方法
   - 渲染模板，绑定事件
2. **逻辑层 (`use*Logic.ts`)** 负责：
   - 调用 `services/` 层的方法
   - 管理本地响应式状态
   - 处理用户交互逻辑
3. **服务层 (`services/`)** 负责：
   - 与 MCP 通信
   - 文件读写
   - 数据转换
4. **组件层 (`components/`)** 负责：
   - 纯 UI 渲染
   - 通过 props 接收数据，通过 emit 发送事件

---

## 5. 路由设计

```typescript
// src/router/index.ts
const routes = [
  { path: '/',          name: 'home',   component: () => import('@/views/home/HomeView.vue') },
  { path: '/sync',      name: 'sync',   component: () => import('@/views/sync/SyncView.vue') },
  { path: '/config',    name: 'config', component: () => import('@/views/config/ConfigView.vue') },
  { path: '/reader/:pageId', name: 'reader', component: () => import('@/views/reader/ReaderView.vue') },
]
```

### 导航栏

- 顶部/侧边固定导航，包含：首页、同步、配置 三个入口
- 阅读页通过首页点击进入，不在主导航中显示

---

## 6. 页面详细设计

---

### 6.1 配置页 ConfigPage

#### 6.1.1 功能

提供 Notion MCP 连接配置的表单。

#### 6.1.2 配置项

| 字段 | 说明 | 必填 |
|------|------|------|
| `apiBaseUrl` | MCP 服务地址 | 是 |
| `apiKey` | Notion Integration Token / API Key | 是 |
| `syncConcurrency` | 并发同步数 (默认 3) | 否 |
| `requestDelay` | 请求间隔 ms (默认 300) | 否 |

#### 6.1.3 逻辑文件 `useConfigLogic.ts`

```typescript
// 需导出的内容
export function useConfigLogic() {
  // 从 Pinia store 读取/写入配置
  // form 表单验证
  // saveConfig() - 保存配置
  // testConnection() - 测试 MCP 连通性
  // resetConfig() - 重置为默认值

  return {
    form,           // Reactive<ConfigForm>
    rules,          // 表单验证规则
    isTesting,      // 测试中状态
    testResult,     // 测试结果
    saveConfig,
    testConnection,
    resetConfig,
  }
}
```

#### 6.1.4 视图 `ConfigView.vue`

- 表单布局
- 保存按钮 + 测试连接按钮
- 成功/失败 toast 提示

---

### 6.2 同步页 SyncPage

#### 6.2.1 功能

1. **多选同步** — 支持同时输入/选择多个 page_id 进行批量同步
2. 输入框：输入 Notion page_id（支持 32 位 UUID），支持逗号/换行分隔多个 ID
3. 历史列表：从 localStorage 读取历史记录，支持 checkbox 多选
4. "批量同步" 按钮：勾选后并发执行
5. 每个页面独立进度条 + 整体进度
6. 支持暂停/继续/取消全部

#### 6.2.2 并发控制

Notion API 有速率限制（通常 3 req/s），需严格控制并发：

```typescript
// services/concurrency.ts — 并发控制工具

interface ConcurrencyController {
  maxConcurrency: number    // 最大并发数（默认 2）
  minInterval: number       // 最小请求间隔 ms（默认 350）
}

// 使用队列 + 信号量控制并发
// - 多个 page_id 按队列顺序执行，同一时刻最多 maxConcurrency 个页面并行同步
// - 单个页面内的子页面/数据库递归也受同一个控制器约束
// - 每次 MCP 请求间隔至少 minInterval ms，避免触发 rate limit
```

并发策略：
- `maxConcurrency: 2` — 同时最多 2 个页面并行同步（配置页可调）
- `minInterval: 350` — 每两次 API 请求间隔 ≥ 350ms（配置页可调）
- 队列任务支持暂停/恢复/取消

#### 6.2.3 同步流程

```
用户勾选多个 page_id → 点击「批量同步」
  │
  ├─ 将选中的 page_id 加入并发队列
  │
  ├─ 每个 page_id 独立执行:
  │   ├─ 1. 调用 MCP 获取页面 blocks（受并发控制）
  │   ├─ 2. 遍历 blocks，识别子页面 (child_page) 和数据库 (child_database)
  │   ├─ 3. 递归获取子页面 / 数据库内容（同样受并发控制）
  │   ├─ 4. 通过 notion-parser/ 解析原始数据
  │   ├─ 5. 存入 json/{page_id}/{YYYY-MM-DD}/
  │   │     ├─ page.json
  │   │     ├─ children/{child_id}.json ...
  │   │     └─ meta.json
  │   ├─ 6. 更新 json/index.json 全局索引
  │   ├─ 7. 清理旧数据（保留最近 10 份）
  │   └─ 8. 将 page_id 追加到 localStorage 历史列表
  │
  └─ 所有任务完成后，写入 log/{YYYY-MM-DD}.log 日志
```

#### 6.2.4 页面 ID 历史缓存

```typescript
// composables/usePageHistory.ts
// 存储结构 (localStorage key: "notion-synced-pages")
interface PageHistoryItem {
  id: string          // page_id
  title: string       // 页面标题
  lastSync: string    // ISO 时间戳
}
// 以数组形式存储，最近同步的排在前面
```

#### 6.2.5 逻辑文件 `useSyncLogic.ts`

```typescript
export function useSyncLogic() {
  return {
    pageIdInput,        // Ref<string> - 输入框绑定（逗号/换行分隔多个ID）
    selectedIds,        // Ref<Set<string>> - 当前选中的 page_id 集合
    historyList,        // Ref<PageHistoryItem[]> - 历史列表
    isSyncing,          // Ref<boolean>
    taskProgressMap,    // Ref<Map<string, SyncProgress>> - 每个页面的独立进度
    overallProgress,    // Ref<number> - 整体进度百分比
    logMessages,        // Ref<string[]> - 实时日志
    startBatchSync,     // () => Promise<void> 批量同步所有选中页面
    pauseSync,          // () => void
    resumeSync,         // () => void
    cancelSync,         // () => void
    toggleSelectId,     // (pageId: string) => void 切换选中
    selectAllHistory,   // () => void 全选历史
    removeHistory,      // (pageId: string) => void
    parseInputIds,      // () => string[] 从输入框解析多个 ID
  }
}
```

#### 6.2.6 视图 `SyncView.vue`

- 顶部：多行输入框（逗号/换行分隔多个 ID）+ 「解析」按钮
- 历史记录区域：checkbox 多选列表，支持全选/反选
- 中部：每个页面的独立进度卡片（标题 + 进度条 + 状态）+ 整体进度条
- 底部：可滚动实时日志区域（按时间倒序）
- 工具栏：暂停 / 继续 / 取消全部

---

### 6.3 首页/展示页 HomePage

#### 6.3.1 功能

- 读取 `json/` 下的一级目录（即已备份的 page）
- 以**瀑布流（Masonry / CSS columns）**排列卡片
- 每张卡片展示：页面标题、封面图（如有）、最后同步时间
- 双击卡片跳转到 `/reader/:pageId`

#### 6.3.2 数据来源

读取 `json/index.json`（全局索引），格式：

```json
{
  "pages": [
    {
      "pageId": "abc123...",
      "title": "我的笔记",
      "coverUrl": "https://...",
      "icon": "📝",
      "lastSync": "2026-07-06T10:30:00Z",
      "childCount": 5
    }
  ]
}
```

#### 6.3.3 逻辑文件 `useHomeLogic.ts`

```typescript
export function useHomeLogic() {
  return {
    pages,            // Ref<PageSummary[]>
    isLoading,        // Ref<boolean>
    refreshPages,     // () => Promise<void>
    openReader,       // (pageId: string) => void  (router.push)
  }
}
```

#### 6.3.4 视图 `HomeView.vue`

- 加载状态骨架屏
- 空状态提示（"暂无备份，去同步页添加"）
- 瀑布流卡片网格（CSS `columns: 4` + `break-inside: avoid`）
- 卡片双击事件 → `openReader`

---

### 6.4 阅读页 ReaderPage

#### 6.4.1 功能

从 `json/{pageId}/{latest-date}/page.json` 读取内容并渲染。

#### 6.4.2 布局

```
┌──────────────────────────────────────────────────┐
│  ← 返回   页面标题                          🔄 刷新 │
├────────────┬─────────────────────────────────────┤
│  目录树     │                                     │
│  (20%)     │    Notion 内容渲染区                  │
│  可伸缩     │    (NotionRenderer)                  │
│            │                                     │
│  ├ 章节1   │    ## 章节1                          │
│  │ ├ 1.1   │    ...                              │
│  │ └ 1.2   │                                     │
│  ├ 章节2   │    ## 章节2                          │
│  └ 章节3   │    ...                              │
│            │                                     │
└────────────┴─────────────────────────────────────┘
```

#### 6.4.3 目录树 `TocTree.vue`

- 递归组件
- 从页面内容中提取所有 heading block，生成树形结构
- 点击节点 → 右侧内容区滚动到对应位置
- 高亮当前阅读位置

#### 6.4.4 可伸缩面板

- 分隔线可拖拽
- 最小宽度 180px，最大 40%
- 支持双击分隔线折叠/展开

#### 6.4.5 逻辑文件 `useReaderLogic.ts`

```typescript
export function useReaderLogic(pageId: string) {
  return {
    pageData,          // Ref<NotionPage | null>
    tocItems,          // Ref<TocItem[]> - 目录树数据
    isLoading,         // Ref<boolean>
    activeHeadingId,   // Ref<string> - 当前阅读位置
    sidebarWidth,      // Ref<number> - 侧栏宽度
    sidebarCollapsed,  // Ref<boolean>
    loadPage,          // () => Promise<void>
    goBack,            // () => void
    onHeadingClick,    // (id: string) => void 滚动到对应 heading
  }
}
```

#### 6.4.6 视图 `ReaderView.vue`

- 接收 `pageId` (来自 route params)
- 调用 `useReaderLogic(pageId)`
- 模板：
  - 顶部工具栏
  - 左侧 `TocTree`（v-show 控制显示/隐藏）
  - 可拖拽分隔线
  - 右侧 `NotionRenderer`

---

## 7. 日志系统

### 7.1 目录结构

```
log/
├── 2026-07-06.log    # 每天一个日志文件
├── 2026-07-05.log
├── 2026-07-04.log
├── ...
└── 2026-06-07.log    # 最旧 → 第 31 份被删除
```

### 7.2 日志格式

每行为一条 JSON，记录一次同步操作事件：

```json
{
  "timestamp": "2026-07-06T10:30:00.000Z",
  "level": "info",
  "pageId": "a1b2c3d4e5f6...",
  "pageTitle": "我的笔记",
  "action": "sync_start" | "sync_done" | "sync_error" | "block_fetch" | "child_fetch",
  "message": "开始同步页面",
  "duration": 1234,
  "error": null
}
```

### 7.3 日志级别

| level | 说明 |
|-------|------|
| `info` | 正常操作记录（同步开始/完成） |
| `warn` | 警告（子页面获取失败但继续） |
| `error` | 错误（页面同步失败） |
| `debug` | 调试信息（每个 block 获取详情，可配置开关） |

### 7.4 清理规则

- 每个日期一个 `.log` 文件，文件名 `YYYY-MM-DD.log`
- 每天首次同步时检查日志文件数量
- 若数量 > 30，删除最旧的日志文件
- 单文件不做大小限制（Append-Only 写入）

### 7.5 日志服务 `services/logger.ts`

```typescript
export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  pageId?: string
  pageTitle?: string
  action: 'sync_start' | 'sync_done' | 'sync_error' | 'block_fetch' | 'child_fetch' | 'cleanup' | 'config'
  message: string
  duration?: number
  error?: string | null
}

export const logger = {
  info(entry: Omit<LogEntry, 'level' | 'timestamp'>): void
  warn(entry: Omit<LogEntry, 'level' | 'timestamp'>): void
  error(entry: Omit<LogEntry, 'level' | 'timestamp'>): void
  debug(entry: Omit<LogEntry, 'level' | 'timestamp'>): void
  query(params: { date?: string; level?: string; pageId?: string }): Promise<LogEntry[]>
  cleanup(): Promise<void>
}
```

---

## 8. Notion 解析器（notion-parser/）

### 8.1 模块定位

`notion-parser/` 是独立于渲染层的纯数据解析模块，与 `src/` 并列在项目根目录下。负责：

- 将 Notion API / MCP 返回的原始 JSON 解析为内部标准化的数据结构
- 处理各种 block type 的特定字段提取
- Rich Text → 结构化文本数组的转换
- 数据库 schema + rows 的标准化
- 列表项的智能合并（连续的同类型列表 → 列表组）

**与渲染的解耦关系：**

```
Notion MCP 原始响应（Raw JSON）
       │
       ▼
notion-parser/  ──── 纯数据层，无 DOM 依赖，可独立单元测试
       │
       ▼
标准化 NotionBlock[] / NotionPage
       │
       ├──→ services/storage.ts  ──→ 存入 json/ 文件
       │
       └──→ components/notionBlock/  ──→ 渲染到界面
```

### 8.2 模块结构

```
notion-parser/
├── index.ts              # 统一导出入口
├── types.ts              # 解析器内部类型（RawBlock, RawPage 等 MCP 原始响应类型）
├── block-parser.ts       # Block 解析器
│   ├── parseBlock()      # 单个 raw block → NotionBlock
│   ├── parseBlocks()     # 批量 block 解析（含列表项合并）
│   └── mergeListItems()  # 连续列表项合并为列表组
├── rich-text-parser.ts   # Rich Text 解析器
│   └── parseRichText()   # raw rich_text[] → RichText[]
├── page-parser.ts        # 页面解析器
│   ├── parsePage()       # raw page → NotionPage
│   ├── extractTitle()    # 从 properties 提取页面标题
│   └── extractIcon()     # 提取 icon / cover 信息
└── database-parser.ts    # 数据库解析器
    ├── parseDatabase()   # raw database → NotionDatabase
    └── parseDatabaseRow() # raw row → NotionDatabaseRow
```

### 8.3 关键解析逻辑

#### 列表项合并

Notion API 中列表项是独立的 block（`bulleted_list_item` / `numbered_list_item`）。解析时需将连续同类型列表项合并：

```typescript
// block-parser.ts
function mergeListItems(blocks: NotionBlock[]): NotionBlock[] {
  const result: NotionBlock[] = []
  let pendingList: NotionBlock[] = []
  let pendingType: string | null = null

  for (const block of blocks) {
    if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
      if (pendingType === block.type) {
        pendingList.push(block)
      } else {
        flushPendingList()
        pendingType = block.type
        pendingList = [block]
      }
    } else {
      flushPendingList()
      result.push(block)
    }
  }
  flushPendingList()

  function flushPendingList() {
    if (pendingList.length > 0) {
      result.push({
        id: pendingList[0].id,
        type: pendingType! === 'bulleted_list_item' ? 'bulleted_list' : 'numbered_list',
        has_children: true,
        children: pendingList,
      } as NotionBlock)
    }
    pendingList = []
    pendingType = null
  }
  return result
}
```

#### 分栏结构

```typescript
// column_list → ColumnList 容器
//   └── column[0].children[] → 各栏内的实际 blocks
//   └── column[1].children[] → ...
```

---

## 9. JSON 存储规范

### 7.1 目录结构

```
json/
├── index.json                           # 全局索引
├── a1b2c3d4-.../                        # page_id 目录
│   ├── 2026-07-06/                      # 日期子目录（格式 YYYY-MM-DD）
│   │   ├── meta.json                    # 同步元数据
│   │   ├── page.json                    # 页面主体 blocks
│   │   └── children/                    # 子页面 & 数据库
│   │       ├── child_page_id_1.json
│   │       ├── child_page_id_2.json
│   │       └── database_id_1.json
│   ├── 2026-07-05/
│   ├── ...
│   └── 2026-06-27/                      # 最旧 → 第 11 份被删除
└── another_page_id/
```

### 7.2 文件格式

#### 7.2.1 `index.json` — 全局索引

```json
{
  "version": 1,
  "updatedAt": "2026-07-06T12:00:00Z",
  "pages": [
    {
      "pageId": "a1b2c3d4e5f6...",
      "title": "页面标题",
      "icon": "📝",
      "coverUrl": null,
      "lastSync": "2026-07-06T10:30:00Z",
      "childCount": 5,
      "blockCount": 42
    }
  ]
}
```

#### 7.2.2 `meta.json` — 单次同步元数据

```json
{
  "pageId": "a1b2c3d4e5f6...",
  "title": "页面标题",
  "syncedAt": "2026-07-06T10:30:00Z",
  "blockCount": 42,
  "childPages": ["child1_id", "child2_id"],
  "databases": ["db1_id"],
  "errors": []
}
```

#### 7.2.3 `page.json` — 页面主体

```json
{
  "pageId": "a1b2c3d4e5f6...",
  "title": "页面标题",
  "icon": "📝",
  "cover": null,
  "properties": {},
  "blocks": [
    {
      "id": "block-uuid-1",
      "type": "heading_2",
      "content": { ... },
      "children": [...]
    }
  ]
}
```

### 7.3 数据清理规则

```
在同步完成后执行:
1. 列出 json/{page_id}/ 下所有日期子目录
2. 按日期排序
3. 若数量 > 10，删除最旧的 (count - 10) 个目录
4. 更新 index.json
```

### 7.4 读取规则

```
读取某 page 时:
1. 列出 json/{page_id}/ 下所有子目录
2. 按日期降序排列
3. 取第一个（最新日期）作为数据源
```

---

## 10. Notion Block 渲染组件

### 8.1 组件目录

所有文件位于 `src/components/notionBlock/`：

```
notionBlock/
├── index.ts                    # 导出 type→component 映射表
├── NotionRenderer.vue          # 渲染入口（递归）
├── BlockParagraph.vue          # paragraph
├── BlockHeading.vue            # heading_1 / heading_2 / heading_3
├── BlockImage.vue              # image
├── BlockCode.vue               # code（含语法高亮)
├── BlockQuote.vue              # quote
├── BlockBulletedList.vue       # bulleted_list_item
├── BlockNumberedList.vue       # numbered_list_item
├── BlockTodo.vue               # to_do
├── BlockToggle.vue             # toggle
├── BlockDivider.vue            # divider
├── BlockCallout.vue            # callout
├── BlockTable.vue              # table + table_row
├── BlockBookmark.vue           # bookmark
├── BlockVideo.vue              # video
├── BlockFile.vue               # file
├── BlockEmbed.vue              # embed
├── BlockEquation.vue           # equation (KaTeX/MathJax)
├── BlockChildPage.vue          # child_page (链接到阅读页)
├── BlockDatabase.vue           # child_database (简易表格视图)
├── BlockColumnList.vue         # column_list (容器)
├── BlockColumn.vue             # column
└── BlockUnsupported.vue        # 未支持类型占位
```

### 8.2 组件映射表 `index.ts`

```typescript
import BlockParagraph from './BlockParagraph.vue'
import BlockHeading from './BlockHeading.vue'
// ... 其他 import

export const blockComponentMap: Record<string, Component> = {
  paragraph:           BlockParagraph,
  heading_1:           BlockHeading,
  heading_2:           BlockHeading,
  heading_3:           BlockHeading,
  image:               BlockImage,
  code:                BlockCode,
  quote:               BlockQuote,
  bulleted_list_item:  BlockBulletedList,
  numbered_list_item:  BlockNumberedList,
  to_do:               BlockTodo,
  toggle:              BlockToggle,
  divider:             BlockDivider,
  callout:             BlockCallout,
  table:               BlockTable,
  bookmark:            BlockBookmark,
  video:               BlockVideo,
  file:                BlockFile,
  embed:               BlockEmbed,
  equation:            BlockEquation,
  child_page:          BlockChildPage,
  child_database:      BlockDatabase,
  column_list:         BlockColumnList,
  column:              BlockColumn,
}
```

### 8.3 `NotionRenderer.vue` — 渲染入口

```vue
<template>
  <div class="notion-renderer">
    <template v-for="block in blocks" :key="block.id">
      <component
        :is="getComponent(block.type)"
        :block="block"
        :depth="depth"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { blockComponentMap } from './index'
import BlockUnsupported from './BlockUnsupported.vue'

const props = defineProps<{
  blocks: NotionBlock[]
  depth?: number
}>()

function getComponent(type: string) {
  return blockComponentMap[type] || BlockUnsupported
}
</script>
```

### 8.4 组件 Props 统一规范

所有 block 组件接收相同的 props 接口：

```typescript
interface BlockProps {
  block: NotionBlock    // 当前 block 数据
  depth?: number        // 嵌套深度（可选，用于缩进）
}
```

组件内部：
- 如果有 `block.children`，递归渲染 `<NotionRenderer :blocks="block.children" :depth="(depth || 0) + 1" />`

---

## 11. MCP 接口抽象层

### 9.1 `services/mcp.ts`

```typescript
// 所有与 Notion MCP 的通信都通过这个模块

export interface McpConfig {
  apiBaseUrl: string
  apiKey: string
  syncConcurrency: number
  requestDelay: number
}

/**
 * 获取页面 blocks（递归获取所有子 block）
 */
export async function fetchPageBlocks(
  pageId: string,
  config: McpConfig
): Promise<NotionBlock[]>

/**
 * 获取数据库内容
 */
export async function fetchDatabase(
  databaseId: string,
  config: McpConfig
): Promise<NotionDatabase>

/**
 * 测试连接
 */
export async function testConnection(config: McpConfig): Promise<boolean>
```

### 9.2 `services/sync.ts`

```typescript
/**
 * 完整同步一个页面（主入口）
 * 1. 获取页面 blocks
 * 2. 识别子页面和数据库
 * 3. 递归获取
 * 4. 存储
 */
export async function syncPage(
  pageId: string,
  config: McpConfig,
  onProgress: (progress: SyncProgress) => void,
  onLog: (message: string) => void
): Promise<void>

// 进度对象
interface SyncProgress {
  phase: 'fetching' | 'storing' | 'cleanup' | 'done'
  current: number
  total: number
  message: string
}
```

### 9.3 `services/storage.ts`

```typescript
/**
 * 存储同步结果
 */
export async function savePageData(
  pageId: string,
  data: SyncResult
): Promise<void>

/**
 * 读取页面数据（自动取最新日期）
 */
export async function loadPageData(pageId: string): Promise<NotionPage | null>

/**
 * 获取全局索引
 */
export async function loadIndex(): Promise<GlobalIndex>

/**
 * 清理旧版本（保留最近 10 份）
 */
export async function cleanupOldVersions(pageId: string): Promise<void>

/**
 * 获取历史版本列表
 */
export async function listVersions(pageId: string): Promise<string[]>
```

---

## 12. 类型定义

### 10.1 `types/notion.ts`

```typescript
// --- Rich Text ---
export interface RichText {
  type: 'text' | 'mention' | 'equation'
  plain_text: string
  href: string | null
  annotations: {
    bold: boolean
    italic: boolean
    strikethrough: boolean
    underline: boolean
    code: boolean
    color: string
  }
}

// --- Block ---
export interface NotionBlock {
  id: string
  type: string                    // paragraph, heading_1, image, ...
  has_children: boolean
  children?: NotionBlock[]
  // 各 type 的具体数据
  [key: string]: any              // 如 block.paragraph.rich_text
}

// --- Page ---
export interface NotionPage {
  pageId: string
  title: string
  icon: string | null
  cover: NotionCover | null
  properties: Record<string, any>
  blocks: NotionBlock[]
}

export interface NotionCover {
  type: 'external' | 'file'
  url: string
}

// --- Database ---
export interface NotionDatabase {
  databaseId: string
  title: string
  properties: Record<string, any>
  rows: NotionDatabaseRow[]
}

export interface NotionDatabaseRow {
  id: string
  properties: Record<string, any>
}
```

### 10.2 `types/storage.ts`

```typescript
export interface GlobalIndex {
  version: number
  updatedAt: string
  pages: PageSummary[]
}

export interface PageSummary {
  pageId: string
  title: string
  icon: string | null
  coverUrl: string | null
  lastSync: string
  childCount: number
  blockCount: number
}

export interface SyncMeta {
  pageId: string
  title: string
  syncedAt: string
  blockCount: number
  childPages: string[]
  databases: string[]
  errors: string[]
}

export interface SyncResult {
  page: NotionPage
  children: Record<string, NotionPage>
  databases: Record<string, NotionDatabase>
}
```

### 10.3 `types/config.ts`

```typescript
export interface AppConfig {
  apiBaseUrl: string
  apiKey: string
  syncConcurrency: number
  requestDelay: number
}
```

---

## 13. 状态管理

### 11.1 Pinia Store — `stores/config.ts`

```typescript
import { defineStore } from 'pinia'

export const useConfigStore = defineStore('config', () => {
  const config = reactive<AppConfig>({
    apiBaseUrl: '',
    apiKey: '',
    syncConcurrency: 3,
    requestDelay: 300,
  })

  // 从 localStorage 恢复
  function loadFromStorage() { /* ... */ }
  // 保存到 localStorage
  function save() { /* ... */ }
  // 重置
  function reset() { /* ... */ }

  return { config, loadFromStorage, save, reset }
})
```

> **注意**：敏感信息（apiKey）在生产环境应加密存储，但本地工具可以明文存 localStorage。

---

## 14. 开发清单（Checklist）

### Phase 1 — 项目骨架

- [ ] 1.1 初始化 Vite + Vue 3 + TypeScript 项目
- [ ] 1.2 安装依赖：vue-router, pinia, highlight.js, unocss
- [ ] 1.3 配置 UnoCSS（uno.config.ts + Vite 插件）
- [ ] 1.4 搭建完整目录结构（types, services, composables, components, views, stores, notion-parser, log, json）
- [ ] 1.5 配置路由 (4 个路由)
- [ ] 1.6 `assets/styles/variables.css`（仅 CSS 变量，如主题色、间距等）
- [ ] 1.7 配置 Vite 中间件（vite-plugin-notion-api.ts）

### Phase 2 — Notion 解析器 + 日志

- [ ] 2.1 实现 `notion-parser/types.ts`（原始响应类型）
- [ ] 2.2 实现 `notion-parser/rich-text-parser.ts`
- [ ] 2.3 实现 `notion-parser/block-parser.ts`（含列表项合并）
- [ ] 2.4 实现 `notion-parser/page-parser.ts`
- [ ] 2.5 实现 `notion-parser/database-parser.ts`
- [ ] 2.6 实现 `notion-parser/index.ts`（统一导出）
- [ ] 2.7 实现 `services/logger.ts`（日志服务 + 30 日清理）

### Phase 3 — 配置 & 存储

- [ ] 3.1 实现 `types/` 下所有类型定义
- [ ] 3.2 实现 `services/storage.ts`（JSON 文件读写、索引管理、版本清理）
- [ ] 3.3 实现 `stores/config.ts`（配置持久化）
- [ ] 3.4 实现配置页（ConfigView + useConfigLogic）

### Phase 4 — 同步

- [ ] 4.1 实现 `services/concurrency.ts`（并发控制队列）
- [ ] 4.2 实现 `services/mcp.ts`（MCP 调用封装）
- [ ] 4.3 实现 `services/sync.ts`（递归同步逻辑 + 批量同步）
- [ ] 4.4 实现 `composables/usePageHistory.ts`
- [ ] 4.5 实现同步页（SyncView + useSyncLogic）

### Phase 5 — 首页

- [ ] 5.1 实现 `components/common/PageCard.vue`（UnoCSS 原子样式）
- [ ] 5.2 实现首页（HomeView + useHomeLogic）
- [ ] 5.3 瀑布流布局（CSS columns）

### Phase 6 — Notion 渲染组件

- [ ] 6.1 实现 `NotionRenderer.vue` + `index.ts` 映射表
- [ ] 6.2 实现基础 block 组件（Paragraph, Heading, Divider, Quote, Code）
- [ ] 6.3 实现列表组件（BulletedList, NumberedList, Todo）
- [ ] 6.4 实现媒体组件（Image, Video, File, Bookmark, Embed）
- [ ] 6.5 实现布局组件（ColumnList, Column）
- [ ] 6.6 实现特殊组件（Callout, Toggle, Table, Equation, ChildPage, Database）
- [ ] 6.7 实现 `BlockUnsupported` 占位

### Phase 7 — 阅读页

- [ ] 7.1 实现 `components/common/TocTree.vue`（递归目录树）
- [ ] 7.2 实现 `components/common/ResizablePanel.vue`（可拖拽面板）
- [ ] 7.3 实现阅读页（ReaderView + useReaderLogic）

### Phase 8 — 集成 & 测试

- [ ] 8.1 Vite 中间件集成测试
- [ ] 8.2 端到端批量同步流程测试
- [ ] 8.3 首页展示 + 阅读页渲染联调
- [ ] 8.4 日志系统验证（写入 + 清理）
- [ ] 8.5 边界处理：空页面、大页面、网络错误、并发冲突
- [ ] 8.6 版本清理逻辑验证
- [ ] 8.7 UI 调整 & 响应式适配

---

## 附录 A：关键约定

| 约定 | 说明 |
|------|------|
| CSS 方案 | 使用 UnoCSS 原子类，禁止手写 CSS 文件（variables.css / global.css 仅 CSS 变量） |
| 文件命名 | 组件 PascalCase，composable camelCase(use*)，service camelCase |
| Props 类型 | 所有组件 props 必须显式 TypeScript 类型标注 |
| 无 any | 禁止使用 `any`，未知类型使用 `unknown` + 类型守卫 |
| 错误处理 | services 层所有异步函数必须有 try/catch，返回 Result 类型或抛出自定义 Error |
| 日志 | 同步日志统一走 `services/logger.ts`，写入 log/ 目录 |
| 编码 | UTF-8，LF 换行 |

## 附录 B：后端方案 — Vite 中间件

采用 **Vite `configureServer` 中间件**，在开发服务器中注入 API 路由：

```
浏览器(fetch /api/*) → Vite Dev Server → configureServer 中间件
                                              │
                                    ┌─────────┼─────────┐
                                    │                   │
                              mcporter CLI         fs 读写
                           (Notion MCP Server)    (json/ 目录)
```

### B.1 实现方式

在 `vite.config.ts` 中：

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { notionApiPlugin } from './vite-plugin-notion-api'

export default defineConfig({
  plugins: [
    vue(),
    notionApiPlugin(),  // 自定义插件
  ],
})
```

```typescript
// vite-plugin-notion-api.ts
// 通过 configureServer 添加 API 路由
// POST /api/notion/fetch-page   → 调用 mcporter 获取页面内容
// POST /api/notion/test-conn    → 测试 MCP 连通性
// GET  /api/storage/pages       → 读取 json/index.json
// GET  /api/storage/page/:id    → 读取指定页面最新备份
```

### B.2 服务端 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/notion/fetch-page` | 通过 mcporter 获取 Notion 页面 blocks |
| POST | `/api/notion/fetch-database` | 通过 mcporter 获取数据库内容 |
| POST | `/api/notion/test-connection` | 测试 Notion MCP 连通性 |
| GET | `/api/storage/index` | 获取全局索引 |
| GET | `/api/storage/page/:pageId` | 获取页面最新备份数据 |
| POST | `/api/storage/save` | 保存同步结果到 json/ |
| DELETE | `/api/storage/cleanup/:pageId` | 清理旧版本 |
| GET | `/api/storage/versions/:pageId` | 获取历史版本列表 |

### B.3 前端 service 层（不变）

`services/mcp.ts` 和 `services/storage.ts` 通过 `fetch('/api/...')` 调用以上端点，与具体后端实现解耦。

---

*文档结束。AI 开发助手请按照 Phase 1→7 的顺序逐步实现。*
