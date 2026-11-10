# Proposal: studio-ui-redesign

## Why

`/studio` 作者工作台目前是无信息架构的基础 HTML 管理页面观感：最大宽度 1200px 悬浮在读者背景之上、十余项导航平铺一排、链接统一样式无层级、概览统计沿左侧堆叠、通用元素选择器互相牵连。用户要求系统改善整体观感，使其成为清晰、紧凑、适合长期写作的现代内容工作室；主线是"内容管理 → 写作 → 保存 → 明确发布"，不是数据大屏。实施依据为 `docs/studio-ui-redesign-glm.md`（2026-11-10，已确认的设计方案）。

## What Changes

- 新增工作台独立外壳：全屏深石墨背景（不透明、阻隔读者背景与主题）、左侧 224px 分组导航（内容/站点/系统）、64px 轻量顶栏、统一 PageHeader，去除 1200px 居中上限。
- 新增局部设计令牌 `--studio-*`（背景/表面/边界/文字/强调/状态色），全部限定在工作台范围内，不引用可被读者主题覆盖的 `--theme-*`。
- 概览页重构为四张等权重统计 + 次级"内容组织"区域 + 分层"开始创作"操作区，仅展示现有接口真实数据。
- 文章管理改为结构化列表（标题/状态/元数据/操作）+ 工具区（搜索/状态筛选），移动端转纵向条目。
- 编辑器重排为顶部操作栏 + 中央写作区 + 280–320px 属性区；保存/预览/发布层级分离，状态区区分七种保存状态；全部现有业务保护（恢复、冲突、上传、导航保护、slug 确认）原样保留。
- 分类、标签、评论、媒体、站点设置、外观、账号、日志、发布集成按同一组件体系重排布局与状态呈现，不删功能、不加字段。
- 响应式三档（≥1200 / 768–1199 / <768），移动端导航抽屉支持 Esc、焦点约束与恢复。
- 提取公共组件（PageHeader/Button/Field/Notice/EmptyState/Dialog/Pager 或局部样式类），逐步替换 `.studio header/nav/aside` 宽泛选择器为职责类名。
- 登录与首次安装页仅做视觉一致性处理，不改认证流程。
- 不引入新框架、UI 库、图表库、富文本编辑器、数据库迁移或 API；不新增读者端或后台主题切换。

## Capabilities

### New Capabilities

- `studio-workspace-ui`: 作者工作台界面框架与各管理页的信息架构要求——独立外壳与分组导航、设计令牌与读者主题隔离、响应式与移动抽屉、页面级布局（概览/文章/编辑器/各管理页）、公共组件与可访问性、以及"业务行为不退化"的界面侧约束。

### Modified Capabilities

（无——`author-workspace`、`browser-author-sessions`、`shared-article-writing`、`publishing-integrations` 等现有能力的需求不变；本改造是不改变业务契约的界面重构，其不可退化项作为新能力的约束记录。）

## Impact

- **代码**：`src/components/studio/studio.css`（主要替换目标）、`StudioLayout.jsx`、`StudioOverview.jsx`、`ArticleManager.jsx`、`ArticleEditor.jsx`、`ManagementPages.jsx`、`IntegrationsPage.jsx`；`src/index.css` 需局部覆盖核对（不删全局规则）。
- **测试**：`tests/author-workspace-ui.test.js`、`tests/studio-management-ui.test.js`、`tests/studio-integrations-ui.test.js`、`tests/author-subpath.test.js` 中 DOM 定位器可能需更新，但必须保留验证的实际行为。
- **不受影响**：读者站组件、API 契约（含 `docs/api/publishing-v1.openapi.yaml`）、数据库、认证与会话机制、`studioApi.js` 请求层。
- **风险**：`ManagementPages.jsx` 多页共用一文件（需串行或先拆分职责）；编辑器业务保护密集（需单独实施与评审）；当前工作区已有 README、读者导航、探索、搜索及测试修改，不得回退。
