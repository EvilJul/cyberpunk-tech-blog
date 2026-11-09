## Context

依据 [共享路线图](../../../../docs/product-evolution-plan.md) 与 [发布集成 proposal](../2026-11-09-add-publishing-integrations/proposal.md)。当前工作区有大量未提交实现，以下基线记录于规划阶段；后续已获授权实施。知识图谱工具未能提供有效结果，事实来自明确文件读取：

- `server/index.js` 已托管 dist、公开 API、上传及 SPA 回退；`src/App.jsx` 只有读者路由，已有 basename 支持。
- `server/index-admin.js` 为静态管理及 HTTP 代理，默认 3033 回环；Compose 当前启动 public、admin、每日 backup。
- `server/routes/auth.js` 是 JWT 登录；`/users` 首次事务创建可被任意远程请求触发。`scripts/init-admin.js` 能保留既有用户并拒绝重复初始化。
- `server/routes/articles.js` 直接写 DAO，中文标题默认 slug 可能为空；DAO 更新、分类与标签组合没有完整事务和 revision。`articles` 同时承担草稿及公开内容。
- `admin/index.html` 评论管理占位；公开评论路由仅有提交与读取。设置、主题导入导出、图片裁剪上传等已存在，需逐项迁移。

## Goals / Non-Goals

**Goals:** 一处登录、完整作者工作流、可撤销会话、本地证明首装、工作副本隔离、单 Web 端口、保留既有账号和公开数据，以及供 B 使用的共享文章服务。

**Non-Goals:** 不提交、不开放注册、不新增内容模型或重做读者视觉；不实现集成密钥或 `/api/v1`，不删除媒体，不建立第二套发布逻辑。

## Decisions

### 1. 路由与产品流程

默认 `server/index.js` 在 9098 同源服务读者站点、工作区、API 与媒体。开发 Vite 9099 仅用于热更新，代理 API/上传，同一浏览器 origin 完成操作。保留现有公开 URL。

| 页面 | 行为/接口 |
| --- | --- |
| `/login` | 登录、站内 returnTo；`POST /api/session/login` |
| `/setup` | 安装向导；`GET /api/setup/status`、`POST /api/setup/complete` |
| `/studio`、`/studio/articles` | 作者概览、分页/筛选，`/api/studio/articles` |
| `/studio/editor/new`、`/studio/editor/:id` | 新建和编辑；保存、预览、发布、撤回 |
| `/studio/categories`、`/studio/tags` | 分类标签 CRUD/重命名 |
| `/studio/comments` | 分页待审核/通过/拒绝/删除 |
| `/studio/media` | 上传、复制链接、插入正文；首版无文件删除 |
| `/studio/settings`、`/studio/appearance` | 原设置字段、主题预设/导入导出/背景头像 |
| `/studio/account`、`/studio/logs` | 修改密码、退出；受控日志查询/清空 |
| `/studio/integrations` | 扩展挂载点，B 到位后启用；管理接口 `/api/studio/integrations` 归 B |

首页访客显示“登录”；会话中的管理员显示“写文章/工作台”，已发布文章有编辑快捷入口，直接进入对应 ID 工作副本。非管理员不出现管理操作且服务端返回 403。returnTo 只接受 basename 内的安全相对路径，拒绝外域、协议相对地址和编码逃逸。工作区懒加载，作者背景不干扰编辑；读者页背景、卡片与主题保持原行为。

### 2. 会话、首装与身份边界

新增 sessionDAO/sessionService、Cookie 认证与 CSRF 中间件。随机 32 字节不透明 session ID，数据库只存摘要、user_id、创建/最后活动/绝对到期/撤销时间；默认空闲 12 小时、绝对 7 天，过期按请求拒绝并定期清理。HttpOnly、SameSite=Lax、生产 Secure、无 Domain，Path 为规范化部署前缀。每请求检查当前用户与角色；登录轮换 ID；退出撤销当前会话，改密码验证旧密码并撤销该用户全部会话，需重新登录。Cookie 登录响应不返回 JWT。

