# Notion Backup Reader

本地备份 Notion 页面并离线阅读。支持同步（SSE 实时日志）、暗色模式、数据库表格、xlsx 导出（列选择）、Excel 导入（增量 / 覆盖）。

## 技术栈

- Vue 3 + TypeScript + Vite
- Pinia + Vue Router
- UnoCSS 原子样式
- ExcelJS（导出/导入 xlsx）
- KaTeX（公式）+ highlight.js（代码高亮）

## 快速开始

包管理器使用 **pnpm**（`packageManager: pnpm@11.5.0`）：

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
# 默认 http://localhost:5173

# 类型检查 / 构建
pnpm check
pnpm build
```

### 代码格式化与提交钩子

simple-git-hooks 提供两个钩子：

- **pre-commit**：对暂存文件运行 lint-staged（ESLint 修复 + Prettier 格式化），随后执行 `vue-tsc --noEmit` 强制类型检查
- **commit-msg**：`scripts/verify-commit.js` 校验提交信息格式（支持中文 type 与描述）

ESLint 使用 flat config（`eslint.config.js`，ESLint 9 + typescript-eslint）。

```bash
# 手动触发（不依赖 commit）
pnpm lint:fix      # 格式化所有源文件
pnpm lint:check    # 仅检查不修改
```

### 依赖工具

| 工具                           | 用途                        | 必须                   |
| ------------------------------ | --------------------------- | ---------------------- |
| Notion Integration Token       | 同步 & 导入页面             | 是                     |
| PicList (本地 127.0.0.1:36677) | Excel 导入 files 列图片上传 | 否（无图片列时不需要） |

## 项目结构

```
├── notion-parser/            # Notion 原始响应 → 领域类型解析（纯数据层）
│   ├── types.ts              # RawBlock / RawRichText / RawPage 类型
│   ├── rich-text-parser.ts   # 富文本解析
│   ├── block-parser.ts       # Block 解析 + 列表合并 + 分栏分组
│   ├── page-parser.ts        # Page 解析（title/icon/cover/blocks）
│   ├── database-parser.ts    # Database 解析
│   └── index.ts              # 统一导出
│
├── src/
│   ├── types/                # 领域类型：NotionBlock / NotionPage / NotionDatabase 等
│   ├── stores/               # Pinia：config store（apiKey/concurrency/delay/enableDbImport）
│   ├── composables/          # useLocalStorage / usePageHistory / useImageViewer / useImportLog
│   ├── services/
│   │   ├── mcp.ts            # Notion API 客户端工厂
│   │   ├── sync.ts           # 同步服务（并发控制/递归子树/去重/进度回调）
│   │   ├── sse-sync.ts       # SSE 同步客户端（逐字日志 + 任务状态推送，可取消）
│   │   ├── storage.ts        # 存储服务（本地 JSON 读写）
│   │   ├── logger.ts         # 同步日志（每日 JSON Lines，保留 30 天）
│   │   ├── concurrency.ts    # 单消费者循环并发控制器
│   │   └── db-import.ts      # Excel 导入服务（解析/校验/写入 Notion）
│   ├── router/               # 路由配置
│   ├── components/
│   │   ├── common/           # PageCard / TocTree / ResizablePanel / ImportLogDrawer
│   │   ├── ImageViewer.tsx   # 图片查看器（TSX + JSX 插件）
│   │   └── notionBlock/      # 22 个 block 渲染组件 + NotionRenderer 编排器
│   ├── views/
│   │   ├── home/             # 首页：根页面卡片（按 rootPageId 分组，日期选择器）
│   │   ├── sync/             # 同步页：URL 输入/多选/批量同步 + SSE 日志面板
│   │   ├── config/           # 配置页：Token/并发数/间隔/数据库导入开关
│   │   ├── reader/           # 阅读页：分栏目录 + Notion 渲染 + 暗色模式
│   │   └── test/             # 测试页：Notion API 端点调试
│   └── assets/styles/        # variables.css（130+ CSS 变量）+ global.css
│
├── scripts/verify-commit.js  # commit-msg 提交信息格式校验
├── vite-plugin-notion-api.ts # Vite 中间件：REST + SSE 端点
├── json/                     # 同步数据（gitignore）
├── images/                   # 本地图片缓存（gitignore）
├── log/                      # 同步日志（gitignore）
└── 设计文档/                  # 设计文档
```

## 页面

| 路由              | 页面       | 说明                                          |
| ----------------- | ---------- | --------------------------------------------- |
| `/`               | HomeView   | 已同步根页面卡片列表，支持删除备份            |
| `/sync`           | SyncView   | 批量同步，URL 自动解析页面 ID，SSE 日志面板   |
| `/config`         | ConfigView | Token/并发数/请求间隔/数据库导入开关          |
| `/reader/:pageId` | ReaderView | 分栏目录 + 封面/属性/子页面/反向链接/暗色模式 |
| `/api-test`       | TestView   | Notion API 端点调试                           |

## Vite 中间件端点

### 存储 / 图片

| 方法   | 路径                                                  | 说明                 |
| ------ | ----------------------------------------------------- | -------------------- |
| GET    | `/api/storage/index`                                  | 全局索引（首页卡片） |
| GET    | `/api/storage/page/:rootPageId/:date/:pageId`         | 读取页面             |
| GET    | `/api/storage/batch-index/:rootPageId/:date`          | 批次索引             |
| POST   | `/api/storage/save`                                   | 保存同步结果         |
| POST   | `/api/storage/save-sse`                               | SSE 同步结果落盘     |
| GET    | `/api/storage/database/:rootPageId/:date/:pageId/:db` | 读取数据库           |
| GET    | `/api/storage/backlinks/:rootPageId/:date/:pageId`    | 反向链接             |
| GET    | `/api/storage/versions/:rootPageId`                   | 版本列表             |
| DELETE | `/api/storage/remove/:rootPageId`                     | 删除根页面备份       |
| DELETE | `/api/storage/cleanup/:rootPageId`                    | 清理旧版本           |
| POST   | `/api/storage/append-log`                             | 追加同步日志         |
| GET    | `/api/storage/logs`                                   | 读取同步日志         |
| POST   | `/api/storage/cleanup-logs`                           | 清理过期日志         |
| GET    | `/api/images/:rootPageId/:fileName`                   | 提供本地图片         |
| POST   | `/api/images/import`                                  | 暂存导入图片         |

### 同步 / 导入 / Notion 代理

| 方法 | 路径                                | 说明                            |
| ---- | ----------------------------------- | ------------------------------- |
| POST | `/api/sync/sse`                     | SSE 同步（逐字日志 + 任务状态） |
| POST | `/api/db-import/create-page`        | 创建数据库页面（绕 CORS）       |
| POST | `/api/db-import/update-page`        | 更新数据库页面（绕 CORS）       |
| POST | `/api/notion/test-connection`       | 测试 Notion 连接                |
| POST | `/api/notion/fetch-page`            | 获取页面数据                    |
| POST | `/api/notion/fetch-block-children`  | 获取 block 子节点               |
| POST | `/api/notion/fetch-database`        | 查询数据库                      |
| POST | `/api/notion/fetch-database-schema` | 获取数据库 schema               |
| POST | `/api/notion/inspect-database`      | 检查数据库详情                  |
| POST | `/api/notion/clear-database`        | 清空数据库全部行（覆盖导入用）  |
| POST | `/api/notion/lock-database`         | 锁定数据库                      |

## 功能特性

### 同步

- 输入 Notion URL 自动解析页面 ID
- 批量同步，并发控制（默认 2，可配）
- **SSE 实时同步**：服务端逐字推送日志 + 单任务状态（pending/fetching/parsing/saving/done/error），支持取消
- 递归同步子页面，嵌套 block 子内容完整拉取
- 内联数据库（child_database）自动同步 schema + 数据
- 图片本地化存储，展示/导出使用本地路径

### 阅读

- 分栏布局：左侧可调宽目录（TocTree） + 右侧内容
- 目录点击滚动到对应标题，活跃标题高亮
- 封面横幅 / 面包屑 / 属性面板 / 子页面预览 / 反向链接
- 数据库表格视图：sticky 表头、17 种属性类型、全文过滤、行详情抽屉
- 图片查看器（ImageViewer）：点击放大浏览
- 暗色模式：130+ CSS 变量驱动，`html.dark` 类切换

### 导出 & 导入

- **导出 xlsx**：数据库表格一键导出，支持过滤后导出、**导出列选择对话框**、图片嵌入单元格、title 合并单元格
- **导入 xlsx**：Excel 数据导入到 Notion 数据库，按名称匹配列，终端式逐字导入日志，支持两种模式 —— **增量导入**（按 id/title 列去重，仅新增不存在的行）与 **覆盖导入**（先清空数据库全部行再全量导入）；files 列支持嵌入式图片（通过 PicList 上传到图床）

## 开发状态

- [x] Phase 1: 核心骨架（Vue/Pinia/Router/UnoCSS）
- [x] Phase 2: notion-parser 独立模块
- [x] Phase 3: 服务层（mcp/storage/sync/sse-sync/logger/concurrency/db-import）
- [x] Phase 4: Vite 中间件（REST + SSE 端点）
- [x] Phase 5: 视图层（5 页 + 逻辑分离 + 通用组件）
- [x] Phase 6: Notion 渲染组件（22 种 block 类型）
- [x] Phase 7: Notion API 直连（无需 mcporter CLI）
- [x] Phase 8: 暗色模式 / 导出 xlsx / 导入 xlsx
- [x] Phase 9: SSE 同步 / 覆盖导入 / 导出列选择 / pnpm 迁移 / ESLint flat config
