# 37 项优化审计

最终集成验收见 [实施验收记录](implementation-verification.md)。

审计日期：2026-11-09。基线固定为 `c9017c04bfd0f26f65c45cd7dac0ed689689198a`，通过 `git show HEAD:<path>` 读取原始跟踪代码，当前列来自本次共享工作区源码快照。其他代理仍在实现，当前状态可能随后变化。指南是待核对的问题清单，不是运行结果。

证据等级：**运行通过**仅指本代理执行的隔离 `node --test tests/security.test.js`；**源码已实现**表示读到实现但没有由本代理完成对应端到端验收；**部分/待验收**表示仍有具体缺口或未验证环节。其他 `tests/*.test.js` 的存在不代表本代理运行过。未运行全量测试、构建、浏览器、容器、线上或恢复演练。所有路径均相对仓库根目录。

| ID | HEAD 基线事实与路径 | 当前源码/路径及状态 | 本代理验证与剩余验收 |
| --- | --- | --- | --- |
| SEC-01 | `server/middleware/auth.js` 有硬编码 Basic 分支，JWT 直接信任 claims | 同路径仅 HS256 Bearer，并以 UserDAO 查询当前身份与角色 | **运行通过**：Basic 拒绝、错签名/过期/算法错误/不存在用户/错误 ID 类型 token 拒绝，降权及删除生效 |
| SEC-02 | `server/routes/articles.js` POST/PUT/DELETE 无权限中间件 | 同路径写操作均有 authMiddleware/adminOnly；`server/routes/upload.js` 自身也保护 | **运行通过**：文章 POST、multipart 匿名 401、普通角色 403，管理员文章创建及真实上传成功；PUT/DELETE 权限为源码检查 |
| SEC-03 | `server/routes/comments.js` 原样接收字段，无专属限流；公开 DAO 返回全部状态 | 同路径校验类型、trim 后长度、邮箱、发布状态、同文章已审父评论；限流；GET 仅 approved 且去邮箱 | **部分运行通过**：非法类型/草稿/第 11 次拒绝、pending 隐藏；恶意 HTML 作为文本保留。浏览器 XSS 执行未测；指南建议存储转义不采用，React 文本边界转义避免双重编码 |
| SEC-04 | `server/routes/stats.js` 同步 JSON 读改写、无专属限流/去重；外层已有 generalLimiter，并非完全无限制 | `server/db/statsDAO.js`、`server/routes/stats.js` SQLite 原子计数、来源 HMAC 去重与写限流 | **源码已实现**；并发、重复点赞、重启持久性由父任务验收 |
| SEC-05 | `server/index-admin.js` cors()、0.0.0.0、独立匿名上传及无鉴权代理；但 HEAD 公共服务上传挂载已有 auth/admin | 管理服务默认回环、来源白名单、代理鉴权、登录/首次用户入口放行；上传流式代理 | **源码已实现**；本代理未运行代理/CORS 测试，父任务拥有该文件 |
| SEC-06 | `server/routes/auth.js` 非首次创建未鉴权，哈希 await 前判断首用户 | 同路径哈希后 immediate 事务复核，非首次 admin，角色白名单，哈希前预检 | **运行通过**：两个并发请求仅一个 201，另一个 401，库中仅一个首管理员；尚未做多进程压力测试 |
| SEC-07 | auth/comments 时间戳 ID，articles 时间戳+Math.random | 三路由 randomUUID；既有 ID 查询保持原样 | **运行通过**：新用户/文章/评论 UUID、旧草稿 ID 管理读取；未做大规模碰撞测试 |
| SEC-08 | `server/routes/logs.js` 任意 level/长度，同步写/清空；HEAD `server/index.js` 已要求认证但不要求 admin | logs 路由全操作 admin；白名单、500/2000 字限制，JSON 行串行异步写，5MiB 轮转一份 | **运行通过**：非法输入不创建文件、换行不拆 JSON 行、普通用户不能清空、admin 可清空；轮转阈值和多进程竞争未测 |
| ARCH-01 | `server/index.js` notFoundHandler 先于 SPA fallback | 同路径 HTML GET/HEAD 回退先于 404，排除 api/uploads/assets/扩展名资源 | **源码已实现**；直接刷新、HEAD、API 根路径与缺失资源 HTTP 验收交父任务 |
| ARCH-02 | `src/contexts/SettingsContext.jsx` 与 `src/themes/ThemeProvider.jsx` 各有 fetch/30 秒定时器 | ThemeProvider 消费 useSettings；SettingsContext 保留单个刷新来源 | **源码已实现**；30 秒网络计数和卸载清理未实测 |
| ARCH-03 | `src/App.jsx` selectedArticle state 切换，无 URL 路由 | App 使用 BrowserRouter/Routes；ArticleDetail 按 slug，ArticleList 按 URL 筛选 | **源码已实现**；分享、刷新、历史及子路径部署需浏览器验收 |
| ARCH-04 | `src/components/layout/Header.jsx` 回调导航未由 App 使用 | `src/App.jsx` Layout 实际输出 header/Link/NavLink；旧 Header 组件仍留存 | **部分实现**：用户导航已接通，但没有按原规划改造/复用旧 Header；需确认保留死组件的取舍 |
| ARCH-05 | `admin/index.html` 包含大块 CSS/脚本，单体结构属实；行数不作为功能判断依据 | 同路径引用 `admin/css/` 与 `admin/js/` 功能资源 | **源码已实现**；本代理未运行后台登录/编辑/主题/评论回归 |
| ARCH-06 | `server/index-admin.js` response.json()、丢 pagination、无超时、重复上传实现 | 同路径 http.request 流式透传状态/正文/类型，10 秒计时、502/504，统一公共上传 | **源码已实现**；非 JSON/分页/超时/上传代理由父任务及管理代理负责人验收 |
| FE-01 | `src/components/blog/ArticleDetail.jsx` 按行 JSX，缺完整 GFM/高亮；React 文本输出本身已转义，并非已证实 XSS | `src/components/blog/MarkdownContent.jsx` react-markdown/GFM/highlight/sanitize、skipHtml、复制；`src/index.css` 行号样式 | **源码已实现**；嵌套列表、表格、脚本 URL、代码行号和复制未浏览器实测；数学公式按规格排除 |
| FE-02 | `ArticleCard.jsx` 每卡两条统计 GET；`Sidebar.jsx` 重复文章请求且按分类再请求 | Card 使用列表 views/likes；Sidebar 使用 total prop、分类 count；ArticleDAO 列表聚合统计 | **源码已实现**；10 卡片网络请求预算未录制 |
| FE-03 | `CommentSection.jsx` 提交直接追加 pending，无待审提示/父评论树；服务端也公开 pending | 当前 CommentSection 待审提示、树/回复/错误恢复；comments 路由只公开 approved | **部分运行通过**：服务端 pending 隐藏；前端交互未测。快照中表单 maxLength 80/5000 与 API 50/2000 不一致，需前端负责人调整 |
| FE-04 | App/ThemeProvider 等调试输出；`src/utils/logger.js` 无 token 直接 return，catch 静默，因此指南所称匿名循环 401 在 HEAD 未证实 | logger DEV 输出、匿名 telemetry、去重/防抖/预算、失败不递归；`server/routes/telemetry.js` 限流验证 | **部分运行通过**：匿名合法遥测 202；客户端防抖和失败恢复未实测 |
| FE-05 | `ArticleDetail.jsx` 渲染标题无锚点/目录/回顶部 | MarkdownContent 基于 AST 生成唯一 ID/目录、IntersectionObserver 高亮及回顶部 | **源码已实现**；重复标题、滚动偏移、减少动画偏好未浏览器实测 |
| FE-06 | Detail/Card/Sidebar 硬编码 text-white/dark 类，ThemeProvider 同时设主题变量 | `src/index.css` 增加语义变量覆盖、主题色 Markdown/UI；ThemeProvider 使用设置 | **部分/待验收**：源码有修复，尚无本代理明暗/移动端截图，不判视觉验收通过 |
| FE-07 | `ArticleDetail.jsx` 图片无 lazy/预览，无阅读时长 | MarkdownContent dialog/Escape/恢复焦点/lazy/async；ArticleDetail 至少一分钟估时 | **源码已实现**；键盘焦点、空文/长文/多图未实测 |
| BE-01 | `server/index.js` 直接 listen，无信号关闭数据库处理；db 已 WAL，不等于已发生损坏 | `server/utils/lifecycle.js` 先 server.close 再 db.close，10 秒超时，index 安装 | **源码已实现**；信号/连接排空/重启完整性未实测 |
| BE-02 | 文章 SQLite、统计 routes/stats.js JSON；持久化分裂属实 | `server/db/statsDAO.js`、`migrateStats.js` 统计表/迁移版本/事务迁移，列表聚合 | **源码已实现**；历史 JSON 副本核对、幂等/失败回滚未由本代理运行 |
| BE-03 | articles 列表透传 status，by-id 不查发布状态；slug 已 published；DAO search/getStats/count 无发布限制 | articles 路由公开 published；DAO 默认发布，管理员显式 includeDrafts；categories/tags GET optionalAuth 后按角色传 includeDrafts | **运行通过（文章）**：公开强传 draft 不泄露、详情 404、搜索/summary 无草稿、admin draft 列表及总数含草稿；分类标签为源码检查，待独立运行验收 |
| BE-04 | `db/index.js` 已 foreign_keys=ON，article_tags 已 ON DELETE CASCADE；分类引用无 SET NULL，删除被外键拒绝，不应称必然产生孤儿 | `otherDAO.js` 事务分类置空删除、标签清关联及改名，分类/标签路由管理保护 | **源码已实现**；重复名、事务故障与关联清理交父任务验收 |
| BE-05 | ArticleDAO findAll 已 sanitizeFtsQuery，但 search 原样 MATCH，无中文 LIKE 降级 | DAO sanitize Unicode 词元、同可见性范围 FTS 探测和 LIKE 降级；高级路由复用 findAll | **部分运行通过**：英文搜索不泄露草稿；中文片段、纯符号和分页由数据测试验收 |
| BE-06 | `server/index.js` 有 Express errorHandler，但无进程 uncaughtException/unhandledRejection；并非所有异常均未处理 | lifecycle 为两类致命异常记录并受控非零关闭 | **源码已实现**；致命异常退出码及重启完整性未实测 |
| SEO-01 | HEAD 无 RSS 路由，Footer 无订阅链接；检查跟踪文件集合而非仅当前 public 目录 | `server/routes/discovery.js` published 最新 20 篇、XML 转义/MIME，Footer RSS 链接 | **源码已实现**；XML 解析、20 篇边界及 HTTP MIME 未由本代理运行 |
| SEO-02 | HEAD 无动态 sitemap/robots 路由 | discovery 对全量 published、有效分类标签生成 sitemap，robots 排除 api/admin 并声明 sitemap | **源码已实现**；多页与站点前缀抓取待父任务 |
| SEO-03 | HEAD index.html 静态标题，无文章动态 OG；前端仅 state 导航 | discovery.injectMetadata 原始 HTML 元信息，index 按 published slug 注入；`src/utils/seo.js` 客户端同步 | **源码已实现**；禁用 JS 抓取、文章切换及封面转义未由本代理运行 |
| SEO-04 | HEAD 缺 canonical，但 ArticleDetail 已 article/header，不能称完全无语义标签 | discovery 与 useSeo canonical；App main、Detail time 等语义输出 | **源码已实现**；追踪参数、配置站点与子路径一致性仍需 HTTP/浏览器验收 |
| OPS-01 | index express.static 未设置长期缓存；Express 默认提供 ETag，指南“缺少 ETag”不准确 | index 哈希 assets 一年 immutable、HTML no-cache、uploads 七天且 ETag | **源码已实现**；缓存协商和 304 未由本代理实测 |
| OPS-02 | HEAD index 无 compression 中间件 | index compression() | **源码已实现**；gzip/Vary/不可压缩内容响应待父任务 |
| OPS-03 | HEAD index 无 helmet | index helmet/CSP、字体/图片/WebGL 相关来源配置 | **源码已实现**；真实字体/WebGL/管理页面 CSP 兼容性待联合验收 |
| OPS-04 | HEAD /health 固定 ok/timestamp，无 DB 探测 | index SELECT 1、uptime/rss，失败仅 unavailable 503 | **源码已实现**；数据库失败注入与无敏感泄露待父任务 |
| OPS-05 | `scripts/backup-db.sh` 已存在，但 cp 活跃 DB、仅保留 10 份、无一致性校验/调度 | `scripts/backup-db.js` SQLite online backup、校验/原子 rename/七天严格匹配轮转；backup-daemon 每日调度 | **源码已实现**；持续写入快照、恢复与轮转安全由父任务运行，不称已恢复成功 |
| OPS-06 | HEAD 跟踪文件中无 Dockerfile/Compose | `Dockerfile` 多阶段非 root，`docker-compose.yml` public/admin/backup、共享卷、回环管理端口、健康检查 | **源码已实现**；未构建镜像/启动容器/重建持久化，不称部署通过 |