`/api/session/me` 返回用户与 session 绑定 CSRF token（token 仅内存保存），`POST /api/session/logout`、`POST /api/session/password` 使用 CSRF。所有 `/api/studio/*` 写请求包括 multipart 必须会话+CSRF+精确可信 Origin；同源 Referer 仅在缺 Origin 的已定义浏览器场景兜底，二者缺失拒绝。登录也检查来源，退出前保持未保存内容提醒。响应 no-store；管理页和身份响应 noindex，站点 sitemap 不收录。

空库由新增 `scripts/create-setup-token.js` 本地生成一次性随机 token，仅在该 CLI 输出或 0600 本地文件显示，不写 URL/通用日志/公开 status；DB 存摘要、30 分钟有效期、消费时间。status 只报告是否需初始化。complete 接收请求体 token 与首位账号，在 BEGIN IMMEDIATE 下重查空库、有效摘要并原子建管理员+消费 token；错误统一拒绝。CLI 重发废弃旧 token。已有任意用户则关闭首装，保留原 ID、角色和 bcrypt 哈希；无管理员的异常库走本地运维修复，不重开匿名初始化。原 `/api/auth/users` 空库远程抢注路径关闭，本地 init-admin 和浏览器 setup 共用首装事务，管理员后续建用户仍需管理授权，不提供注册页面。

统一主体接口 `{kind, id, role?, scopes, authMethod}`。本变更仅生产 `kind=user`（session 或 legacy-jwt）；B 自己定义 integration 的认证器、scope 与资源归属。`/api/studio/*` 只接受浏览器会话，Bearer 不代替会话；`/api/v1/*` 在 B 启用前 404，未来仅接受 B 验证的 integration Bearer，Cookie 独自无效。不能因为预留主体类型就接受未实现的 key 字符串。暂保 req.user 适配，逐步令业务服务只消费显式 principal 与授权能力。

### 3. 工作副本、发布快照和统一并发版本（本变更所有）

保留 `articles` 的历史 ID/slug/已发布快照，增量添加整数 `revision NOT NULL DEFAULT 1` 及可空 `published_revision`（已发布历史文章初始化为1，其余为null；每次公开快照提升设为本次新revision）。新增 `article_drafts(article_id PRIMARY KEY REFERENCES articles, payload_json, base_published_revision, updated_at)`，完整保存标题、正文、摘要、作者、候选 slug、分类名、标签名等编辑字段，JSON 有服务端 schema 校验。新草稿可有 `articles.status=draft` 的身份占位，公开查询仍按 published 过滤；既有草稿迁移到工作副本。已发布文章首次编辑按公开快照初始化编辑缓冲，首次保存才持久化工作副本。

revision 是整篇资源的并发时钟，保存、发布、撤回均在事务中 CAS 检查并加一；公开内容时间和 SEO 仅在公开快照改变时更新。工作副本保存只改变工作副本与 revision，不改变公开标题/正文/slug、article_tags、分类关系、FTS 或公开更新时间。公开列表、详情、搜索、RSS/sitemap/统计均不得连接工作副本。全局 revision 因保存变化不表示公开内容发生改变；公开缓存不能以它替代公开更新时间。

共享 `server/services/articleService.js` 提供 getWorkingCopy/createDraft/saveDraft/publish/unpublish/deleteArticle，业务逻辑不依赖 req/res；路由只做身份、输入及响应适配。文章服务执行 schema、状态、slug、字段白名单、授权和事务；分类/标签实体及关联只在发布快照提升时物化，避免草稿标题或标签通过公开目录泄漏。删除/重命名分类标签继续保持原事务一致性，发布遇到已删除/改名引用要求刷新确认，不静默复活旧名称。

