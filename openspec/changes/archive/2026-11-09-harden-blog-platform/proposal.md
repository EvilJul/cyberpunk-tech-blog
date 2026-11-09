## Why

`docs/optimization-guide.md` 列出博客在权限边界、导航、内容阅读、数据一致性、搜索发现和生产交付上的 37 项优化。需要把指南转为有明确行为契约、依赖顺序与验收任务的实施计划，优先封堵越权和草稿泄露。

## What Changes

- **BREAKING** 移除硬编码 Basic Auth，限制管理服务访问，保护写接口与非首次用户创建。
- 校验评论与日志，统一新实体 UUID，统计迁移 SQLite 并限制刷量。
- 增加可分享文章路由、完整导航和 SPA 回退，统一设置与主题数据源。
- 改善安全 Markdown、评论回复、主题可读性、目录和图片阅读体验，消除 N+1 请求。
- 加固数据库生命周期、分类标签关联与中文搜索；拆分管理静态资源并修复代理。
- 增加 RSS、Sitemap、元信息、缓存压缩、安全头、健康检查、在线备份和容器化。

## Capabilities

### New Capabilities
- `secure-api-access`: SEC-01/02/03/05/06/07/08，权限、输入、日志与身份标识。
- `blog-navigation`: ARCH-01/02/03/04/05/06，路由、设置数据源和管理结构。
- `reading-experience`: FE-01 至 FE-07，内容渲染、请求效率与阅读交互。
- `reliable-blog-data`: SEC-04、BE-01 至 BE-06，统计迁移、发布隔离与生命周期。
- `search-discovery`: SEO-01 至 SEO-04，订阅、索引和分享元信息。
- `production-operations`: OPS-01 至 OPS-06，资源交付、探针、备份与容器。

### Modified Capabilities

无。当前尚无主规格，以上均建立新规格契约。

## Impact

涉及 `src/`、`server/`、`admin/`、`scripts/`、`public/`、构建和部署配置。客户端与管理 API 消费方需要适配统一分页响应和 JWT；统计持久化需要可回滚迁移。实现阶段选择并验证兼容当前 React/Vite/Node 的路由、Markdown、压缩与响应头依赖；实施覆盖应用代码与隔离验收；生产部署和真实数据迁移需按运维说明另行执行。
