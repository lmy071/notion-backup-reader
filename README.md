# Notion Backup Reader

本地备份 Notion 页面并离线阅读。支持同步、暗色模式、数据库表格、xlsx 导出、Excel 导入。

## 技术栈

- Vue 3 + TypeScript + Vite
- Pinia + Vue Router 4
- UnoCSS 原子样式
- ExcelJS（导出/导入 xlsx）

## 快速开始

```bash
# 安装依赖
npm install

# 复制环境配置
cp .env.development.example .env.development   # 如果有模板
# 或手动创建 .env.development，无需特殊配置

# 启动开发服务器
npm run dev
# 默认 http://localhost:5173
```

### 依赖工具

| 工具 | 用途 | 必须 |
|------|------|------|
| Notion Integration Token | 同步 & 导入页面 | 是 |
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
│   ├── composables/          # useLocalStorage / usePageHistory
│   ├── services/
│   │   ├── mcp.ts            # Notion API 客户端工厂
│   │   ├── sync.ts           # 同步服务（并发控制/递归子树/去重/进度回调）
│   │   ├── storage.ts        # 存储服务（本地 JSON 读写）
│   │   ├── logger.ts         # 同步日志（每日 JSON Lines，保留 30 天）
│   │   ├── concurrency.ts    # 单消费者循环并发控制器
│   │   └── db-import.ts      # Excel 导入服务（解析/校验/写入 Notion）
│   ├── router/               # 路由配置
│   ├── components/
│   │   ├── common/           # PageCard / TocTree / ResizablePanel / ImportLogDrawer
│   │   └── notionBlock/      # 22 个 block 渲染组件 + NotionRenderer 编排器
│   ├── views/
│   │   ├── home/             # 首页：根页面卡片（按 rootPageId 分组，日期选择器）
│   │   ├── sync/             # 同步页：URL 输入/多选/批量同步 + 日志面板
│   │   ├── config/           # 配置页：Token/并发数/间隔/数据库导入开关
│   │   ├── reader/           # 阅读页：分栏目录 + Notion 渲染 + 暗色模式
│   │   └── test/             # 测试页：Notion API 端点调试
│   └── assets/styles/        # variables.css（130+ CSS 变量）+ global.css
│
├── vite-plugin-notion-api.ts # Vite 中间件：12 个 REST 端点
├── json/                     # 同步数据（gitignore）
├── images/                   # 本地图片缓存（gitignore）
└── log/                      # 同步日志（gitignore）
```

## 页面

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | HomeView | 已同步根页面卡片列表，支持删除备份 |
| `/sync` | SyncView | 批量同步，URL 自动解析页面 ID，日志面板 |
| `/config` | ConfigView | Token/并发数/请求间隔/数据库导入开关 |
| `/reader/:pageId` | ReaderView | 分栏目录 + 封面/属性/子页面/反向链接/暗色模式 |
| `/api-test` | TestView | Notion API 端点调试 |

## Vite 中间件端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/storage/index` | 全局索引（首页卡片） |
| GET | `/api/storage/page/:rootPageId/:date/:pageId` | 读取页面 |
| GET | `/api/storage/batch-index/:rootPageId/:date` | 批次索引 |
| POST | `/api/storage/save` | 保存同步结果 |
| GET | `/api/storage/database/:rootPageId/:date/:pageId/:db` | 读取数据库 |
| GET | `/api/storage/backlinks/:rootPageId/:date/:pageId` | 反向链接 |
| GET | `/api/storage/versions/:rootPageId` | 版本列表 |
| DELETE | `/api/storage/remove/:rootPageId` | 删除根页面备份 |
| DELETE | `/api/storage/cleanup/:rootPageId` | 清理旧版本 |
| POST | `/api/storage/append-log` | 追加同步日志 |
| GET | `/api/images/:rootPageId/:fileName` | 提供本地图片 |
| POST | `/api/images/import` | 暂存导入图片 |
| POST | `/api/db-import/create-page` | 创建数据库页面（绕 CORS） |
| POST | `/api/notion/test-connection` | 测试 Notion 连接 |
| POST | `/api/notion/fetch-page` | 获取页面数据 |
| POST | `/api/notion/fetch-block-children` | 获取 block 子节点 |
| POST | `/api/notion/fetch-database` | 查询数据库 |
| POST | `/api/notion/fetch-database-schema` | 获取数据库 schema |
| POST | `/api/notion/inspect-database` | 检查数据库详情 |

## 功能特性

### 同步
- 输入 Notion URL 自动解析页面 ID
- 批量同步，并发控制（默认 2，可配）
- 递归同步子页面，嵌套 block 子内容完整拉取
- 内联数据库（child_database）自动同步 schema + 数据
- 图片本地化存储，展示/导出使用本地路径

### 阅读
- 分栏布局：左侧可调宽目录（TocTree） + 右侧内容
- 目录点击滚动到对应标题，活跃标题高亮
- 封面横幅 / 面包屑 / 属性面板 / 子页面预览 / 反向链接
- 数据库表格视图：sticky 表头、17 种属性类型、全文过滤、行详情抽屉
- 暗色模式：130+ CSS 变量驱动，`html.dark` 类切换

### 导出 & 导入
- **导出 xlsx**：数据库表格一键导出，支持过滤后导出，图片嵌入单元格
- **导入 xlsx**：Excel 数据导入到 Notion 数据库，按名称匹配列，title 列去重增量导入，files 列支持嵌入式图片（通过 PicList 上传到图床）

## 开发状态

- [x] Phase 1: 核心骨架（Vue/Pinia/Router/UnoCSS）
- [x] Phase 2: notion-parser 独立模块
- [x] Phase 3: 服务层（mcp/storage/sync/logger/concurrency/db-import）
- [x] Phase 4: Vite 中间件（16 REST 端点）
- [x] Phase 5: 视图层（5 页 + 逻辑分离 + 通用组件）
- [x] Phase 6: Notion 渲染组件（22 种 block 类型）
- [x] Phase 7: Notion API 直连（无需 mcporter CLI）
- [x] Phase 8: 暗色模式 / 导出 xlsx / 导入 xlsx