| 动作 | 前置权限及条件 | 结果 |
| --- | --- | --- |
| Save | 作者管理权；未来 B `articles:write`；已有资源需 If-Match | 工作副本保存，公开内容不变；revision+1 |
| Publish | 作者管理权；未来 B 独立 `articles:publish`；If-Match | 原子校验工作副本并提升至 articles、分类标签、FTS、公开时间；revision+1；与当前公开快照完全相同的重复发布为no-op，返回当前revision |
| Unpublish | 同发布权限；If-Match | published 转 draft，公开读取 404，保存完整工作副本；revision+1；已撤回且条件匹配时no-op |
| Delete | 浏览器作者管理权；If-Match+确认 | 事务删除文章和相关记录；B 首版不提供删除 |

浏览器具体接口：`POST /api/studio/articles` 创建草稿；`GET /api/studio/articles/:id` 返回工作副本、公开状态和 revision；`PUT /api/studio/articles/:id/draft` 保存；`POST /:id/publish`、`POST /:id/unpublish`、`DELETE /:id`（均位于 `/api/studio/articles` 下）。更新、发布、撤回和删除强制 If-Match，使用强 ETag `"<revision>"`；不存在返回 404、缺条件 428、过期 412（含当前 revision）、字段/slug冲突 409 或校验 400。拒绝 `If-Match:*` 绕过。只有首次创建无需条件；重复创建不自动盲重试。返回 `{error:{code,message,details},request_id}` 错误，前端保留缓冲并提示比较/重载/另存，不自动覆盖。

创建 slug：有显式输入则规范化并验证；无输入则采用非空 Unicode 标题 slug，纯标点等降级 `article-<UUID>`；创建后标题改变不自动改 slug。生成候选冲突追加 UUID 短后缀并重试唯一约束，显式重复 slug 返回 409 `SLUG_CONFLICT`。既有空值或非标准历史 slug 不批量修正；对新建/显式修改应用规则。修改已发布 slug 要二次确认“旧地址会失效”，只在发布事务生效；本轮不自动改旧 URL，不新增隐式跳转别名。

B 消费以上服务和 revision；idempotency 记录及来源映射归 B，同键异 payload 固定 409，过期 If-Match 固定 412、缺条件固定 428。来源唯一键必须 `(integration.id, external_id)`，不能绑定 key.id 或自由 source 字符串，轮换 key 不改变归属。B 的 write-only 保存已发布文章必须仍只更新工作副本，不能通过 status、publish_date、slug 等字段间接发布。

### 4. 编辑恢复与管理能力

首版采用明确“保存草稿/发布”操作；自动行为仅保存本地恢复，不自动推送到公开快照。编辑器状态分“未保存、本机恢复已保存、服务端草稿已保存、发布成功、冲突”，响应必须匹配请求时的编辑序号才能清除 dirty，保存期间继续输入仍保留。离线/401/413/上传失败保留文字；不会自动重复发布。刷新、离开、切账号前提示；恢复记录按账号 ID+文章 ID/新文临时 UUID 隔离，包含 revision/时间。恢复前明确确认，不能直接覆盖服务器；公共设备退出提供清除本机草稿，默认清除并先提供导出，保留选项需用户确认。存储不可用时提示并提供复制/导出。

Markdown 编辑和预览共用现有安全渲染器；上传保留 5MB、实际解码、像素上限及图片裁剪，返回地址经 basename 正确解析，失败不插入坏链接。媒体页首版只上传/选取/复制 URL，没有删除接口，不扫描删除孤立文件，现有背景/头像/正文引用保持可用。

评论管理 `/api/studio/comments` 分页筛选，`PATCH /:id` 状态只允许 pending/approved/rejected，`DELETE /:id` 先确认。公开展示必须整条祖先链均 approved，否则整个子树隐藏；父评论拒绝后不强改孩子状态，恢复父评论时已批准子树可再次显示。删除沿用现有外键级联，UI 提示删除全部后代；返回 affectedCount。审核接口管理员专用，公开 DTO 不含邮箱，不改变匿名 pending 与限流规则。

