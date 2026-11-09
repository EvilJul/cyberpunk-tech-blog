## Why

未来的多平台发布中心需要把本博客作为稳定的发布目标。目前文章与上传接口面向管理员 JWT，缺少独立集成身份、来源映射、修订冲突与可重试协议，直接复用会扩大权限并带来重复文章或本地编辑覆盖。

## What Changes

- 规划独立 `/api/v1` 机器发布协议：自有文章列表、详情、按外部 ID 确定性 upsert、局部更新、显式发布/撤回及实际图片上传。
- 每个集成独立固定来源命名空间及可撤销、仅存摘要的 API key，权限限定为 articles:read/write/publish、media:write；仅操作自身映射文章。
- 草稿默认、共享修订号及 ETag/If-Match、事务唯一映射、24 小时幂等响应重放、防止远端覆盖本地编辑。
- 在 `/studio/integrations` 通过作者工作区浏览器会话管理集成、有效期、轮换与审计；机器令牌不能创建令牌或操作设置、管理接口。
- 实施产出 OpenAPI、curl 文档及迁移、安全、并发验收；规划后已获用户授权实施，最终证据见实施验收记录。
- 不实现多平台中心、第三方平台适配器、远程 URL 抓图、删除/回收站、批量同步、webhook 或定时发布；想法 3 的视觉讨论不属于此变更。

## Capabilities

### New Capabilities

- `publishing-integrations`: 集成身份、浏览器管理、最小权限、密钥生命周期与审计。
- `publishing-target-api`: 版本化文章、媒体、来源映射、并发与幂等协议。

### Modified Capabilities

无。既有 `secure-api-access` 的统一身份权限修改由 `unify-author-workspace` 独占；本变更仅新增两个能力，实施前确认其允许单独启用的受限集成主体，未实现的 key 格式不能成为授权依据。

## Impact

依赖 `unify-author-workspace` 的共享文章服务、修订模型和浏览器会话契约。已读取该变更 proposal 并与 [共享路线图](../../../../docs/product-evolution-plan.md) 对齐；design 中的具体服务签名是待联调契约，不宣称已实现。实施前必须对齐，不能另建并行文章状态或绕过工作区鉴权。

预计涉及 server 路由/服务/鉴权/SQLite 增量迁移、工作区集成页、契约文档和临时数据验收。保留旧 `/api/articles` 与 `/api/upload` 行为，不迁移现有文章归属，不变更历史归档文件。规划阶段写入限本变更目录；后续已授权源码、配置和隔离验收实施，不自动提交、操作真实业务数据或部署生产。
