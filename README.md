# Notion Backup Reader

本地备份 Notion 页面并离线阅读。

## 技术栈

- Vue 3.5 + TypeScript 6.0 + Vite 8
- Pinia 3 + Vue Router 4
- UnoCSS 原子样式

## 快速开始

```bash
npm install
npm run dev
```

## 项目结构

```
├── notion-parser/          # Notion 原始响应 → 领域类型解析器（纯数据层，无框架依赖）
│   ├── types.ts            # RawBlock / RawRichText / RawPage 类型
│   ├── rich-text-parser.ts # 富文本解析
│   ├── block-parser.ts     # Block 解析 + 列表合并 + 分栏分组
│   ├── page-parser.ts      # Page 解析（title/icon/cover/blocks）
│   └── database-parser.ts  # Database 解析
│
├── src/
│   ├── types/              # 领域类型：NotionBlock / NotionPage / NotionDatabase 等
│   ├── stores/             # Pinia：config store
│   ├── composables/        # useLocalStorage / usePageHistory
│   ├── services/           # mcp / storage / sync / logger / concurrency
│   ├── router/             # 路由配置（首页/同步/配置/阅读器）
│   ├── components/
│   │   ├── common/         # PageCard / TocTree / ResizablePanel
│   │   └── notionBlock/    # 20 个 block 渲染组件 + NotionRenderer 编排器
│   ├── views/              # 首页 / 同步 / 配置 / 阅读器（逻辑/视图分离）
│   └── assets/styles/      # variables.css + global.css
│
└── vite-plugin-notion-api.ts  # Vite 中间件：8 个 REST 端点 + MCP 代理占位
```

## 页面

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | HomeView | 已备份页面卡片列表 |
| `/sync` | SyncView | 批量同步，多选+手动输入+历史复用 |
| `/config` | ConfigView | MCP 地址/Token/并发数/请求间隔 |
| `/reader/:pageId` | ReaderView | 可调宽目录侧栏 + Notion 内容渲染 |

## 开发状态

- [x] Phase 1: 核心骨架（Vue/Pinia/Router/UnoCSS）
- [x] Phase 2: notion-parser 独立模块
- [x] Phase 3: 服务层（mcp/storage/sync/logger/concurrency）
- [x] Phase 4: Vite 中间件（8 REST 端点）
- [x] Phase 5: 视图层（4 页 + 逻辑分离 + 通用组件）
- [x] Phase 6: Notion 渲染组件（20+ 种 block 类型）
- [ ] Phase 7: MCP 代理集成（mcporter CLI 对接）