迁移设置全部字段（含简介/社交链接/头像/侧栏/页大小、主题颜色字体圆角/特效/背景、主题 JSON 导入导出/重置），保存有可见成功/失败；SettingsProvider 唯一来源，保存后统一失效刷新。日志功能独立受权，脱敏且不显示 session/setup/API key。集成页面仅预留挂载，不出现“已可用”空按钮。

### 5. 旧 JWT 与 3033 安全过渡

新增 `LEGACY_JWT_ENABLED=true` 兼容已有机器；旧 `/api/auth/login`、refresh 暂留，文档标记迁移，工作区一律不用。既有 `/api/articles`、`/api/upload` Bearer 调用保持字段/状态语义，旧已授权机器直接更新公开内容仅作为明确记录的临时例外，通过相同服务执行一次 save+显式 legacyPublish，整体事务一次 revision 增量；绝不能给 B 复用该权限。legacy-jwt PUT/DELETE 在过渡期允许不带 If-Match，服务端原子获取最新版本执行并记录 legacy-unconditional 警告；自带旧条件仍 412，未来关闭兼容后全部必要条件缺失 428。浏览器新接口始终强条件。

退出浏览器仅撤销会话，历史 JWT 的撤销能力不能假称存在；改密码新增用户 tokenVersion 校验使已有旧 JWT（默认版本0）失效，refresh 每次校验当前用户版本，token 新签发带版本。上线不旋转 JWT_SECRET，保留已有机器直到 B 上线并逐调用方切换。公布兼容访问统计，不记录原令牌。关闭 JWT 必须 B 可用、调用清单迁移且窗口内无旧请求，再明确操作开关。

3033 服务移入 `legacy-admin` profile，仅显式开启且回环暴露。默认 Compose 仍运行 public+backup，只有一个 Web 端口；backup 无监听并保留现有每日调度、七天保留、共享持久卷。`npm start` 一个应用服务；`npm run admin` 标为短期兼容。旧 UI 不接受新 Cookie 跨端口授权。兼容期代理保留分页、类型、上游状态、multipart 流与10秒超时。

### 6. 预计文件变更与所有权

| 路径（相对仓库） | 未来实施内容 |
| --- | --- |
| `src/App.jsx`、`src/contexts/AuthContext.jsx`（新） | 分离读者布局/工作区路由，作者态和安全跳转 |
| `src/components/studio/`（新） | Shell、Editor、文章/分类/标签/评论/媒体/设置/外观/账号/日志页；B 只拥有其 integrations 子目录 |
| `src/utils/studioApi.js`（新）、`src/utils/api.js` | 同源 session+CSRF、条件请求、错误 DTO、base URL |
| `src/components/blog/ArticleDetail.jsx`、`src/components/layout/` | 首页入口、编辑快捷入口，保留阅读交互 |
| `server/routes/session.js`、`setup.js`、`studio.js`（新） | 独立命名空间与浏览器授权 |
| `server/services/sessionService.js`、`setupService.js`、`articleService.js`（新） | 会话/首装/文章唯一业务实现 |
| `server/middleware/auth.js`、`csrf.js`（新） | principal 适配、会话、旧 JWT 版本校验、来源和CSRF |
| `server/db/index.js`、`migrations/authorWorkspace.js`、`draftDAO.js`、`sessionDAO.js`（后三者新） | 增量迁移、会话、工作副本及 CAS；schema 由 A 单一所有者修改 |
| `server/db/articleDAO.js`、`otherDAO.js` | 公共快照读取、事务写、评论祖先过滤/审核、用户版本 |
| `server/routes/articles.js`、`comments.js`、`upload.js`、`settings.js`、`logs.js`、`auth.js` | 薄适配、原公开契约保留、旧接口兼容 |
| `server/index.js`、`server/index-admin.js` | 路由装配、缓存/robots、兼容代理 |
| `scripts/create-setup-token.js`（新）、`scripts/init-admin.js` | 本机凭据及共用首装事务 |
| `vite.config.js`、`.env.example`、`docker-compose.yml`、`Dockerfile`、`package.json` | 子路径代理、默认服务、兼容profile及脚本说明 |
| `README.md`、`docs/operations.md`、`tests/` | 迁移/回滚、隔离验收；具体测试见任务 |

