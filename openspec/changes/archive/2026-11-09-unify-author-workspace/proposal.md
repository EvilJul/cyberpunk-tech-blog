## Why

当前读者站点、静态管理台及双服务部署割裂，作者无法从首页直接进入完整写作流程；首用户初始化缺少本地持有证明。统一同源作者工作区，既减少部署负担，又为后续发布集成提供可靠的文章服务和并发控制基础。

## What Changes

- 首页提供登录、作者工作区及文章编辑快捷入口；新增 React `/login`、`/setup`、`/studio/*`，不开放公众注册。
- 默认单源、单应用监听端口 9098；React 工作区替代静态管理台，保留文章 CRUD、分类、标签、设置、主题、图片上传和日志，补全评论审核。
- 浏览器使用可撤销的不透明 HttpOnly Cookie 会话与 CSRF；退出和修改密码撤销会话。首装要求一次性本地 setup token，既有管理员账号、密码哈希和业务数据保留。
- 在本变更内抽取共享文章服务，事务化分类标签写入，引入 revision 乐观锁、明确的草稿保存与本地恢复。
- **BREAKING**：默认不再启动 3033 管理服务；通过显式兼容配置暂留旧管理台与机器 JWT。浏览器会话不下发 JWT，旧机器调用在发布 API 就绪前保持可用；关闭兼容须单独验收。
- 为后续集成管理页保留工作区扩展点；集成凭据、权限 scope 定义及发布 API 由独立集成变更负责。内容视觉重设计（idea3）只讨论，不在本变更实施。

## Capabilities

### New Capabilities

- `author-workspace`: 同源作者入口、完整管理工作流、草稿恢复及集成页挂载点。
- `browser-author-sessions`: 本地令牌首装、可撤销 Cookie 会话、CSRF 与旧 JWT 兼容过渡。
- `shared-article-writing`: 共享文章服务、事务写入、revision 冲突和公共读取兼容。
- `comment-moderation`: 管理员分页审核、状态切换与删除评论。

### Modified Capabilities

- `secure-api-access`: 将统一管理权限改为会话或兼容 Bearer，并收紧首用户创建边界。
- `blog-navigation`: 默认 React 工作区替代静态管理入口，保留过渡代理约束。
- `production-operations`: 默认单应用服务单暴露端口，旧管理台按 profile 启用，现有每日备份任务继续默认运行。

## Impact

涉及 `src/App.jsx`、工作区新组件、认证上下文/API 客户端、文章快捷入口；`server/routes/`、`server/middleware/auth.js`、新会话与文章服务、DAO 和增量迁移；`vite.config.js`、Compose、镜像、环境示例和运维文档。新增会话表、初始化状态、独立文章工作副本及整数 revision；不重建用户或业务表，不移动现有数据目录。现有公开文章 URL、分页、搜索、分类标签、统计和上传地址维持兼容。

最初规划阶段仅生成本目录产物；后续用户已授权多 agent 实施。实施以当前未提交工作区为基线，保留已有改动；真实业务数据迁移、生产部署与提交不由本次本地验收自动授权。

共享路线图：[产品演进计划](../../../../docs/product-evolution-plan.md)。并行计划：[发布集成](../2026-11-09-add-publishing-integrations/proposal.md)。本变更负责三个既有 capability 的 MODIFIED；发布集成只新增自身规格。