## 本代理真实执行的验证

`node --test tests/security.test.js`：最新一次 TAP 为 1 test、1 pass、0 fail（一个顺序集成用例包含多项断言）。测试启动临时回环 HTTP listener，使用 mkdtemp 的 BLOG_DATA_DIR，数据库打开后断言路径属于该目录；不访问生产数据。沙箱禁止 listen 时使用已授权的提升运行，仅执行此文件。没有运行父任务的全量测试入口。

当前覆盖：注册竞态、数据库角色及撤销、Basic 拒绝、JWT 错签名/过期/算法错误/异常主体、文章创建和草稿公开隔离/管理员读取与汇总、评论字段和待审隔离/限流、日志字段及无效输入不落盘/管理员清空、合法匿名遥测、真实 multipart 权限拒绝/错误字段/伪 MIME/超限/损坏边界/有效 PNG 转 JPEG。上传拒绝后断言目录没有新增文件。

安全边界复查后修正：Multer 在业务 handler 之前运行，其错误不能被 handler 的 try/catch 捕获；现在 parseImage 回调统一转 400。增加 multipart 字段/part 数与字段大小限制、实际图片解码及四千万像素上限，上传文件名改 UUID。无请求 body 的 auth 输入返回 400。DAO 调整后，管理员列表显式 includeDrafts，summary 同样传 includeDrafts，避免管理员只能看到发布内容。

## 待协调而非验收通过

- category/tag GET 已按 optionalAuth 的数据库角色选择 includeDrafts；本代理不修改其文件，运行计数断言由数据/父任务负责。
- 管理员高级搜索当前仍限定 published；草稿通过管理员列表搜索可见。若要求高级搜索也覆盖草稿，应明确传 includeDrafts 并补测试。
- 评论文本必须保持由 JSX 文本渲染；保存原始字符串不是允许 dangerouslySetInnerHTML。浏览器载荷执行与回复树尚无本代理运行证据。
- 首用户竞态通过同进程两个并发 HTTP 请求验证；跨进程由 SQLite immediate 锁提供实现基础，尚无压力测试结果。
- 限流当前是进程内存窗口，跨副本/重启不共享；日志串行队列也仅在本进程内保证顺序。
- 审计只记录源码快照；父任务最终验收后应补上真实运行命令/输出及尚存缺口，不能用任务勾选或其他测试文件存在替代证据。