B 的 `/api/studio/integrations` 路由在 A 提供的 studio router 扩展点挂载；`/api/v1`、密钥格式、scope、来源映射、幂等与 OpenAPI 全归 B。A 不创建接受占位 key 的认证器。既有规格 secure-api-access、blog-navigation、production-operations 仅由 A 修改；B 已移除重叠条目，仅新增独立集成能力。

## Risks / Trade-offs

- [旧无条件 JWT 可覆盖新编辑] → 明确过渡例外、记录调用、缩短窗口；现代会话与B严格 CAS。
- [工作副本字段泄漏/写权限间接发布] → 所有公开路径只读快照，发布独立授权；测试覆盖 FTS/目录/SEO。
- [本地恢复含私密内容] → 账号隔离、退出前导出/清除提示，正文不进遥测。
- [子路径 Cookie/上传或代理错误] → `/` 与 `/blog/` 双验收，可信代理精确配置，Cookie path一致；禁止前缀外隐式重复挂载。
- [旧版本忽略 revision 新表] → 回滚冻结写入，禁止新旧写入者混跑。
- [新增编辑器成本] → 复用 Markdown 渲染、设置与上传规则，分阶段对照旧功能。

## Migration Plan

1. 实施前记录当前工作区功能、调用方、数据目录和旧版本镜像；在独立临时数据目录在线备份并演练，不在真实库上跑测试。
2. 添加幂等 schema_migrations 版本：sessions/setup_tokens、用户 token_version、articles revision、article_drafts；既有文章 revision=1，现有草稿复制为工作副本；published 的字段/slug/时间/标签与FTS原样保持；既有用户不重建。迁移失败整个事务回滚并阻止启动写服务。
3. 对恢复副本比对用户 ID/哈希、文章 ID/slug/内容、标签分类、评论、统计、主题和上传；连续执行迁移两次无额外改变，验证 FK 和完整性。
4. 先上线共享服务与兼容接口，再上线工作区路由和会话；空库才运行本地 token CLI。新旧服务不得使用不同库；旧写入已接新服务后才允许短期双入口。
5. 确认单源浏览器全链路和子路径后改默认 Compose：public 与 backup 继续启动，admin 仅 profile；重建确认每日 backup 仍产出且保留规则不变。生产HTTPS用 Secure cookie，本地HTTP仅显式开发配置允许。
6. B 上线并迁完调用方后再关闭 legacy JWT/移除admin；这不是 A 上线先决条件。每阶段记录可回滚镜像、schema版本、备份和验收结果。
7. 优先回退到理解新 schema 的兼容版本；若只能退到旧版本，停止所有写入/backup调度，导出上线后数据，恢复上线前成套 SQLite（含WAL一致性）和配置快照，明确丢失窗口且保留上线后副本。上传文件保留超集，不删除新媒体；校验账号、URL、计数、主题后再恢复服务与原每日备份。不得让旧写入程序继续操作新工作副本库。

## Open Questions

以下为非阻塞选择，按默认值可实施：

1. 会话时长是否调整？默认空闲12小时/绝对7天。
2. legacy JWT 何时关闭？默认 B 验收和调用方迁移完成后，由运维记录具体日期；不预设自动失效日。
3. 已发布 slug 显式修改是否未来加旧URL别名？本轮只二次确认，不追溯修改历史slug，别名后续独立规划。

已决定事项不再悬置：无公众注册、无媒体删除、备份默认保留、工作副本独立、412/428/409、集成ID命名空间、三个既有规格归A。idea3的布局/配色/动效只由独立视觉讨论材料处理。
